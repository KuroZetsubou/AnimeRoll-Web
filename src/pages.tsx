import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  api, Entry, Episode, Home, Job, Media, pickSubtitle, PasskeyInfo, Provider, QueueSettings, Series, SourceEpisode, StorageInfo, SourceResult,
  stripHtml, Subtitle, TelegramChannel, TelegramStatus, User,
} from "./api";
import { Badge, Button, Chip, Drawer, Empty, Field, fmtTime, Group, Icon, IconButton, PosterCard, Progress, Segmented, SettingsRow, Shelf, useCompact } from "./ui";

const ALSTATUS: Record<string, string> = { CURRENT: "In corso", PLANNING: "Pianificato", COMPLETED: "Completato", PAUSED: "In pausa", DROPPED: "Abbandonato" };
const meta = (...p: (string | number | undefined | null | false)[]) => p.filter(Boolean).join(" · ");
const gb = (b: number) => (b >= 1 << 30 ? `${(b / 2 ** 30).toFixed(1)} GB` : `${Math.round(b / 2 ** 20)} MB`);
const pct = (e: Episode) => (e.positionSeconds && e.durationSeconds ? (e.positionSeconds / e.durationSeconds) * 100 : undefined);

// ---------- Login ----------
export function LoginPage({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { api.status().then((s) => setRegister(s.needsSetup)).catch(() => {}); }, []);

  const run = async (f: () => Promise<{ accessToken: string; user: User }>) => {
    setError(undefined);
    try { const r = await f(); onLogin(r.accessToken, r.user); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="login">
      <form onSubmit={(e) => { e.preventDefault(); run(() => register ? api.register(username, password) : api.login(username, password)); }}>
        <div className="logo-big">Anime<b>Roll</b></div>
        <p className="sub">Il tuo catalogo anime sul NAS</p>
        <Field label="Username" icon="user" autoComplete="username webauthn" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Field label="Password" icon="lock" type="password" placeholder="••••••••" autoComplete={register ? "new-password" : "current-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button size="lg" full style={{ marginTop: 10 }} disabled={!username || !password}>{register ? "Crea account" : "Accedi"}</Button>
        <Button type="button" size="lg" variant="ghost" full icon="key" onClick={() => run(() => api.passkeyLogin(username || undefined))}>Accedi con passkey</Button>
        {error && <p className="error">{error}</p>}
        <p className="alt">{register ? "Hai già un account? " : "Primo avvio? "}
          <button type="button" onClick={() => setRegister(!register)}>{register ? "Accedi" : "Crea l'account"}</button></p>
      </form>
    </div>
  );
}

// ---------- Home ----------
export function HomePage() {
  const [home, setHome] = useState<Home>();
  const [planning, setPlanning] = useState<Entry[]>([]);
  const [error, setError] = useState<string>();
  const [genre, setGenre] = useState("Tutti");
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    api.home().then(setHome).catch((e) => setError(e.message));
    api.aniListList("PLANNING").then(setPlanning).catch(() => {});
  }, []);

  const inGenre = useCallback((m: Media) => genre === "Tutti" || m.genres.includes(genre), [genre]);
  const genres = useMemo(() => {
    const count = new Map<string, number>();
    [...(home?.trending ?? []), ...(home?.seasonal ?? []), ...(home?.aniListWatching.map((e) => e.media) ?? [])]
      .forEach((m) => m.genres.forEach((g) => count.set(g, (count.get(g) ?? 0) + 1)));
    return ["Tutti", ...[...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g]) => g)];
  }, [home]);
  const featured = useMemo(() => {
    const all = [...(home?.aniListWatching.map((e) => e.media) ?? []), ...(home?.trending ?? [])].filter(inGenre);
    return all.filter((m, i) => all.findIndex((x) => x.id === m.id) === i).slice(0, 5);
  }, [home, inGenre]);
  useEffect(() => {
    if (featured.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % featured.length), 4500);
    return () => clearInterval(t);
  }, [featured.length]);
  const loc = useLocation();
  // Swipe / drag left or right to change the featured title.
  const touch = useRef<number | null>(null);
  const swipe = (dx: number) => { if (Math.abs(dx) > 40 && featured.length > 1) setSlide((s) => (s + (dx < 0 ? 1 : featured.length - 1)) % featured.length); };

  if (error) return <p className="error page">{error}</p>;
  if (!home) return <div className="center">Caricamento…</div>;
  const f = featured[slide % Math.max(1, featured.length)];

  return (
    <main>
      <div className="home-top">
        <Link to="/search" className="pillsearch"><Icon name="search" size={20} />Cerca nella libreria e su AniList</Link>
        <div className="chips">{genres.map((g) => <Chip key={g} on={g === genre} onClick={() => { setGenre(g); setSlide(0); }}>{g}</Chip>)}</div>
      </div>
      {f && (
        <div className="hero-wrap">
          <Link className="hero" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => { if (touch.current != null) swipe(e.changedTouches[0].clientX - touch.current); touch.current = null; }} to={`/anime/${f.id}`} state={{ bg: (loc.state as { bg?: unknown } | null)?.bg ?? loc }}
            style={(f.bannerUrl ?? f.coverUrl) ? { backgroundImage: `url(${f.bannerUrl ?? f.coverUrl})` } : undefined}>
            <div className="body">
              <Badge>In evidenza</Badge>
              <h1>{f.title}</h1>
              <div className="meta">{meta(f.year, f.genres.slice(0, 3).join(" · "), f.episodes && `${f.episodes} episodi`)}</div>
              <span className="btn sm"><Icon name="info" size={16} />Scopri</span>
            </div>
            {featured.length > 1 && <div className="dots">{featured.map((m, i) => <i key={m.id} className={i === slide % featured.length ? "on" : ""} />)}</div>}
          </Link>
        </div>
      )}
      <Shelf title="Continua a guardare">
        {home.continueWatching.map(({ series, episode }) => (
          <PosterCard key={episode.id} landscape to={`/series/${series.id}?play=${episode.id}`} title={series.title} meta={`Episodio ${episode.number}`}
            img={series.bannerUrl ?? series.posterUrl} progress={pct(episode)} />
        ))}
      </Shelf>
      <Shelf title="Stai guardando su AniList">
        {home.aniListWatching.filter((e) => inGenre(e.media)).map((e) => (
          <PosterCard key={e.media.id} to={`/anime/${e.media.id}`} title={e.media.title} img={e.media.coverUrl} meta={`${e.progress}/${e.media.episodes ?? "?"} episodi`} />
        ))}
      </Shelf>
      <Shelf title="Pianificati da vedere">
        {planning.filter((e) => inGenre(e.media)).map((e) => (
          <PosterCard key={e.media.id} to={`/anime/${e.media.id}`} title={e.media.title} img={e.media.coverUrl} meta={meta(e.media.episodes && `${e.media.episodes} episodi`, e.media.genres[0])} />
        ))}
      </Shelf>
      {genre === "Tutti" && (
        <Shelf title="Sul tuo NAS">
          {home.recentlyAdded.map((s) => <PosterCard key={s.id} to={`/series/${s.id}`} title={s.title} img={s.posterUrl} badge={`${s.episodeCount} ep`} />)}
        </Shelf>
      )}
      <Shelf title="Questa stagione">
        {home.seasonal.filter(inGenre).map((m) => <PosterCard key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} meta={m.genres[0]} />)}
      </Shelf>
      <Shelf title="Di tendenza">
        {home.trending.filter(inGenre).slice(0, 10).map((m, i) => <PosterCard key={m.id} rank={i + 1} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} />)}
      </Shelf>
    </main>
  );
}

// ---------- Esplora (AniList by season + genre) ----------
const SEASONS: [string, string][] = [["Inverno", "WINTER"], ["Primavera", "SPRING"], ["Estate", "SUMMER"], ["Autunno", "FALL"]];
const EXPLORE_GENRES = ["Tutti", "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];

function currentSeason() {
  const d = new Date();
  return { season: SEASONS[Math.floor(d.getMonth() / 3)][1], year: d.getFullYear() };
}

function SeasonPicker({ value, onApply, onClose }: { value: { season: string; year: number }; onApply: (v: { season: string; year: number }) => void; onClose: () => void }) {
  const compact = useCompact();
  const [season, setSeason] = useState(value.season);
  const [year, setYear] = useState(value.year);
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i);
  const label = SEASONS.find((s) => s[1] === season)![0];
  const body = (
    <>
      <div className="seasons">
        <div><h4>Stagione</h4>{SEASONS.map(([n, k]) => <button key={k} className={k === season ? "on" : ""} onClick={() => setSeason(k)}>{n}{k === season && <Icon name="check" size={18} />}</button>)}</div>
        <div><h4>Anno</h4>{years.map((y) => <button key={y} className={y === year ? "on" : ""} onClick={() => setYear(y)}>{y}{y === year && <Icon name="check" size={18} />}</button>)}</div>
      </div>
      <Button full style={{ marginTop: 20 }} onClick={() => onApply({ season, year })}>Mostra {label} {year}</Button>
    </>
  );
  return compact ? (
    <div className="fullsheet">
      <div className="page-head"><h1 style={{ fontSize: 28 }}>Scegli stagione</h1><IconButton icon="x" label="Chiudi" onClick={onClose} /></div>
      {body}
    </div>
  ) : (
    <div className="backdrop" style={{ alignItems: "center" }} onClick={onClose}>
      <div className="glassmodal" onClick={(e) => e.stopPropagation()}>
        <div className="page-head"><h2>Scegli stagione</h2><IconButton icon="x" label="Chiudi" onClick={onClose} /></div>
        {body}
      </div>
    </div>
  );
}

export function ExplorePage() {
  const now = useMemo(currentSeason, []);
  const [sel, setSel] = useState(now);
  const [genre, setGenre] = useState("Tutti");
  const [items, setItems] = useState<Media[]>();
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string>();
  const [nas, setNas] = useState<Set<number>>(new Set());
  useEffect(() => { api.library().then((l) => setNas(new Set(l.map((s) => s.aniListId).filter((x): x is number => !!x)))).catch(() => {}); }, []);
  useEffect(() => {
    setItems(undefined); setError(undefined);
    api.aniListBrowse(sel.season, sel.year, genre === "Tutti" ? undefined : genre).then(setItems)
      .catch((e) => { setItems([]); setError(/404/.test(e.message) ? "Esplora richiede la nuova versione del server: aggiorna AnimeRoll sul NAS." : e.message); });
  }, [sel, genre]);
  const label = `${SEASONS.find((s) => s[1] === sel.season)![0]} ${sel.year}`;
  const isNow = sel.season === now.season && sel.year === now.year;

  return (
    <main className="page">
      <h1>Esplora</h1>
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Stagioni da AniList</p>
      <div style={{ marginTop: 16 }}>
        <button className="seasonpill" onClick={() => setPicker(true)}>
          <Icon name="calendar" size={20} color="var(--accent)" /><span className="lbl">{label}</span>{isNow && <Badge tone="teal">In corso</Badge>}<Icon name="chevdown" size={20} color="var(--text-2)" />
        </button>
      </div>
      <div className="chips" style={{ marginTop: 12 }}>{EXPLORE_GENRES.map((g) => <Chip key={g} small on={g === genre} onClick={() => setGenre(g)}>{g}</Chip>)}</div>
      <div className="page-head" style={{ marginTop: 24, marginBottom: 12 }}>
        <h2 style={{ fontSize: 22 }}>{label}</h2>{items && <span className="muted" style={{ fontSize: 13 }}>{items.length} titoli</span>}
      </div>
      {error && <p className="error">{error}</p>}
      {items && items.length === 0 && !error && <Empty icon="calendar">Nessun titolo di questa stagione{genre !== "Tutti" ? ` per “${genre}”` : ""}</Empty>}
      <div className="grid">
        {items?.map((m) => <PosterCard key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} meta={m.genres.slice(0, 2).join(" · ")} badge={nas.has(m.id) ? "NAS" : undefined} />)}
      </div>
      {picker && <SeasonPicker value={sel} onClose={() => setPicker(false)} onApply={(v) => { setSel(v); setPicker(false); }} />}
    </main>
  );
}

// ---------- Cerca (NAS + AniList mixed) ----------
const RECENTS = "animeroll.recentSearches";
const readRecents = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENTS) ?? "[]"); } catch { return []; } };

export function SearchPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [nas, setNas] = useState<Series[]>([]);
  const [all, setAll] = useState<Series[]>([]);
  const [results, setResults] = useState<Media[]>();
  const [recents, setRecents] = useState(readRecents);
  useEffect(() => { api.library().then(setAll).catch(() => {}); }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setNas([]); setResults(undefined); return; }
    setNas(all.filter((s) => s.title.toLowerCase().includes(term.toLowerCase())));
    const t = setTimeout(() => {
      api.aniListSearch(term).then(setResults).catch(() => setResults([]));
      try { const r = [term, ...readRecents().filter((x) => x !== term)].slice(0, 6); localStorage.setItem(RECENTS, JSON.stringify(r)); setRecents(r); } catch { /* private mode */ }
    }, 350);
    return () => clearTimeout(t);
  }, [q, all]);
  const nasIds = new Set(nas.map((s) => s.aniListId));

  return (
    <main className="page">
      <div className="page-head" style={{ gap: 12 }}>
        <label className="input pill" style={{ flex: 1 }}><Icon name="search" size={20} />
          <input autoFocus placeholder="Cerca titoli" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="iconbtn" style={{ width: 32, height: 32 }} aria-label="Cancella" onClick={() => setQ("")}><Icon name="x" size={18} /></button>}
        </label>
        <button style={{ background: "none", border: 0, color: "var(--accent)", fontWeight: 600 }} onClick={() => nav(-1)}>Annulla</button>
      </div>
      {q.trim().length < 2 ? (
        <>
          {recents.length > 0 && <h3 style={{ fontSize: 17, margin: "20px 0 4px" }}>Recenti</h3>}
          {recents.map((r) => <div key={r} onClick={() => setQ(r)} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", color: "var(--text-2)", cursor: "pointer" }}><Icon name="search" size={18} />{r}</div>)}
          <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>I risultati mescolano la libreria NAS e AniList.</p>
        </>
      ) : (
        <>
          {results && results.length === 0 && nas.length === 0 && <Empty icon="search">Nessun risultato per “{q}”</Empty>}
          <div className="grid" style={{ marginTop: 20 }}>
            {nas.map((s) => <PosterCard key={`s${s.id}`} to={`/series/${s.id}`} title={s.title} img={s.posterUrl} badge="NAS" meta={`${s.episodeCount} ep`} />)}
            {results?.filter((m) => !nasIds.has(m.id)).map((m) => <PosterCard key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} badge="AniList" meta={m.year?.toString()} />)}
          </div>
        </>
      )}
    </main>
  );
}

// ---------- Libreria ----------
export function LibraryPage() {
  const [series, setSeries] = useState<Series[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string>();
  const reload = () => api.library().then(setSeries);
  useEffect(() => { reload(); }, []);
  const onFiles = async (files: FileList | null) => {
    const title = prompt("Titolo della serie per questi file?");
    if (!files || !title) return;
    for (const [i, f] of Array.from(files).entries()) {
      setMsg(`Carico ${i + 1}/${files.length}: ${f.name}`);
      await api.upload(f, title).catch((e) => setMsg(e.message));
    }
    setMsg("Caricamento completato");
    reload();
  };
  const L = series.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="page">
      <div className="page-head">
        <h1>Libreria</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <label className="btn sm ghost"><Icon name="upload" size={16} />Carica<input type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => onFiles(e.target.files)} /></label>
          <Button size="sm" variant="secondary" icon="folder" onClick={() => api.scanInbox().then(() => { setMsg("Importazione avviata"); setTimeout(reload, 2500); }).catch((e) => setMsg(e.message))}>Importa</Button>
        </div>
      </div>
      <label className="input pill" style={{ marginBottom: 20 }}><Icon name="search" size={20} /><input placeholder="Filtra la libreria" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {msg && <p className="muted" style={{ marginBottom: 12 }}>{msg}</p>}
      {L.length === 0 ? <Empty icon="folder">Scarica qualcosa sul NAS o metti i file in /media/_inbox e premi Importa</Empty> : (
        <div className="grid">{L.map((s) => <PosterCard key={s.id} to={`/series/${s.id}`} title={s.title} img={s.posterUrl} meta={`${s.episodeCount}${s.totalEpisodes ? `/${s.totalEpisodes}` : ""} ep`} />)}</div>
      )}
    </main>
  );
}

// ---------- Dettaglio ----------
export function TitlePage() {
  const params = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const [media, setMedia] = useState<Media | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [home, setHome] = useState<Home>();
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState<{ url: string; episode?: Episode; resumeAt?: number; subtitles?: Subtitle[] }>();
  const [sources, setSources] = useState(false);
  const [statusSheet, setStatusSheet] = useState(false);
  const [tab, setTab] = useState<"Episodi" | "Simili">("Episodi");
  const [more, setMore] = useState(false);
  const [all, setAll] = useState(false);
  const [note, setNote] = useState<string>();
  const [confirm, setConfirm] = useState<{ kind: "episode"; ep: Episode } | { kind: "series" }>();

  const bg = (loc.state as { bg?: { pathname: string; search?: string } } | null)?.bg;
  const close = () => nav(bg ? `${bg.pathname}${bg.search ?? ""}` : "/");

  const load = async () => {
    let s: Series | null = null;
    let alId = params.aniListId ? Number(params.aniListId) : undefined;
    if (params.seriesId) { s = await api.series(Number(params.seriesId)); alId = s.aniListId; }
    if (alId) {
      setMedia(await api.aniListMedia(alId).catch(() => null));
      setEntry(await api.aniListEntry(alId));
      s = s ?? (await api.seriesByAniList(alId));
    }
    setSeries(s);
    const eps = s ? await api.episodes(s.id) : [];
    setEpisodes(eps);
    setLoaded(true);
    const autoplay = new URLSearchParams(location.search).get("play");
    const ep = eps.find((e) => String(e.id) === autoplay);
    if (ep) {
      // Play once: drop ?play so closing the player (which reloads the page data) doesn't start it again.
      window.history.replaceState(window.history.state, "", location.pathname);
      play(ep);
    }
  };
  useEffect(() => { load(); api.home().then(setHome).catch(() => {}); }, [params.aniListId, params.seriesId]);

  const play = async (ep: Episode) => {
    const s = await api.stream(ep.id);
    setPlaying({ url: s.url, episode: ep, resumeAt: s.resumeAt, subtitles: s.subtitles ?? [] });
  };

  const sorted = useMemo(() => [...episodes].sort((a, b) => a.number - b.number), [episodes]);
  const nextEp = useMemo(() => {
    const inProgress = sorted.find((e) => (e.positionSeconds ?? 0) > 5 && !e.completed);
    if (inProgress) return inProgress;
    const last = sorted.map((e) => e.completed).lastIndexOf(true);
    return sorted[last + 1] ?? sorted[0];
  }, [sorted]);

  const title = media?.title ?? series?.title ?? "";
  // "Simili": AniList's own recommendations.
  const [similar, setSimilar] = useState<Media[] | null>(null);
  const alId = media?.id ?? series?.aniListId;
  useEffect(() => {
    setSimilar(null);
    if (!alId) { if (loaded) setSimilar([]); return; }
    api.aniListRecommendations(alId).then((r) => setSimilar(r.filter((m) => m.id !== alId)));
  }, [alId, loaded]);
  const shown = all ? sorted : sorted.slice(0, 6);
  const desc = stripHtml(media?.description ?? series?.description);
  const banner = media?.bannerUrl ?? series?.bannerUrl ?? media?.coverUrl ?? series?.posterUrl;

  const doDelete = async () => {
    const c = confirm;
    setConfirm(undefined);
    try {
      if (c?.kind === "episode") {
        await api.deleteEpisode(c.ep.id);
        setEpisodes((es) => { const left = es.filter((e) => e.id !== c.ep.id); if (!left.length) setSeries(null); return left; });
      } else if (c?.kind === "series" && series) {
        await api.deleteSeries(series.id); setEpisodes([]); setSeries(null);
      }
      setNote("Eliminato dal NAS");
    } catch (e) { setNote((e as Error).message); }
  };

  const setStatus = async (status: string) => {
    setStatusSheet(false);
    if (!media) return;
    try { await api.setAniListStatus(media.id, status); setEntry(await api.aniListEntry(media.id)); setNote(undefined); }
    catch (e) { setNote((e as Error).message.includes("409") || /collegato/i.test((e as Error).message) ? "Collega AniList dal Profilo" : (e as Error).message); }
  };

  return (
    <aside className="detail">
      <div className="d-banner" style={banner ? { backgroundImage: `url(${banner})` } : undefined}>
        <IconButton icon="left" label="Indietro" filled onClick={close} />
        {nextEp && <button className="playbig" aria-label="Riproduci" onClick={() => play(nextEp)}><Icon name="play" size={28} /></button>}
      </div>
      <div className="d-body">
        <h1>{title}</h1>
        {media?.titleRomaji && media.titleRomaji !== title && <div className="romaji">{media.titleRomaji}</div>}
        <div className="meta" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>{meta(media?.year, media?.genres.slice(0, 3).join(" · "), (media?.episodes ?? series?.totalEpisodes) && `${media?.episodes ?? series?.totalEpisodes} episodi`, media?.averageScore && `★ ${media.averageScore}%`)}</span>
          {sorted.length > 0 && <Badge>Sul NAS</Badge>}
        </div>

        {media && (entry
          ? <button className="al-row" onClick={() => setStatusSheet(true)}><Icon name="link" size={18} color="var(--teal-500)" />
              <span>AniList: guardati {entry.progress}/{media.episodes ?? "?"} · {ALSTATUS[entry.status] ?? entry.status}</span><Icon name="right" size={18} color="var(--text-3)" /></button>
          : <button className="al-row" onClick={() => setStatusSheet(true)}><Icon name="plus" size={18} color="var(--teal-500)" /><span>Aggiungi alla lista AniList</span><Icon name="right" size={18} color="var(--text-3)" /></button>)}
        {note && <p className="error" style={{ marginBottom: 10, fontSize: 13 }}>{note}</p>}

        {nextEp ? (
          <div className="d-actions">
            <Button icon="play" onClick={() => play(nextEp)}>{(nextEp.positionSeconds ?? 0) > 5 && !nextEp.completed ? `Riprendi E${nextEp.number}` : `Guarda E${nextEp.number}`}</Button>
            <Button variant="secondary" icon="search" onClick={() => setSources(true)}>Trova episodi</Button>
          </div>
        ) : loaded && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 14, color: "var(--text-2)", textAlign: "center" }}>Non ancora sul NAS</div>
            <Button full icon="search" onClick={() => setSources(true)}>Trova episodi</Button>
          </div>
        )}

        {desc && <p className={`desc${more ? " open" : ""}`} onClick={() => setMore(!more)}>{desc}</p>}
        <Segmented options={["Episodi", "Simili"] as const} value={tab} onChange={setTab} />
        {tab === "Episodi" ? (
          <div style={{ marginTop: 8 }}>
            {sorted.length === 0 ? <div className="muted" style={{ textAlign: "center", padding: "32px 0", fontSize: 14 }}>Nessun episodio sul NAS</div> : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 0" }}>
                  {series && <Button size="sm" variant="ghost" icon="wrench" onClick={() => api.repairSeries(series.id).then(() => setNote("Riparazione inviata al NAS")).catch((e) => setNote(e.message))}>Ripara serie</Button>}
                  {series && <Button size="sm" variant="ghost" icon="trash" style={{ marginLeft: 8 }} onClick={() => setConfirm({ kind: "series" })}>Elimina serie</Button>}
                </div>
                {shown.map((e) => {
                  const seen = e.completed || (entry != null && entry.progress >= e.number);
                  const p = pct(e);
                  return (
                    <div key={e.id} className={`ep${playing?.episode?.id === e.id ? " active" : ""}`}>
                      <div className={`n${seen ? " seen" : ""}`} onClick={() => play(e)}>{seen ? <Icon name="check" size={18} /> : e.number}</div>
                      <div className="x" onClick={() => play(e)}>
                        <b>{e.title || `Episodio ${e.number}`}</b>
                        <small>{meta(e.durationSeconds && `${Math.round(e.durationSeconds / 60)} min`, `${(e.sizeBytes / 1048576).toFixed(0)} MB`, e.source)}</small>
                        {p != null && !e.completed && <Progress value={p} />}
                      </div>
                      <IconButton icon="wrench" label="Ripara sul NAS" title="Ripara sul NAS: riallinea audio/video e sottotitoli"
                        onClick={() => api.repairEpisode(e.id).then(() => setNote("Riparazione inviata al NAS")).catch((x) => setNote(x.message))} />
                      <IconButton icon="trash" label="Elimina dal NAS" title="Elimina dal NAS" onClick={() => setConfirm({ kind: "episode", ep: e })} />
                    </div>
                  );
                })}
                {!all && sorted.length > 6 && <Button variant="ghost" full style={{ marginTop: 12 }} onClick={() => setAll(true)}>Altri episodi ({sorted.length - 6})</Button>}
              </>
            )}
          </div>
        ) : similar === null ? (
          <div className="muted" style={{ textAlign: "center", padding: "32px 0" }}>Caricamento…</div>
        ) : similar.length ? (
          <div className="shelf" style={{ marginTop: 16, padding: "4px 0 12px" }}>{similar.map((m) => <PosterCard key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} meta={m.year?.toString()} />)}</div>
        ) : <div className="muted" style={{ textAlign: "center", padding: "32px 0", fontSize: 14 }}>Nessun titolo simile</div>}
      </div>

      {confirm && (
        <Drawer title={confirm.kind === "episode" ? "Eliminare l'episodio dal NAS?" : "Eliminare tutta la serie dal NAS?"} onClose={() => setConfirm(undefined)}>
          <p className="muted" style={{ marginBottom: 18 }}>
            {confirm.kind === "episode"
              ? `Il file e i sottotitoli dell'episodio ${confirm.ep.number} vengono cancellati dal NAS e liberano spazio. Per rivederlo dovrai scaricarlo di nuovo.`
              : `Tutti gli episodi di “${title}” vengono cancellati dal NAS. Questa azione non si può annullare.`}
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            <Button full style={{ background: "var(--danger)" }} icon="trash" onClick={doDelete}>{confirm.kind === "episode" ? "Elimina episodio" : "Elimina tutto"}</Button>
            <Button full variant="ghost" onClick={() => setConfirm(undefined)}>Annulla</Button>
          </div>
        </Drawer>
      )}
      {statusSheet && (
        <Drawer title="Stato su AniList" onClose={() => setStatusSheet(false)}>
          {Object.entries(ALSTATUS).map(([k, label]) => (
            <button key={k} className="opt" onClick={() => setStatus(k)}>{label}{entry?.status === k && <Icon name="check" size={20} color="var(--accent)" />}</button>
          ))}
        </Drawer>
      )}
      {playing && (
        <Player key={playing.url} {...playing} title={title} episodes={sorted} next={playing.episode ? sorted.find((e) => e.number > playing.episode!.number) : undefined}
          onClose={() => { setPlaying(undefined); load(); }} onNext={play} />
      )}
      {sources && <SourcesDrawer title={title} aniListId={media?.id ?? series?.aniListId} onClose={() => { setSources(false); load(); }}
        onStream={(url) => { setPlaying({ url }); setSources(false); }} />}
    </aside>
  );
}

// ---------- Player ----------
function Player({ url, episode, resumeAt, subtitles = [], title, next, episodes = [], onClose, onNext }:
  { url: string; episode?: Episode; resumeAt?: number; subtitles?: Subtitle[]; title: string; next?: Episode; episodes?: Episode[]; onClose: () => void; onNext: (e: Episode) => void }) {
  const chosen = pickSubtitle(subtitles);
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [show, setShow] = useState(true);
  const [cc, setCc] = useState(false);
  const [track, setTrack] = useState<number>(chosen ? chosen.index : -1);
  const [list, setList] = useState(false);
  const pip = typeof document !== "undefined" && document.pictureInPictureEnabled;
  const hideTimer = useRef<number>();

  const menuOpen = useRef(false);
  menuOpen.current = list || cc;
  // Controls hide after 3 s, but never while the episode list or the subtitle menu is open.
  const wake = () => {
    setShow(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { if (!menuOpen.current && !ref.current?.paused) setShow(false); }, 3000);
  };
  useEffect(() => { wake(); return () => window.clearTimeout(hideTimer.current); }, []);
  useEffect(() => {
    const v = ref.current;
    if (!v || !episode) return;
    const report = () => { if (v.currentTime > 1) api.progress(episode.id, v.currentTime, v.duration || undefined).catch(() => {}); };
    const timer = setInterval(() => { if (!v.paused) report(); }, 15000);
    v.addEventListener("pause", report);
    return () => { clearInterval(timer); v.removeEventListener("pause", report); report(); };
  }, [episode]);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    Array.from(v.textTracks).forEach((tt, i) => { tt.mode = subtitles[i]?.index === track ? "showing" : "disabled"; });
  }, [track, subtitles]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const v = ref.current; if (!v) return;
      if (e.key === " ") { e.preventDefault(); v.paused ? v.play() : v.pause(); }
      else if (e.key === "ArrowLeft") v.currentTime -= 10;
      else if (e.key === "ArrowRight") v.currentTime += 10;
      else if (e.key === "Escape") onClose();
      wake();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const v = () => ref.current!;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); v().currentTime = ((e.clientX - r.left) / r.width) * (dur || 0); };
  const credits = dur > 0 && dur - t <= 90 && next;

  return createPortal(
    <div className="player" onMouseMove={wake} onClick={wake}>
      {/* Native WebVTT tracks keep subtitles in sync; the CC button picks the track. */}
      <video ref={ref} src={url} autoPlay crossOrigin="anonymous" onClick={() => (v().paused ? v().play() : v().pause())}
        onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); if (resumeAt && resumeAt > 5) e.currentTarget.currentTime = resumeAt; }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onPlay={() => setPaused(false)} onPause={() => { setPaused(true); setShow(true); }}
        onEnded={() => (next ? onNext(next) : onClose())}>
        {subtitles.map((s) => <track key={s.index} kind="subtitles" src={s.url} label={s.label} srcLang={s.language ?? undefined} default={s === chosen} />)}
      </video>
      <div className={`ui${show ? "" : " hide"}`} onClick={(e) => e.stopPropagation()}>
        <div className="top">
          <IconButton icon="chevdown" label="Chiudi" onClick={onClose} />
          <div className="tt"><h3>{title}</h3>{episode && <small>Episodio {episode.number}{episode.title ? ` · ${episode.title}` : ""}</small>}</div>
          {pip && <IconButton icon="pip" label="Picture in Picture" onClick={() => (document.pictureInPictureElement ? document.exitPictureInPicture() : v().requestPictureInPicture()).catch(() => {})} />}
        </div>
        <div className="mid">
          <button className="round glass" aria-label="Indietro 10 secondi" onClick={() => (v().currentTime -= 10)}><Icon name="ccw" size={24} /></button>
          <button className="round big" aria-label={paused ? "Riproduci" : "Pausa"} onClick={() => (v().paused ? v().play() : v().pause())}><Icon name={paused ? "play" : "pause"} size={34} color="var(--ink-950)" /></button>
          <button className="round glass" aria-label="Avanti 10 secondi" onClick={() => (v().currentTime += 10)}><Icon name="cw" size={24} /></button>
        </div>
        <div>
          <div className="bot">
            {t < 150 ? <button className="btn sm glass" style={{ color: "#fff" }} onClick={() => (v().currentTime = t + 85)}><Icon name="ff" size={18} />Salta sigla</button> : <span />}
            {credits && next && (
              <div className="next glass"><div><small>Prossimo episodio</small><b>E{next.number}{next.title ? ` · ${next.title}` : ""}</b></div><Button size="sm" onClick={() => onNext(next)}>Avvia</Button></div>
            )}
          </div>
          <div className="seek" onClick={seek}>
            <div className="track" /><div className="fill" style={{ width: `${dur ? (t / dur) * 100 : 0}%` }} /><div className="knob" style={{ left: `${dur ? (t / dur) * 100 : 0}%` }} />
          </div>
          <div className="times"><span>{fmtTime(t)}</span><span style={{ color: "var(--text-2)" }}>-{fmtTime(dur - t)}</span></div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
            {episodes.length > 1 && <Button size="sm" variant="ghost" icon="list" onClick={() => setList(true)}>Episodi</Button>}
            <span style={{ flex: 1 }} />
            {subtitles.length > 0 && <IconButton icon="captions" label="Sottotitoli" onClick={() => setCc(!cc)} />}
            {next && <IconButton icon="skip" label="Episodio successivo" onClick={() => onNext(next)} />}
          </div>
        </div>
        {list && (
          <Drawer title="Episodi" onClose={() => setList(false)}>
            {episodes.map((e) => {
              const cur = e.id === episode?.id;
              return (
                <div key={e.id} className={`ep${cur ? " active" : ""}`} onClick={() => { setList(false); if (!cur) onNext(e); }} style={{ cursor: "pointer" }}>
                  <div className={`n${e.completed && !cur ? " seen" : ""}`}>{e.completed && !cur ? <Icon name="check" size={18} /> : e.number}</div>
                  <div className="x"><b>{e.title || `Episodio ${e.number}`}</b>{e.durationSeconds ? <small>{Math.round(e.durationSeconds / 60)} min</small> : null}</div>
                </div>
              );
            })}
          </Drawer>
        )}
        {cc && (
          <div className="ccmenu glass">
            <button onClick={() => { setTrack(-1); setCc(false); }}>Disattivati{track === -1 && <Icon name="check" size={18} color="var(--accent)" />}</button>
            {subtitles.map((s) => <button key={s.index} onClick={() => { setTrack(s.index); setCc(false); }}>{s.label}{track === s.index && <Icon name="check" size={18} color="var(--accent)" />}</button>)}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Fonti ("Trova episodi") ----------
function Step({ n, children }: { n: number; children: React.ReactNode }) { return <div className="step"><i>{n}</i>{children}</div>; }

function SourcesDrawer({ title, aniListId, onClose, onStream }:
  { title: string; aniListId?: number; onClose: () => void; onStream: (url: string) => void }) {
  const nav = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState<Provider>();
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<SourceResult[]>([]);
  const [picked, setPicked] = useState<SourceResult>();
  const [episodes, setEpisodes] = useState<SourceEpisode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string>();
  const [manualRef, setManualRef] = useState("");
  const [manualEp, setManualEp] = useState("");

  useEffect(() => { api.providers().then((p) => { setProviders(p.filter((x) => x.enabled)); setProvider(p.find((x) => x.enabled)); }); }, []);
  useEffect(() => { search(); }, [provider]);

  const search = async () => {
    setPicked(undefined); setEpisodes([]);
    if (!provider?.canSearch || !query) return setResults([]);
    setResults(await api.search(provider.id, query).catch(() => []));
  };
  const open = async (r: SourceResult) => {
    if (!provider) return;
    if (!provider.canListEpisodes) return send([{ sourceRef: r.ref }]);
    setPicked(r);
    const eps = await api.sourceEpisodes(provider.id, r.ref);
    setEpisodes(eps); setSelected(new Set(eps.map((e) => e.ref)));
  };
  const send = async (items: { sourceRef: string; episodeNumber?: number }[]) => {
    const alId = aniListId ?? Number(episodes[0]?.extra?.anilistId ?? NaN);
    try { await api.sendToNas(provider!.id, title, Number.isNaN(alId) ? undefined : alId, items); setSent(items.length); }
    catch (e) { setError((e as Error).message); }
  };
  const manual = provider && !provider.canSearch;

  if (sent) return (
    <Drawer onClose={onClose}>
      <div className="sent">
        <Icon name="ok" size={48} color="var(--accent)" />
        <h3>Inviati {sent} download al NAS</h3>
        <p className="muted">Li trovi nella coda in Download.</p>
        <Button full onClick={() => { onClose(); nav("/downloads"); }}>Vai a Download</Button>
        <Button full variant="ghost" onClick={onClose}>Chiudi</Button>
      </div>
    </Drawer>
  );

  return (
    <Drawer title="Trova episodi" onClose={onClose}>
      <div className="muted" style={{ fontSize: 13, marginTop: -8 }}>{title}</div>
      <Step n={1}>Fonte</Step>
      <div className="chips" style={{ flexWrap: "wrap" }}>{providers.map((p) => <Chip key={p.id} on={p.id === provider?.id} onClick={() => setProvider(p)}>{p.name}</Chip>)}</div>
      {provider?.hint && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{provider.hint}</p>}
      {manual ? (
        <>
          <Step n={2}>Link o riferimento</Step>
          <div style={{ display: "grid", gap: 10 }}>
            <Field icon="link" placeholder="https://… o magnet" value={manualRef} onChange={(e) => setManualRef(e.target.value)} />
            <Field label="Numero episodio (facoltativo)" placeholder="es. 5" value={manualEp} onChange={(e) => setManualEp(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <Step n={2}>Cerca</Step>
          <label className="input pill"><Icon name="search" size={20} /><input value={query} placeholder="Titolo da cercare" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} /></label>
          {!picked ? (
            <>
              <Step n={3}>Risultati</Step>
              {results.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Nessun risultato.</p>}
              {results.map((r) => (
                <button key={r.ref} className="pick" onClick={() => open(r)}><b>{r.title}</b><small>{r.subtitle}</small><Icon name="right" size={18} color="var(--text-3)" /></button>
              ))}
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Step n={3}>{picked.title}</Step>
                <div style={{ display: "flex", gap: 14, fontWeight: 600, color: "var(--accent)" }}>
                  <span style={{ cursor: "pointer" }} onClick={() => setSelected(new Set(episodes.map((e) => e.ref)))}>Tutti</span>
                  <span style={{ cursor: "pointer" }} onClick={() => setSelected(new Set())}>Nessuno</span>
                </div>
              </div>
              {episodes.map((e) => {
                const on = selected.has(e.ref);
                return (
                  <div key={e.ref} style={{ display: "flex", alignItems: "center" }}>
                    <button className="pick" onClick={() => { const s = new Set(selected); on ? s.delete(e.ref) : s.add(e.ref); setSelected(s); }}>
                      <span className={`cb${on ? " on" : ""}`}>{on && <Icon name="check" size={16} />}</span><b>{e.title}</b>
                    </button>
                    {provider?.canStream && <IconButton icon="play" label="Guarda ora" onClick={async () => onStream((await api.sourceStream(provider.id, e.ref)).url)} />}
                  </div>
                );
              })}
              <Button variant="ghost" size="sm" style={{ marginTop: 10 }} onClick={() => setPicked(undefined)}>← Risultati</Button>
            </>
          )}
        </>
      )}
      {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
        {manual ? (
          <Button full icon="down" disabled={!manualRef.trim() || (!!provider?.refPattern && !new RegExp(provider.refPattern).test(manualRef.trim()))}
            onClick={() => send([{ sourceRef: manualRef.trim(), episodeNumber: manualEp ? Number(manualEp.replace(",", ".")) : undefined }])}>Scarica sul NAS ({manualRef.trim() ? 1 : 0})</Button>
        ) : (
          <Button full icon="down" disabled={!selected.size || !picked}
            onClick={() => send(episodes.filter((e) => selected.has(e.ref)).map((e) => ({ sourceRef: e.ref, episodeNumber: e.number })))}>Scarica sul NAS ({picked ? selected.size : 0})</Button>
        )}
      </div>
    </Drawer>
  );
}

// ---------- Download ----------
const JOB_STATUS: Record<string, [string, string]> = {
  Queued: ["In coda", "var(--text-3)"], Running: ["In corso", "var(--accent)"], PostProcessing: ["Post-elaborazione", "var(--info)"],
  Completed: ["Completato", "var(--success)"], Failed: ["Fallito", "var(--danger)"], Cancelled: ["Annullato", "var(--text-3)"], Paused: ["In pausa", "var(--warning)"],
};

export function DownloadsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [seg, setSeg] = useState<"Sul NAS" | "Su questo dispositivo">("Sul NAS");
  const load = () => api.jobs().then(setJobs).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);
  const act = (p: Promise<unknown>) => p.then(load).catch((e) => alert(e.message));
  const waiting = (s: string) => s === "Queued" || s === "Paused";
  const open = (s: string) => ["Queued", "Running", "PostProcessing", "Paused"].includes(s);
  const anyPaused = jobs.some((j) => j.status === "Paused");
  return (
    <main className="page narrow">
      <h1 style={{ marginBottom: 16 }}>Download</h1>
      <Segmented options={["Sul NAS", "Su questo dispositivo"] as const} value={seg} onChange={setSeg} />
      {seg === "Su questo dispositivo" ? (
        <Empty icon="down">I download offline sono disponibili nelle app iOS, tvOS e Android. Dal browser guardi sempre in streaming dal NAS.</Empty>
      ) : (
        <div className="list" style={{ marginTop: 16 }}>
          {jobs.length > 0 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button size="sm" variant="ghost" icon={anyPaused ? "play" : "pause"} onClick={() => act(anyPaused ? api.resumeAll() : api.pauseAll())}>{anyPaused ? "Riprendi tutto" : "Pausa tutto"}</Button>
              <Button size="sm" variant="ghost" icon="broom" onClick={() => act(api.clearFinished())}>Pulisci</Button>
            </div>
          )}
          {jobs.length === 0 && <Empty icon="down">Dalla pagina di un anime tocca Trova episodi per scaricare sul NAS</Empty>}
          {jobs.map((j) => {
            const [label, col] = JOB_STATUS[j.status] ?? [j.status, "var(--text-3)"];
            const bar = ["Running", "PostProcessing", "Paused"].includes(j.status);
            return (
              <div className="job" key={j.id}>
                <div className="top">
                  <div style={{ minWidth: 0 }}>
                    <b>{j.seriesTitle}</b>
                    <small>{meta(j.episodeNumber != null && `Episodio ${j.episodeNumber}`, j.source === "repair" ? "riparazione" : j.source, (j.priority ?? 0) >= 10 && "subito", j.message)}</small>
                  </div>
                  <span className="st" style={{ color: col }}>{label}{j.status === "Running" ? ` ${Math.round(j.progress * 100)}%` : ""}</span>
                </div>
                {bar && <Progress value={j.progress * 100} />}
                {j.status !== "Completed" && (
                  <div className="acts">
                    {j.status === "Failed" || j.status === "Cancelled" ? <Button size="sm" onClick={() => act(api.retryJob(j.id))}>Riprova</Button> : null}
                    {waiting(j.status) && <Button size="sm" icon="zap" onClick={() => act(api.startNow(j.id))}>Avvia subito</Button>}
                    {(j.status === "Queued" || j.status === "Running") && <Button size="sm" variant="ghost" onClick={() => act(api.pauseJob(j.id))}>Pausa</Button>}
                    {j.status === "Paused" && <Button size="sm" onClick={() => act(api.resumeJob(j.id))}>Riprendi</Button>}
                    {open(j.status) && (
                      <select value={Math.max(-1, Math.min(1, j.priority ?? 0))} onChange={(e) => act(api.setPriority(j.id, Number(e.target.value)))}>
                        <option value={1}>Priorità alta</option><option value={0}>Priorità normale</option><option value={-1}>Priorità bassa</option>
                      </select>
                    )}
                    {open(j.status) && j.status !== "PostProcessing" && <Button size="sm" variant="secondary" onClick={() => act(api.cancelJob(j.id))}>Annulla</Button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

// ---------- Profilo ----------
export function ProfilePage({ user: initial, onLogout }: { user: User; onLogout: () => void }) {
  const [user, setUser] = useState(initial);
  const [msg, setMsg] = useState<string>();
  const [queue, setQueue] = useState<QueueSettings>();
  const [storage, setStorage] = useState<StorageInfo>();
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [tg, setTg] = useState<TelegramStatus>();
  const [tgNext, setTgNext] = useState<string>();
  const [code, setCode] = useState("");
  const [channels, setChannels] = useState<TelegramChannel[]>([]);

  const loadTg = async () => {
    const s = await api.telegramStatus().catch(() => undefined);
    setTg(s);
    if (s?.loggedIn) setChannels(await api.telegramChannels().catch(() => []));
  };
  useEffect(() => {
    api.me().then(setUser).catch(() => {});
    api.queueSettings().then(setQueue).catch(() => {});
    api.storage().then(setStorage).catch(() => {});
    api.passkeys().then(setPasskeys).catch(() => {});
    loadTg();
  }, []);

  return (
    <main className="page narrow">
      <h1>Profilo</h1>
      <Group title="Account">
        <SettingsRow icon="user" label="Utente" value={user.username} />
        <SettingsRow icon="server" label="Server" value={location.host} />
      </Group>
      <Group title="AniList" note="Oltre l'85% di un episodio il server aggiorna AniList. Il progresso non torna mai indietro e l'ultimo episodio imposta Completato.">
        <SettingsRow icon="link" label={user.aniListConnected ? `Collegato come ${user.aniListUserName ?? "AniList"}` : "Non collegato"} />
        <div className="pad" style={{ paddingTop: 0 }}>
          {user.aniListConnected
            ? <div><Button size="sm" variant="secondary" onClick={async () => { await api.aniListDisconnect(); setUser(await api.me()); }}>Scollega</Button></div>
            : <div><Button size="sm" onClick={async () => { location.href = (await api.aniListConnect()).url; }}>Collega AniList</Button></div>}
        </div>
      </Group>
      <Group title="Passkey">
        {passkeys.map((p) => (
          <div key={p.id} className="row-s" style={{ paddingRight: 8 }}>
            <Icon name="key" color="var(--text-2)" />
            <span className="l">{p.name}<small>{p.lastUsedAt ? `Ultimo uso: ${new Date(p.lastUsedAt).toLocaleDateString("it-IT")}` : "Mai usata"}</small></span>
            <IconButton icon="trash" label="Elimina" onClick={() => api.deletePasskey(p.id).then(() => api.passkeys().then(setPasskeys))} />
          </div>
        ))}
        <SettingsRow icon="plus" label="Aggiungi passkey"
          onClick={() => api.passkeyRegister(navigator.platform || "Browser").then(() => { setMsg("Passkey creata"); api.passkeys().then(setPasskeys); }).catch((e) => setMsg(e.message))} />
      </Group>
      {storage && (
        <Group title="Spazio sul NAS" note="Sotto la riserva il NAS rifiuta nuovi download e import. Per liberare spazio elimina episodi o serie dalla pagina del titolo.">
          <div className="pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b style={{ fontFamily: "var(--font-display)", fontSize: 20, color: storage.freeBytes < storage.reserveBytes * 2 ? "var(--danger)" : undefined }}>{gb(storage.freeBytes)} liberi</b>
              <span className="muted">su {gb(storage.totalBytes)}</span>
            </div>
            <Progress value={storage.totalBytes ? ((storage.totalBytes - storage.freeBytes) / storage.totalBytes) * 100 : 0} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }} className="muted"><span>Libreria {gb(storage.libraryBytes)}</span><span>Riserva {gb(storage.reserveBytes)}</span></div>
          </div>
        </Group>
      )}
      {queue && (
        <Group title="Download sul NAS" note="Quanti lavori il NAS esegue insieme. Gli altri aspettano in coda in ordine di priorità.">
          <div className="row-s"><span className="l">Download contemporanei</span>
            <select value={queue.maxConcurrentDownloads} style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", borderRadius: 999, height: 36, padding: "0 12px" }}
              onChange={(e) => api.setQueueSettings({ maxConcurrentDownloads: Number(e.target.value) }).then(setQueue)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </Group>
      )}
      {tg && (
        <Group title="Fonti · Telegram">
          {!tg.configured && <div className="pad muted" style={{ fontSize: 14 }}>Configura ApiId, ApiHash e numero nel file .env del server.</div>}
          {tg.configured && !tg.loggedIn && (
            <div className="pad">
              {tgNext ? (
                <>
                  <Field label={tgNext === "password" ? "Password 2FA" : "Codice ricevuto su Telegram"} type="password" value={code} onChange={(e) => setCode(e.target.value)} />
                  <div><Button size="sm" onClick={() => api.telegramLogin(code).then((r) => { setTgNext(r.next); setCode(""); loadTg(); }).catch((e) => setMsg(e.message))}>Verifica</Button></div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: "var(--text-2)" }}>Collega il tuo account per cercare episodi nei canali.</div>
                  <div><Button size="sm" onClick={() => api.telegramLogin().then((r) => setTgNext(r.next ?? "code")).catch((e) => setMsg(e.message))}>Invia codice</Button></div>
                </>
              )}
            </div>
          )}
          {tg.loggedIn && (
            <>
              {channels.map((c) => <SettingsRow key={c.id} label={c.title} toggle={c.enabled} onToggle={(on) => setChannels(channels.map((x) => (x.id === c.id ? { ...x, enabled: on } : x)))} />)}
              {channels.length === 0 && <div className="pad muted">Nessun canale trovato.</div>}
              <div className="pad"><div><Button size="sm" onClick={() => api.saveTelegramChannels(channels).then(() => setMsg("Canali salvati")).catch((e) => setMsg(e.message))}>Salva</Button></div></div>
            </>
          )}
        </Group>
      )}
      {msg && <p style={{ color: "var(--accent)", marginTop: 16, fontSize: 14 }}>{msg}</p>}
      <Group><SettingsRow icon="logout" label="Esci" danger onClick={onLogout} /></Group>
    </main>
  );
}
