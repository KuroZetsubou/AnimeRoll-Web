import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  api, epLabel, AudioTrack, Entry, Related, Episode, Home, Job, Media, pickSubtitle, PasskeyInfo, Provider, QueueSettings, Series, SourceEpisode, StorageInfo, SourceResult,
  stripHtml, Subtitle, TelegramChannel, TelegramStatus, User,
} from "./api";
import { Badge, Button, Chip, Drawer, Empty, Field, fmtTime, Group, Icon, IconButton, PosterCard, Progress, Segmented, SettingsRow, Shelf, useCompact } from "./ui";
import { dateLocale, t } from "./i18n";
import { LanguageGroup, ListStatusDrawer, ProfileGroups, TrackerGroup } from "./profiles";

const ALSTATUS: Record<string, string> = { CURRENT: t("Watching"), PLANNING: t("Planning"), COMPLETED: t("Completed"), PAUSED: t("Paused"), DROPPED: t("Dropped"), REPEATING: t("Rewatching") };
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
        <p className="sub">{t("Your anime catalog on your server")}</p>
        <Field label={t("Username")} icon="user" autoComplete="username webauthn" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Field label={t("Password")} icon="lock" type="password" placeholder="••••••••" autoComplete={register ? "new-password" : "current-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button size="lg" full style={{ marginTop: 10 }} disabled={!username || !password}>{register ? t("Create account") : t("Sign in")}</Button>
        <Button type="button" size="lg" variant="ghost" full icon="key" onClick={() => run(() => api.passkeyLogin(username || undefined))}>{t("Sign in with passkey")}</Button>
        {error && <p className="error">{error}</p>}
        <p className="alt">{register ? t("Already have an account? ") : t("First time here? ")}
          <button type="button" onClick={() => setRegister(!register)}>{register ? t("Sign in") : t("Create the account")}</button></p>
      </form>
    </div>
  );
}

// ---------- Home ----------
export function HomePage() {
  const [home, setHome] = useState<Home>();
  const [planning, setPlanning] = useState<Entry[]>([]);
  const [error, setError] = useState<string>();
  const [genre, setGenre] = useState(t("All"));
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    api.home().then(setHome).catch((e) => setError(e.message));
    api.trackerList("PLANNING").then(setPlanning).catch(() => {});
  }, []);

  const inGenre = useCallback((m: Media) => genre === t("All") || m.genres.includes(genre), [genre]);
  const genres = useMemo(() => {
    const count = new Map<string, number>();
    [...(home?.trending ?? []), ...(home?.seasonal ?? []), ...(home?.aniListWatching.map((e) => e.media) ?? [])]
      .forEach((m) => m.genres.forEach((g) => count.set(g, (count.get(g) ?? 0) + 1)));
    return [t("All"), ...[...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g]) => g)];
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
  if (!home) return <div className="center">{t("Loading…")}</div>;
  const f = featured[slide % Math.max(1, featured.length)];

  return (
    <main>
      <div className="home-top">
        <Link to="/search" className="pillsearch"><Icon name="search" size={20} />{t("Search the library and AniList")}</Link>
        <div className="chips">{genres.map((g) => <Chip key={g} on={g === genre} onClick={() => { setGenre(g); setSlide(0); }}>{g}</Chip>)}</div>
      </div>
      {f && (
        <div className="hero-wrap">
          <Link className="hero" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => { if (touch.current != null) swipe(e.changedTouches[0].clientX - touch.current); touch.current = null; }} to={`/anime/${f.id}`} state={{ bg: (loc.state as { bg?: unknown } | null)?.bg ?? loc }}
            style={(f.bannerUrl ?? f.coverUrl) ? { backgroundImage: `url(${f.bannerUrl ?? f.coverUrl})` } : undefined}>
            <div className="body">
              <Badge>{t("Featured")}</Badge>
              <h1>{f.title}</h1>
              <div className="meta">{meta(f.year, f.genres.slice(0, 3).join(" · "), f.episodes && t("{n} episodes", { n: f.episodes }))}</div>
              <span className="btn sm"><Icon name="info" size={16} />{t("Discover")}</span>
            </div>
            {featured.length > 1 && <div className="dots">{featured.map((m, i) => <i key={m.id} className={i === slide % featured.length ? "on" : ""} />)}</div>}
          </Link>
        </div>
      )}
      <Shelf title={t("Continue watching")}>
        {home.continueWatching.map(({ series, episode }) => (
          <PosterCard key={episode.id} landscape to={`/series/${series.id}?play=${episode.id}`} title={series.title} meta={t("Episode {n}", { n: epLabel(episode) })}
            img={series.bannerUrl ?? series.posterUrl} progress={pct(episode)} />
        ))}
      </Shelf>
      <Shelf title={t("Watching on your list")}>
        {home.aniListWatching.filter((e) => inGenre(e.media)).map((e) => (
          <PosterCard key={e.media.id} to={`/anime/${e.media.id}`} title={e.media.title} img={e.media.coverUrl} meta={t("{n}/{total} episodes", { n: e.progress, total: e.media.episodes ?? "?" })} />
        ))}
      </Shelf>
      <Shelf title={t("Planned to watch")}>
        {planning.filter((e) => inGenre(e.media)).map((e) => (
          <PosterCard key={e.media.id} to={`/anime/${e.media.id}`} title={e.media.title} img={e.media.coverUrl} meta={meta(e.media.episodes && t("{n} episodes", { n: e.media.episodes }), e.media.genres[0])} />
        ))}
      </Shelf>
      {genre === t("All") && (
        <Shelf title={t("On your server")}>
          {home.recentlyAdded.map((s) => <PosterCard key={s.id} to={`/series/${s.id}`} title={s.title} img={s.posterUrl} badge={t("{n} ep", { n: s.episodeCount })} />)}
        </Shelf>
      )}
      <Shelf title={t("This season")}>
        {home.seasonal.filter(inGenre).map((m) => <PosterCard key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} meta={m.genres[0]} />)}
      </Shelf>
      <Shelf title={t("Trending")}>
        {home.trending.filter(inGenre).slice(0, 10).map((m, i) => <PosterCard key={m.id} rank={i + 1} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} />)}
      </Shelf>
    </main>
  );
}

// ---------- Esplora (AniList by season + genre) ----------
const SEASONS: [string, string][] = [[t("Winter"), "WINTER"], [t("Spring"), "SPRING"], [t("Summer"), "SUMMER"], [t("Fall"), "FALL"]];
const EXPLORE_GENRES = [t("All"), "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];

function currentSeason() {
  const d = new Date();
  return { season: SEASONS[Math.floor(d.getMonth() / 3)][1], year: d.getFullYear() };
}

function SeasonPicker({ value, onApply, onClose }: { value: { season: string; year: number }; onApply: (v: { season: string; year: number }) => void; onClose: () => void }) {
  const compact = useCompact();
  const [season, setSeason] = useState(value.season);
  const [year, setYear] = useState(value.year);
  const years = Array.from({ length: new Date().getFullYear() + 2 - 1960 }, (_, i) => new Date().getFullYear() + 1 - i);
  const label = SEASONS.find((s) => s[1] === season)![0];
  const body = (
    <>
      <div className="seasons">
        <div><h4>{t("Season")}</h4>{SEASONS.map(([n, k]) => <button key={k} className={k === season ? "on" : ""} onClick={() => setSeason(k)}>{n}{k === season && <Icon name="check" size={18} />}</button>)}</div>
        <div><h4>{t("Year")}</h4>{years.map((y) => <button key={y} className={y === year ? "on" : ""} onClick={() => setYear(y)}>{y}{y === year && <Icon name="check" size={18} />}</button>)}</div>
      </div>
      <Button full style={{ marginTop: 20 }} onClick={() => onApply({ season, year })}>Mostra {label} {year}</Button>
    </>
  );
  return compact ? (
    <div className="fullsheet">
      <div className="page-head"><h1 style={{ fontSize: 28 }}>{t("Choose a season")}</h1><IconButton icon="x" label={t("Close")} onClick={onClose} /></div>
      {body}
    </div>
  ) : (
    <div className="backdrop" style={{ alignItems: "center" }} onClick={onClose}>
      <div className="glassmodal" onClick={(e) => e.stopPropagation()}>
        <div className="page-head"><h2>{t("Choose a season")}</h2><IconButton icon="x" label={t("Close")} onClick={onClose} /></div>
        {body}
      </div>
    </div>
  );
}

export function ExplorePage() {
  const now = useMemo(currentSeason, []);
  const [sel, setSel] = useState(now);
  const [genre, setGenre] = useState(t("All"));
  const [items, setItems] = useState<Media[]>();
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string>();
  const [nas, setNas] = useState<Set<number>>(new Set());
  useEffect(() => { api.library().then((l) => setNas(new Set(l.map((s) => s.aniListId).filter((x): x is number => !!x)))).catch(() => {}); }, []);
  useEffect(() => {
    setItems(undefined); setError(undefined);
    api.aniListBrowse(sel.season, sel.year, genre === t("All") ? undefined : genre).then(setItems)
      .catch((e) => { setItems([]); setError(/404/.test(e.message) ? t("Explore needs the new server version: update AnimeRoll on your server.") : e.message); });
  }, [sel, genre]);
  const label = `${SEASONS.find((s) => s[1] === sel.season)![0]} ${sel.year}`;
  const isNow = sel.season === now.season && sel.year === now.year;

  return (
    <main className="page">
      <h1>{t("Explore")}</h1>
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{t("Seasons from AniList")}</p>
      <div style={{ marginTop: 16 }}>
        <button className="seasonpill" onClick={() => setPicker(true)}>
          <Icon name="calendar" size={20} color="var(--accent)" /><span className="lbl">{label}</span>{isNow && <Badge tone="teal">{t("Airing")}</Badge>}<Icon name="chevdown" size={20} color="var(--text-2)" />
        </button>
      </div>
      <div className="chips" style={{ marginTop: 12 }}>{EXPLORE_GENRES.map((g) => <Chip key={g} small on={g === genre} onClick={() => setGenre(g)}>{g}</Chip>)}</div>
      <div className="page-head" style={{ marginTop: 24, marginBottom: 12 }}>
        <h2 style={{ fontSize: 22 }}>{label}</h2>{items && <span className="muted" style={{ fontSize: 13 }}>{t("{n} titles", { n: items.length })}</span>}
      </div>
      {error && <p className="error">{error}</p>}
      {items && items.length === 0 && !error && <Empty icon="calendar">{genre !== t("All") ? t("No titles this season for “{genre}”", { genre }) : t("No titles this season")}</Empty>}
      <div className="grid">
        {items?.map((m) => <PosterCard key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} meta={m.genres.slice(0, 2).join(" · ")} badge={nas.has(m.id) ? t("Server") : undefined} />)}
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
          <input autoFocus placeholder={t("Search titles")} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="iconbtn" style={{ width: 32, height: 32 }} aria-label={t("Clear")} onClick={() => setQ("")}><Icon name="x" size={18} /></button>}
        </label>
        <button style={{ background: "none", border: 0, color: "var(--accent)", fontWeight: 600 }} onClick={() => nav(-1)}>{t("Cancel")}</button>
      </div>
      {q.trim().length < 2 ? (
        <>
          {recents.length > 0 && <h3 style={{ fontSize: 17, margin: "20px 0 4px" }}>{t("Recent")}</h3>}
          {recents.map((r) => <div key={r} onClick={() => setQ(r)} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", color: "var(--text-2)", cursor: "pointer" }}><Icon name="search" size={18} />{r}</div>)}
          <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>{t("Results mix your server library and AniList.")}</p>
        </>
      ) : (
        <>
          {results && results.length === 0 && nas.length === 0 && <Empty icon="search">{t("No results for “{q}”", { q })}</Empty>}
          <div className="grid" style={{ marginTop: 20 }}>
            {nas.map((s) => <PosterCard key={`s${s.id}`} to={`/series/${s.id}`} title={s.title} img={s.posterUrl} badge={t("Server")} meta={`${s.episodeCount} ep`} />)}
            {results?.filter((m) => !nasIds.has(m.id)).map((m) => <PosterCard key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} badge={t("AniList")} meta={m.year?.toString()} />)}
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
    const title = prompt(t("Series title for these files?"));
    if (!files || !title) return;
    for (const [i, f] of Array.from(files).entries()) {
      setMsg(t("Uploading {i}/{total}: {name}", { i: i + 1, total: files.length, name: f.name }));
      await api.upload(f, title).catch((e) => setMsg(e.message));
    }
    setMsg(t("Upload complete"));
    reload();
  };
  const L = series.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("Library")}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <label className="btn sm ghost"><Icon name="upload" size={16} />{t("Upload")}<input type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => onFiles(e.target.files)} /></label>
          <Button size="sm" variant="secondary" icon="folder" onClick={() => api.scanInbox().then(() => { setMsg(t("Import started")); setTimeout(reload, 2500); }).catch((e) => setMsg(e.message))}>{t("Import")}</Button>
        </div>
      </div>
      <label className="input pill" style={{ marginBottom: 20 }}><Icon name="search" size={20} /><input placeholder={t("Filter the library")} value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {msg && <p className="muted" style={{ marginBottom: 12 }}>{msg}</p>}
      {L.length === 0 ? <Empty icon="folder">{t("Download something to your server or put files in /media/_inbox and press Import")}</Empty> : (
        <div className="grid">{L.map((s) => <PosterCard key={s.id} to={`/series/${s.id}`} title={s.title} img={s.posterUrl} meta={t("{n} ep", { n: `${s.episodeCount}${s.totalEpisodes ? `/${s.totalEpisodes}` : ""}` })} />)}</div>
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
  const [playing, setPlaying] = useState<{ url: string; episode?: Episode; resumeAt?: number; subtitles?: Subtitle[]; fonts?: string[]; audioTracks?: AudioTrack[] }>();
  const [sources, setSources] = useState(false);
  const [statusSheet, setStatusSheet] = useState(false);
  const [tab, setTab] = useState<string>(t("Episodes"));
  const [more, setMore] = useState(false);
  const [all, setAll] = useState(false);
  const [note, setNote] = useState<string>();
  const [confirm, setConfirm] = useState<{ kind: "episode"; ep: Episode } | { kind: "series" }>();
  // "Sposta": give one episode (or the whole series) to another AniList title, e.g. the right season.
  const [moving, setMoving] = useState<{ eps: Episode[] }>();
  const [editing, setEditing] = useState<Episode>();
  const [editSeries, setEditSeries] = useState(false);

  const bg = (loc.state as { bg?: { pathname: string; search?: string } } | null)?.bg;
  const close = () => nav(bg ? `${bg.pathname}${bg.search ?? ""}` : "/");

  const load = async () => {
    let s: Series | null = null;
    let alId = params.aniListId ? Number(params.aniListId) : undefined;
    if (params.seriesId) { s = await api.series(Number(params.seriesId)); alId = s.aniListId; }
    if (alId) {
      setMedia(await api.aniListMedia(alId).catch(() => null));
      setEntry(await api.trackerEntry(alId));
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
    setPlaying({ url: s.url, episode: ep, resumeAt: s.resumeAt, subtitles: s.subtitles ?? [], fonts: s.fonts ?? [], audioTracks: s.audioTracks ?? [] });
  };

  const sorted = useMemo(() => [...episodes].sort((a, b) => Number(!!a.isExtra) - Number(!!b.isExtra) || a.number - b.number), [episodes]);
  const nextEp = useMemo(() => {
    const inProgress = sorted.find((e) => (e.positionSeconds ?? 0) > 5 && !e.completed);
    if (inProgress) return inProgress;
    const regular = sorted.filter((e) => !e.isExtra);
    const last = regular.map((e) => e.completed).lastIndexOf(true);
    return regular[last + 1] ?? sorted[0];
  }, [sorted]);

  const title = media?.title ?? series?.title ?? "";
  // "Simili": AniList's own recommendations.
  const [similar, setSimilar] = useState<Media[] | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const alId = media?.id ?? series?.aniListId;
  useEffect(() => {
    setSimilar(null);
    if (!alId) { if (loaded) setSimilar([]); return; }
    api.aniListRecommendations(alId).then((r) => setSimilar(r.filter((m) => m.id !== alId)));
    api.aniListRelations(alId).then(setRelated);
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
      setNote(t("Deleted from the server"));
    } catch (e) { setNote((e as Error).message); }
  };

  return (
    <aside className="detail">
      <div className="d-banner" style={banner ? { backgroundImage: `url(${banner})` } : undefined}>
        <IconButton icon="left" label={t("Back")} filled onClick={close} />
        {nextEp && <button className="playbig" aria-label={t("Play")} onClick={() => play(nextEp)}><Icon name="play" size={28} /></button>}
      </div>
      <div className="d-body">
        <h1>{title}</h1>
        {media?.titleRomaji && media.titleRomaji !== title && <div className="romaji">{media.titleRomaji}</div>}
        <div className="meta" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>{meta(media?.year, media?.genres.slice(0, 3).join(" · "), (media?.episodes ?? series?.totalEpisodes) && t("{n} episodes", { n: (media?.episodes ?? series?.totalEpisodes)! }), media?.averageScore && `★ ${media.averageScore}%`)}</span>
          {sorted.length > 0 && <Badge>{t("On server")}</Badge>}
        </div>
        {media?.nextAiringAt && media.nextAiringEpisode && (
          <div className="meta" style={{ marginTop: 6, color: "var(--teal-500)" }}>
            {t("Next episode (E{n}): {date}", { n: media.nextAiringEpisode ?? "", date: new Date(media.nextAiringAt * 1000).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}
          </div>
        )}

        {media && (entry
          ? <button className="al-row" onClick={() => setStatusSheet(true)}><Icon name="link" size={18} color="var(--teal-500)" />
              <span>{t("Watched {n}/{total}", { n: entry.progress, total: media.episodes ?? "?" })} · {ALSTATUS[entry.status] ?? entry.status}{entry.score ? ` · ★ ${entry.score}` : ""}</span><Icon name="right" size={18} color="var(--text-3)" /></button>
          : <button className="al-row" onClick={() => setStatusSheet(true)}><Icon name="plus" size={18} color="var(--teal-500)" /><span>{t("Add to your list")}</span><Icon name="right" size={18} color="var(--text-3)" /></button>)}
        {note && <p className="error" style={{ marginBottom: 10, fontSize: 13 }}>{note}</p>}

        {nextEp ? (
          <div className="d-actions">
            <Button icon="play" onClick={() => play(nextEp)}>{(nextEp.positionSeconds ?? 0) > 5 && !nextEp.completed ? t("Resume E{n}", { n: epLabel(nextEp) }) : t("Watch E{n}", { n: epLabel(nextEp) })}</Button>
            <Button variant="secondary" icon="search" onClick={() => setSources(true)}>{t("Find episodes")}</Button>
          </div>
        ) : loaded && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 14, color: "var(--text-2)", textAlign: "center" }}>{t("Not on the server yet")}</div>
            <Button full icon="search" onClick={() => setSources(true)}>{t("Find episodes")}</Button>
          </div>
        )}

        {desc && <p className={`desc${more ? " open" : ""}`} onClick={() => setMore(!more)}>{desc}</p>}
        <Segmented options={[t("Episodes"), t("Similar")] as const} value={tab} onChange={setTab} />
        {tab === t("Episodes") ? (
          <div style={{ marginTop: 8 }}>
            {sorted.length === 0 ? <div className="muted" style={{ textAlign: "center", padding: "32px 0", fontSize: 14 }}>{t("No episodes on the server")}</div> : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end", padding: "4px 0" }}>
                  {series && <Button size="sm" variant="ghost" icon="wrench" onClick={() => api.repairSeries(series.id).then(() => setNote(t("Repair sent to the server"))).catch((e) => setNote(e.message))}>{t("Repair series")}</Button>}
                  {series && <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditSeries(true)}>{t("Edit info")}</Button>}
                  {series && <Button size="sm" variant="ghost" icon="move" onClick={() => setMoving({ eps: sorted })}>{t("Move series")}</Button>}
                  {series && <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirm({ kind: "series" })}>{t("Delete series")}</Button>}
                </div>
                {shown.map((e) => {
                  const seen = e.completed || (!e.isExtra && entry != null && entry.progress >= e.number);
                  const p = pct(e);
                  return (
                    <div key={e.id} className={`ep${playing?.episode?.id === e.id ? " active" : ""}`}>
                      <div className={`n${seen ? " seen" : ""}`} onClick={() => play(e)}>{seen ? <Icon name="check" size={18} /> : epLabel(e)}</div>
                      <div className="x" onClick={() => play(e)}>
                        <b>{e.title || t("Episode {n}", { n: epLabel(e) })}</b>
                        <small>{meta(e.durationSeconds && t("{n} min", { n: Math.round(e.durationSeconds / 60) }), `${(e.sizeBytes / 1048576).toFixed(0)} MB`, e.source)}</small>
                        {p != null && !e.completed && <Progress value={p} />}
                      </div>
                      <IconButton icon="wrench" label={t("Repair on server")} title={t("Repair on server: realign audio/video and subtitles")}
                        onClick={() => api.repairEpisode(e.id).then(() => setNote(t("Repair sent to the server"))).catch((x) => setNote(x.message))} />
                      <IconButton icon="edit" label={t("Edit number")} title={t("Edit number / extra content")} onClick={() => setEditing(e)} />
                      <IconButton icon="move" label={t("Move to another series")} title={t("Move to another series")} onClick={() => setMoving({ eps: [e] })} />
                      <IconButton icon="trash" label={t("Delete from server")} title={t("Delete from server")} onClick={() => setConfirm({ kind: "episode", ep: e })} />
                    </div>
                  );
                })}
                {!all && sorted.length > 6 && <Button variant="ghost" full style={{ marginTop: 12 }} onClick={() => setAll(true)}>{t("More episodes ({n})", { n: sorted.length - 6 })}</Button>}
              </>
            )}
          </div>
        ) : similar === null ? (
          <div className="muted" style={{ textAlign: "center", padding: "32px 0" }}>{t("Loading…")}</div>
        ) : (related.length || similar.length) ? (
          <>
            {related.length > 0 && (
              <>
                <h3 className="similar-h">{t("Seasons and related")}</h3>
                <div className="similar-grid">{related.map((r) => <PosterCard key={`${r.relation}-${r.media.id}`} to={`/anime/${r.media.id}`} title={r.media.title} img={r.media.coverUrl} meta={r.relation} />)}</div>
              </>
            )}
            {similar.length > 0 && (
              <>
                <h3 className="similar-h">{t("Similar")}</h3>
                <div className="similar-grid">{similar.map((m) => <PosterCard key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} meta={m.year?.toString()} />)}</div>
              </>
            )}
          </>
        ) : <div className="muted" style={{ textAlign: "center", padding: "32px 0", fontSize: 14 }}>{t("No similar titles")}</div>}
      </div>

      {confirm && (
        <Drawer title={confirm.kind === "episode" ? t("Delete the episode from the server?") : t("Delete the whole series from the server?")} onClose={() => setConfirm(undefined)}>
          <p className="muted" style={{ marginBottom: 18 }}>
            {confirm.kind === "episode"
              ? t("The file and subtitles of episode {n} are deleted from the server and free up space. To watch it again you will have to download it again.", { n: confirm.ep.number })
              : t("All episodes of “{title}” are deleted from the server. This cannot be undone.", { title })}
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            <Button full style={{ background: "var(--danger)" }} icon="trash" onClick={doDelete}>{confirm.kind === "episode" ? t("Delete episode") : t("Delete all")}</Button>
            <Button full variant="ghost" onClick={() => setConfirm(undefined)}>{t("Cancel")}</Button>
          </div>
        </Drawer>
      )}
      {editSeries && series && <EditSeriesDrawer series={series} onClose={() => setEditSeries(false)}
        onDone={(relinked) => { setEditSeries(false); if (relinked) nav("/library"); else load(); }} />}
      {editing && <EditEpisodeDrawer ep={editing} onClose={() => setEditing(undefined)} onDone={() => { setEditing(undefined); load(); }} />}
      {moving && <MoveDrawer eps={moving.eps} fromTitle={title} onClose={() => setMoving(undefined)}
        onDone={(seriesId) => { setMoving(undefined); if (seriesId !== series?.id) nav(`/series/${seriesId}`); else load(); }} />}
      {statusSheet && media && <ListStatusDrawer media={media} entry={entry} onClose={() => setStatusSheet(false)}
        onSaved={(e) => { setEntry(e); setNote(undefined); }} onError={(m) => setNote(m)} />}
      {playing && (
        <Player key={playing.url} {...playing} title={title} episodes={sorted} next={playing.episode ? sorted.find((e) => e.number > playing.episode!.number) : undefined}
          onClose={() => { setPlaying(undefined); load(); }} onNext={play} />
      )}
      {sources && <SourcesDrawer title={title} aniListId={media?.id ?? series?.aniListId} seriesId={series?.id} onClose={() => { setSources(false); load(); }}
        onStream={(url) => { setPlaying({ url }); setSources(false); }} />}
    </aside>
  );
}

// ---------- Modifica info serie ----------
function EditSeriesDrawer({ series, onClose, onDone }: { series: Series; onClose: () => void; onDone: (relinked: boolean) => void }) {
  const [title, setTitle] = useState(series.title);
  const [alId, setAlId] = useState(series.aniListId ? String(series.aniListId) : "");
  const [poster, setPoster] = useState(series.posterUrl ?? "");
  const [banner, setBanner] = useState(series.bannerUrl ?? "");
  const [desc, setDesc] = useState(series.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const id = alId.trim() === "" ? 0 : Number(alId);
  const idOk = Number.isInteger(id) && id >= 0;
  const save = async (refresh: boolean) => {
    setBusy(true); setError(undefined);
    try {
      const relinked = id !== (series.aniListId ?? 0);
      await api.editSeries(series.id, { title, description: desc, posterUrl: poster, bannerUrl: banner, ...(relinked ? { aniListId: id } : {}), refreshFromAniList: refresh });
      onDone(relinked);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Drawer title={t("Edit info")} onClose={onClose}>
      <Field label={t("Title")} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Field label={t("AniList ID (empty = no link)")} value={alId} onChange={(e) => setAlId(e.target.value)} />
      <Field label={t("Poster URL")} value={poster} onChange={(e) => setPoster(e.target.value)} />
      <Field label={t("Banner URL")} value={banner} onChange={(e) => setBanner(e.target.value)} />
      <label className="field"><span>{t("Description")}</span>
        <div className="input area"><textarea rows={6} value={desc} onChange={(e) => setDesc(e.target.value)} style={{ width: "100%", background: "transparent", border: 0, color: "inherit", font: "inherit", resize: "vertical", outline: "none" }} /></div>
      </label>
      {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <Button full disabled={busy || !idOk || !title.trim()} onClick={() => save(false)}>{busy ? t("Saving…") : t("Save")}</Button>
        <Button full variant="secondary" icon="ccw" disabled={busy || !idOk || id === 0} onClick={() => save(true)}>{t("Save and refresh from AniList")}</Button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{t("“Refresh from AniList” replaces title, description, images, episode count, genres and year with AniList's.")}</p>
    </Drawer>
  );
}

// ---------- Modifica numero ----------
function EditEpisodeDrawer({ ep, onClose, onDone }: { ep: Episode; onClose: () => void; onDone: () => void }) {
  const [num, setNum] = useState(String(ep.number));
  const [extra, setExtra] = useState(!!ep.isExtra);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const n = Number(num.replace(",", "."));
  const ok = num.trim() !== "" && Number.isFinite(n) && n >= 0;
  const save = async () => {
    setBusy(true); setError(undefined);
    try { await api.editEpisode(ep.id, n, extra); onDone(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Drawer title={t("Edit number")} onClose={onClose}>
      <Field label={t("Number")} value={num} onChange={(e) => setNum(e.target.value)} />
      <SettingsRow icon="plus" label={t("Extra content")} value={t("Shown as EX{n} and not counted on your list", { n: num })} toggle={extra} onToggle={setExtra} />
      {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <Button full disabled={busy || !ok} onClick={save}>{busy ? t("Saving…") : t("Save")}</Button>
      </div>
    </Drawer>
  );
}

// ---------- Sposta episodi ----------
function MoveDrawer({ eps, fromTitle, onClose, onDone }: { eps: Episode[]; fromTitle: string; onClose: () => void; onDone: (seriesId: number) => void }) {
  const [q, setQ] = useState(fromTitle);
  const [results, setResults] = useState<Media[]>([]);
  const [picked, setPicked] = useState<Media>();
  const [offset, setOffset] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { const t = setTimeout(() => { if (q.trim().length > 1) api.aniListSearch(q).then(setResults).catch(() => setResults([])); }, 300); return () => clearTimeout(t); }, [q]);
  const off = Number(offset.replace(",", ".")) || 0;
  const label = eps.length === 1 ? t("episode {n}", { n: eps[0].number }) : t("{n} episodes", { n: eps.length });
  const go = async () => {
    if (!picked) return;
    setBusy(true); setError(undefined);
    try { onDone((await api.moveEpisodes(eps.map((e) => e.id), picked.id, off)).seriesId); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Drawer title={t("Move to another series")} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{t("You are moving {what} of “{title}”. The file, subtitles and progress go with them.", { what: label, title: fromTitle })}</p>
      {!picked ? (
        <>
          <label className="input pill"><Icon name="search" size={20} /><input value={q} placeholder={t("Find the right series on AniList")} onChange={(e) => setQ(e.target.value)} /></label>
          {results.map((m) => (
            <button key={m.id} className="pick" onClick={() => setPicked(m)}><b>{m.title}</b><small>{meta(m.year, m.format, m.episodes && t("{n} ep", { n: m.episodes }))}</small><Icon name="right" size={18} color="var(--text-3)" /></button>
          ))}
        </>
      ) : (
        <>
          <div className="pick" style={{ cursor: "default" }}><b>{picked.title}</b><small>{meta(picked.year, picked.format, picked.episodes && t("{n} ep", { n: picked.episodes }))}</small></div>
          <Field label={t("Shift the episode numbers by")} placeholder="0" value={offset} onChange={(e) => setOffset(e.target.value)} />
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 12px" }}>
            {t("Example: if episode 13 here is the first of the new series, enter -12.")} {eps.length === 1 && t("Episode {from} will become {to}.", { from: eps[0].number, to: eps[0].number + off })}
          </p>
          {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <Button full disabled={busy} icon="move" onClick={go}>{busy ? t("Moving…") : t("Move to “{title}”", { title: picked.title })}</Button>
            <Button full variant="ghost" onClick={() => setPicked(undefined)}>{t("← Choose another series")}</Button>
          </div>
        </>
      )}
    </Drawer>
  );
}

// ---------- Player ----------
const AUDIO_LANG_KEY = "preferredAudioLanguage";
const LANG2: Record<string, string> = { jpn: "ja", ita: "it", eng: "en", spa: "es", fre: "fr", fra: "fr", ger: "de", deu: "de", por: "pt", rus: "ru" };
/// Server languages are ISO 639-2 ("jpn"); the setting is shared with the apps as two letters ("ja").
const lang2 = (l?: string | null) => (l ? LANG2[l.toLowerCase()] ?? l.toLowerCase().slice(0, 2) : "");
function Player({ url, episode, resumeAt, subtitles = [], fonts = [], audioTracks = [], title, next, episodes = [], onClose, onNext }:
  { url: string; episode?: Episode; resumeAt?: number; subtitles?: Subtitle[]; fonts?: string[]; audioTracks?: AudioTrack[]; title: string; next?: Episode; episodes?: Episode[]; onClose: () => void; onNext: (e: Episode) => void }) {
  const chosen = pickSubtitle(subtitles);
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(0);
  const [dur, setDur] = useState(0);
  const [show, setShow] = useState(true);
  const [cc, setCc] = useState(false);
  const [track, setTrack] = useState<number>(chosen ? chosen.index : -1);
  const [list, setList] = useState(false);
  const [au, setAu] = useState(false);
  const preferred = localStorage.getItem(AUDIO_LANG_KEY);
  const [audio, setAudio] = useState<number>(() => audioTracks.find((a) => preferred && lang2(a.language) === preferred)?.index ?? 0);
  const [audioBusy, setAudioBusy] = useState(false);
  const audioEl = useRef<HTMLAudioElement>(null);
  // A dub other than the first is a separate audio file played in sync with the muted video.
  const dub = audio > 0 ? audioTracks.find((a) => a.index === audio) : undefined;
  const pickAudio = async (a: AudioTrack) => {
    if (a.index === audio || audioBusy) return;
    const l = lang2(a.language);
    if (l) localStorage.setItem(AUDIO_LANG_KEY, l);
    // The server extracts the track on first use (can take a while): wait for it before switching.
    if (a.index > 0) {
      setAudioBusy(true);
      try { await fetch(a.url.replace(/\/audio\/(\d+)\.m4a/, "/audio/$1/ready")); } catch { /* the audio request will report it */ }
      setAudioBusy(false);
    }
    setAudio(a.index);
  };
  useEffect(() => {
    const v = ref.current, au = audioEl.current;
    if (!v || !au) return;
    if (!dub) { v.muted = false; au.pause(); return; }
    v.muted = true;
    const align = () => { if (Math.abs(au.currentTime - v.currentTime) > 0.2) au.currentTime = v.currentTime; };
    const play = () => { align(); au.playbackRate = v.playbackRate; au.play().catch(() => {}); };
    const pause = () => au.pause();
    const vol = () => { au.volume = v.volume; };
    const seek = () => { au.currentTime = v.currentTime; };
    const rate = () => { au.playbackRate = v.playbackRate; };
    v.addEventListener("play", play); v.addEventListener("playing", play); v.addEventListener("pause", pause); v.addEventListener("waiting", pause);
    v.addEventListener("seeked", seek); v.addEventListener("ratechange", rate); v.addEventListener("volumechange", vol); v.addEventListener("timeupdate", align);
    au.currentTime = v.currentTime; vol();
    if (!v.paused) play();
    return () => {
      v.removeEventListener("play", play); v.removeEventListener("playing", play); v.removeEventListener("pause", pause); v.removeEventListener("waiting", pause);
      v.removeEventListener("seeked", seek); v.removeEventListener("ratechange", rate); v.removeEventListener("volumechange", vol); v.removeEventListener("timeupdate", align);
      au.pause();
    };
  }, [dub?.url]);
  const pip = typeof document !== "undefined" && document.pictureInPictureEnabled;
  // Real fullscreen on the whole player (so the controls stay); iPhone Safari only allows it on the <video> itself.
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const canFull = typeof document !== "undefined" && (document.fullscreenEnabled);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const vid = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else vid?.webkitEnterFullscreen?.();
  }, []);
  useEffect(() => {
    // Subtitle canvas and layout follow the real size of the window or of the fullscreen screen.
    const sync = () => { setFull(!!document.fullscreenElement); window.dispatchEvent(new Event("resize")); };
    document.addEventListener("fullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);
  const hideTimer = useRef<number>();

  const menuOpen = useRef(false);
  menuOpen.current = list || cc || au;
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
    // ASS tracks are drawn by libass (JASSUB) for the full look; the others by the browser from the WebVTT.
    const ass = subtitles.find((x) => x.index === track)?.assUrl;
    // Only one renderer at a time: the browser may re-enable a WebVTT track on its own (load, new track),
    // which drew the subtitles twice on top of libass, so the modes are re-applied on those events.
    const applyModes = () => Array.from(v.textTracks).forEach((tt, i) => { tt.mode = !ass && subtitles[i]?.index === track ? "showing" : "disabled"; });
    applyModes();
    v.textTracks.addEventListener("addtrack", applyModes);
    v.addEventListener("loadedmetadata", applyModes);
    v.addEventListener("loadeddata", applyModes);
    const detach = () => { v.textTracks.removeEventListener("addtrack", applyModes); v.removeEventListener("loadedmetadata", applyModes); v.removeEventListener("loadeddata", applyModes); };
    if (!ass) return detach;
    let instance: { destroy: () => Promise<void> | void } | undefined;
    let cancelled = false;
    import("jassub").then(({ default: JASSUB }) => {
      if (cancelled) return;
      instance = new JASSUB({ video: v, subUrl: ass, fonts }) as unknown as typeof instance;
    }).catch(() => { /* falls back to nothing: the WebVTT track stays available from the menu */ });
    return () => { cancelled = true; detach(); void instance?.destroy(); };
  }, [track, subtitles, fonts]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const v = ref.current; if (!v) return;
      if (e.key === " ") { e.preventDefault(); v.paused ? v.play() : v.pause(); }
      else if (e.key === "ArrowLeft") v.currentTime -= 10;
      else if (e.key === "ArrowRight") v.currentTime += 10;
      else if (e.key === "f" || e.key === "F") toggleFull();
      else if (e.key === "Escape" && !document.fullscreenElement) onClose();
      wake();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, toggleFull]);

  const v = () => ref.current!;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); v().currentTime = ((e.clientX - r.left) / r.width) * (dur || 0); };
  const credits = dur > 0 && dur - now <= 90 && next;

  return createPortal(
    <div className="player" ref={box} onMouseMove={wake} onClick={wake}>
      {/* Native WebVTT tracks keep subtitles in sync; the CC button picks the track. */}
      <video ref={ref} src={url} autoPlay playsInline crossOrigin="anonymous" onClick={() => (v().paused ? v().play() : v().pause())} onDoubleClick={toggleFull}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDur(v.duration);
          if (resumeAt && resumeAt > 5) v.currentTime = resumeAt;
        }}
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} onPlay={() => setPaused(false)} onPause={() => { setPaused(true); setShow(true); }}
        onEnded={() => (next ? onNext(next) : onClose())}>
        {subtitles.map((s) => <track key={s.index} kind="subtitles" src={s.url} label={s.label} srcLang={s.language ?? undefined} />)}
      </video>
      <audio ref={audioEl} src={dub?.url} preload="auto" style={{ display: "none" }} />
      <div className={`ui${show ? "" : " hide"}`} onClick={(e) => e.stopPropagation()}>
        <div className="top">
          <IconButton icon="chevdown" label={t("Close")} onClick={onClose} />
          <div className="tt"><h3>{title}</h3>{episode && <small>{t("Episode {n}", { n: epLabel(episode) })}{episode.title ? ` · ${episode.title}` : ""}</small>}</div>
          {pip && <IconButton icon="pip" label={t("Picture in Picture")} onClick={() => (document.pictureInPictureElement ? document.exitPictureInPicture() : v().requestPictureInPicture()).catch(() => {})} />}
        </div>
        <div className="mid">
          <button className="round glass" aria-label={t("Back 10 seconds")} onClick={() => (v().currentTime -= 10)}><Icon name="ccw" size={24} /></button>
          <button className="round big" aria-label={paused ? t("Play") : t("Pause")} onClick={() => (v().paused ? v().play() : v().pause())}><Icon name={paused ? "play" : "pause"} size={34} color="var(--ink-950)" /></button>
          <button className="round glass" aria-label={t("Forward 10 seconds")} onClick={() => (v().currentTime += 10)}><Icon name="cw" size={24} /></button>
        </div>
        <div>
          <div className="bot">
            {now < 150 ? <button className="btn sm glass" style={{ color: "#fff" }} onClick={() => (v().currentTime = now + 85)}><Icon name="ff" size={18} />{t("Skip intro")}</button> : <span />}
            {credits && next && (
              <div className="next glass"><div><small>{t("Next episode")}</small><b>E{epLabel(next)}{next.title ? ` · ${next.title}` : ""}</b></div><Button size="sm" onClick={() => onNext(next)}>{t("Start")}</Button></div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
            {episodes.length > 1 && <Button size="sm" variant="ghost" icon="list" onClick={() => setList(true)}>{t("Episodes")}</Button>}
            <span style={{ flex: 1 }} />
            {audioTracks.length > 1 && <IconButton icon="audio" label={t("Audio language")} onClick={() => { setAu(!au); setCc(false); }} />}
            {subtitles.length > 0 && <IconButton icon="captions" label={t("Subtitles")} onClick={() => { setCc(!cc); setAu(false); }} />}
            {next && <IconButton icon="skip" label={t("Next episode")} onClick={() => onNext(next)} />}
            {canFull && <IconButton icon={full ? "shrink" : "expand"} label={full ? t("Exit full screen") : t("Full screen")} onClick={toggleFull} />}
          </div>
          <div className="seek" onClick={seek}>
            <div className="track" /><div className="fill" style={{ width: `${dur ? (now / dur) * 100 : 0}%` }} /><div className="knob" style={{ left: `${dur ? (now / dur) * 100 : 0}%` }} />
          </div>
          <div className="times"><span>{fmtTime(now)}</span><span style={{ color: "var(--text-2)" }}>-{fmtTime(dur - now)}</span></div>
        </div>
        {list && (
          <Drawer title={t("Episodes")} onClose={() => setList(false)}>
            {episodes.map((e) => {
              const cur = e.id === episode?.id;
              return (
                <div key={e.id} className={`ep${cur ? " active" : ""}`} onClick={() => { setList(false); if (!cur) onNext(e); }} style={{ cursor: "pointer" }}>
                  <div className={`n${e.completed && !cur ? " seen" : ""}`}>{e.completed && !cur ? <Icon name="check" size={18} /> : epLabel(e)}</div>
                  <div className="x"><b>{e.title || t("Episode {n}", { n: epLabel(e) })}</b>{e.durationSeconds ? <small>{t("{n} min", { n: Math.round(e.durationSeconds / 60) })}</small> : null}</div>
                </div>
              );
            })}
          </Drawer>
        )}
        {audioBusy && <div className="ccmenu glass" style={{ padding: "12px 16px" }}>{t("Preparing the dub…")}</div>}
        {au && (
          <div className="ccmenu glass">
            {audioTracks.map((a) => <button key={a.index} onClick={() => { pickAudio(a); setAu(false); }}>{a.label}{audio === a.index && <Icon name="check" size={18} color="var(--accent)" />}</button>)}
          </div>
        )}
        {cc && (
          <div className="ccmenu glass">
            <button onClick={() => { setTrack(-1); setCc(false); }}>{t("Off")}{track === -1 && <Icon name="check" size={18} color="var(--accent)" />}</button>
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

function SourcesDrawer({ title, aniListId, seriesId, onClose, onStream }:
  { title: string; aniListId?: number; seriesId?: number; onClose: () => void; onStream: (url: string) => void }) {
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
    try { await api.sendToServer(provider!.id, title, Number.isNaN(alId) ? undefined : alId, items); setSent(items.length); }
    catch (e) { setError((e as Error).message); }
  };
  const manual = provider && !provider.canSearch;
  const [subNote, setSubNote] = useState<string>();
  const refreshSubs = async () => {
    if (!provider || !picked || seriesId == null) return;
    setSubNote(t("Sending…"));
    try {
      const r = await api.refreshSubtitles(seriesId, provider.id, picked.ref);
      setSubNote(t("{n} episodes queued for subtitles{missing}. Follow progress in Downloads.", { n: r.queued, missing: r.notFound.length ? ` · ${t("not found on {source}: {list}", { source: provider.name, list: r.notFound.join(", ") })}` : "" }));
    } catch (e) { setSubNote((e as Error).message); }
  };

  if (sent) return (
    <Drawer onClose={onClose}>
      <div className="sent">
        <Icon name="ok" size={48} color="var(--accent)" />
        <h3>{t("{n} downloads sent to the server", { n: sent })}</h3>
        <p className="muted">{t("You'll find them in the Downloads queue.")}</p>
        <Button full onClick={() => { onClose(); nav("/downloads"); }}>{t("Go to Downloads")}</Button>
        <Button full variant="ghost" onClick={onClose}>{t("Close")}</Button>
      </div>
    </Drawer>
  );

  return (
    <Drawer title={t("Find episodes")} onClose={onClose}>
      <div className="muted" style={{ fontSize: 13, marginTop: -8 }}>{title}</div>
      <Step n={1}>{t("Source")}</Step>
      <div className="chips" style={{ flexWrap: "wrap" }}>{providers.map((p) => <Chip key={p.id} on={p.id === provider?.id} onClick={() => setProvider(p)}>{p.name}</Chip>)}</div>
      {provider?.hint && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{provider.hint}</p>}
      {manual ? (
        <>
          <Step n={2}>{t("Link or reference")}</Step>
          <div style={{ display: "grid", gap: 10 }}>
            <Field icon="link" placeholder={t("https://… or magnet")} value={manualRef} onChange={(e) => setManualRef(e.target.value)} />
            <Field label={t("Episode number (optional)")} placeholder={t("e.g. 5")} value={manualEp} onChange={(e) => setManualEp(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <Step n={2}>{t("Search")}</Step>
          <label className="input pill"><Icon name="search" size={20} /><input value={query} placeholder={t("Title to search")} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} /></label>
          {!picked ? (
            <>
              <Step n={3}>{t("Results")}</Step>
              {results.length === 0 && <p className="muted" style={{ fontSize: 14 }}>{t("No results.")}</p>}
              {results.map((r) => (
                <button key={r.ref} className="pick" onClick={() => open(r)}><b>{r.title}</b><small>{r.subtitle}</small><Icon name="right" size={18} color="var(--text-3)" /></button>
              ))}
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Step n={3}>{picked.title}</Step>
                <div style={{ display: "flex", gap: 14, fontWeight: 600, color: "var(--accent)" }}>
                  <span style={{ cursor: "pointer" }} onClick={() => setSelected(new Set(episodes.map((e) => e.ref)))}>{t("All")}</span>
                  <span style={{ cursor: "pointer" }} onClick={() => setSelected(new Set())}>{t("None")}</span>
                </div>
              </div>
              {episodes.map((e) => {
                const on = selected.has(e.ref);
                return (
                  <div key={e.ref} style={{ display: "flex", alignItems: "center" }}>
                    <button className="pick" onClick={() => { const s = new Set(selected); on ? s.delete(e.ref) : s.add(e.ref); setSelected(s); }}>
                      <span className={`cb${on ? " on" : ""}`}>{on && <Icon name="check" size={16} />}</span><b>{e.title}</b>
                    </button>
                    {provider?.canStream && <IconButton icon="play" label={t("Watch now")} onClick={async () => onStream((await api.sourceStream(provider.id, e.ref)).url)} />}
                  </div>
                );
              })}
              <Button variant="ghost" size="sm" style={{ marginTop: 10 }} onClick={() => setPicked(undefined)}>{t("← Results")}</Button>
            </>
          )}
        </>
      )}
      {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
        {!manual && picked && provider?.canSubtitles && seriesId != null && (
          <>
            <Button full variant="secondary" icon="captions" onClick={refreshSubs}>{t("Update subtitles only (ASS)")}</Button>
            {subNote && <p className="muted" style={{ fontSize: 13 }}>{subNote}</p>}
          </>
        )}
        {manual ? (
          <Button full icon="down" disabled={!manualRef.trim() || (!!provider?.refPattern && !new RegExp(provider.refPattern).test(manualRef.trim()))}
            onClick={() => send([{ sourceRef: manualRef.trim(), episodeNumber: manualEp ? Number(manualEp.replace(",", ".")) : undefined }])}>{t("Download to server ({n})", { n: manualRef.trim() ? 1 : 0 })}</Button>
        ) : (
          <Button full icon="down" disabled={!selected.size || !picked}
            onClick={() => send(episodes.filter((e) => selected.has(e.ref)).map((e) => ({ sourceRef: e.ref, episodeNumber: e.number })))}>{t("Download to server ({n})", { n: picked ? selected.size : 0 })}</Button>
        )}
      </div>
    </Drawer>
  );
}

// ---------- Download ----------
const JOB_STATUS: Record<string, [string, string]> = {
  Queued: [t("Queued"), "var(--text-3)"], Running: [t("Running"), "var(--accent)"], PostProcessing: [t("Processing"), "var(--info)"],
  Completed: [t("Completed"), "var(--success)"], Failed: [t("Failed"), "var(--danger)"], Cancelled: [t("Cancelled"), "var(--text-3)"], Paused: [t("Paused"), "var(--warning)"],
};

export function DownloadsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [seg, setSeg] = useState<string>(t("On server"));
  const load = () => api.jobs().then(setJobs).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);
  const act = (p: Promise<unknown>) => p.then(load).catch((e) => alert(e.message));
  const waiting = (s: string) => s === "Queued" || s === "Paused";
  const open = (s: string) => ["Queued", "Running", "PostProcessing", "Paused"].includes(s);
  const anyPaused = jobs.some((j) => j.status === "Paused");
  return (
    <main className="page narrow">
      <h1 style={{ marginBottom: 16 }}>{t("Downloads")}</h1>
      <Segmented options={[t("On server"), t("On this device")] as const} value={seg} onChange={setSeg} />
      {seg === t("On this device") ? (
        <Empty icon="down">{t("Offline downloads are available in the iOS, tvOS and Android apps. In the browser you always stream from the server.")}</Empty>
      ) : (
        <div className="list" style={{ marginTop: 16 }}>
          {jobs.length > 0 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button size="sm" variant="ghost" icon={anyPaused ? "play" : "pause"} onClick={() => act(anyPaused ? api.resumeAll() : api.pauseAll())}>{anyPaused ? t("Resume all") : t("Pause all")}</Button>
              <Button size="sm" variant="ghost" icon="broom" onClick={() => act(api.clearFinished())}>{t("Clear finished")}</Button>
            </div>
          )}
          {jobs.length === 0 && <Empty icon="down">{t("Open an anime and tap Find episodes to download to your server")}</Empty>}
          {jobs.map((j) => {
            const [label, col] = JOB_STATUS[j.status] ?? [j.status, "var(--text-3)"];
            const bar = ["Running", "PostProcessing", "Paused"].includes(j.status);
            return (
              <div className="job" key={j.id}>
                <div className="top">
                  <div style={{ minWidth: 0 }}>
                    <b>{j.seriesTitle}</b>
                    <small>{meta(j.episodeNumber != null && t("Episode {n}", { n: j.episodeNumber }), j.source === "repair" ? t("repair") : j.source, (j.priority ?? 0) >= 10 && t("now"), j.message)}</small>
                  </div>
                  <span className="st" style={{ color: col }}>{label}{j.status === "Running" ? ` ${Math.round(j.progress * 100)}%` : ""}</span>
                </div>
                {bar && <Progress value={j.progress * 100} />}
                {j.status !== "Completed" && (
                  <div className="acts">
                    {j.status === "Failed" || j.status === "Cancelled" ? <Button size="sm" onClick={() => act(api.retryJob(j.id))}>{t("Retry")}</Button> : null}
                    {waiting(j.status) && <Button size="sm" icon="zap" onClick={() => act(api.startNow(j.id))}>{t("Start now")}</Button>}
                    {(j.status === "Queued" || j.status === "Running") && <Button size="sm" variant="ghost" onClick={() => act(api.pauseJob(j.id))}>{t("Pause")}</Button>}
                    {j.status === "Paused" && <Button size="sm" onClick={() => act(api.resumeJob(j.id))}>{t("Resume")}</Button>}
                    {open(j.status) && (
                      <select value={Math.max(-1, Math.min(1, j.priority ?? 0))} onChange={(e) => act(api.setPriority(j.id, Number(e.target.value)))}>
                        <option value={1}>{t("High priority")}</option><option value={0}>{t("Normal priority")}</option><option value={-1}>{t("Low priority")}</option>
                      </select>
                    )}
                    {open(j.status) && j.status !== "PostProcessing" && <Button size="sm" variant="secondary" onClick={() => act(api.cancelJob(j.id))}>{t("Cancel")}</Button>}
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
export function ProfilePage({ user, setUser, onLogout, onSwitch }: { user: User; setUser: (u: User) => void; onLogout: () => void; onSwitch: () => void }) {
  const [msg, setMsg] = useState<string>();
  const [queue, setQueue] = useState<QueueSettings>();
  const [storage, setStorage] = useState<StorageInfo>();
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [tg, setTg] = useState<TelegramStatus>();
  const [tgNext, setTgNext] = useState<string>();
  const [code, setCode] = useState("");
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [audioLang, setAudioLang] = useState(() => { try { return localStorage.getItem(AUDIO_LANG_KEY) ?? ""; } catch { return ""; } });

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
      <h1>{t("Profile")}</h1>
      <ProfileGroups user={user} setUser={setUser} onSwitch={onSwitch} onDeleted={onLogout} />
      <Group title={t("Server")}>
        <SettingsRow icon="server" label={t("Server")} value={location.host} />
      </Group>
      <LanguageGroup />
      <Group title={t("Playback")} note={t("Applies to episodes with several audio tracks. Picking a dub in the player makes it the new default.")}>
        <div className="row-s">
          <Icon name="audio" color="var(--text-2)" />
          <span className="l">{t("Default dub")}</span>
          <select value={audioLang} onChange={(e) => { setAudioLang(e.target.value); try { localStorage.setItem(AUDIO_LANG_KEY, e.target.value); } catch { /* private mode */ } }}>
            <option value="">{t("First track")}</option><option value="ja">{t("Japanese")}</option><option value="it">{t("Italian")}</option><option value="en">{t("English")}</option>
          </select>
        </div>
      </Group>
      <TrackerGroup setUser={setUser} />
      <Group title={t("Passkey")}>
        {passkeys.map((p) => (
          <div key={p.id} className="row-s" style={{ paddingRight: 8 }}>
            <Icon name="key" color="var(--text-2)" />
            <span className="l">{p.name}<small>{p.lastUsedAt ? t("Last used: {date}", { date: new Date(p.lastUsedAt).toLocaleDateString(dateLocale) }) : t("Never used")}</small></span>
            <IconButton icon="trash" label={t("Delete")} onClick={() => api.deletePasskey(p.id).then(() => api.passkeys().then(setPasskeys))} />
          </div>
        ))}
        <SettingsRow icon="plus" label={t("Add passkey")}
          onClick={() => api.passkeyRegister(navigator.platform || "Browser").then(() => { setMsg(t("Passkey created")); api.passkeys().then(setPasskeys); }).catch((e) => setMsg(e.message))} />
      </Group>
      {storage && (
        <Group title={t("Server storage")} note={t("Below the reserve the server refuses new downloads and imports. To free space, delete episodes or series from the title page.")}>
          <div className="pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b style={{ fontFamily: "var(--font-display)", fontSize: 20, color: storage.freeBytes < storage.reserveBytes * 2 ? "var(--danger)" : undefined }}>{t("{size} free", { size: gb(storage.freeBytes) })}</b>
              <span className="muted">{t("of {size}", { size: gb(storage.totalBytes) })}</span>
            </div>
            <Progress value={storage.totalBytes ? ((storage.totalBytes - storage.freeBytes) / storage.totalBytes) * 100 : 0} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }} className="muted"><span>{t("Library {size}", { size: gb(storage.libraryBytes) })}</span><span>{t("Reserve {size}", { size: gb(storage.reserveBytes) })}</span></div>
          </div>
        </Group>
      )}
      {queue && (
        <Group title={t("Server downloads")} note={t("How many jobs the server runs at once. The others wait in the queue by priority.")}>
          <div className="row-s"><span className="l">{t("Simultaneous downloads")}</span>
            <select value={queue.maxConcurrentDownloads} style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", borderRadius: 999, height: 36, padding: "0 12px" }}
              onChange={(e) => api.setQueueSettings({ maxConcurrentDownloads: Number(e.target.value) }).then(setQueue)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </Group>
      )}
      {tg && (
        <Group title={t("Sources · Telegram")}>
          {!tg.configured && <div className="pad muted" style={{ fontSize: 14 }}>{t("Set ApiId, ApiHash and phone number in the server's .env file.")}</div>}
          {tg.configured && !tg.loggedIn && (
            <div className="pad">
              {tgNext ? (
                <>
                  <Field label={tgNext === "password" ? t("2FA password") : t("Code received on Telegram")} type="password" value={code} onChange={(e) => setCode(e.target.value)} />
                  <div><Button size="sm" onClick={() => api.telegramLogin(code).then((r) => { setTgNext(r.next); setCode(""); loadTg(); }).catch((e) => setMsg(e.message))}>{t("Verify")}</Button></div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: "var(--text-2)" }}>{t("Connect your account to search for episodes in channels.")}</div>
                  <div><Button size="sm" onClick={() => api.telegramLogin().then((r) => setTgNext(r.next ?? "code")).catch((e) => setMsg(e.message))}>{t("Send code")}</Button></div>
                </>
              )}
            </div>
          )}
          {tg.loggedIn && (
            <>
              {channels.map((c) => <SettingsRow key={c.id} label={c.title} toggle={c.enabled} onToggle={(on) => setChannels(channels.map((x) => (x.id === c.id ? { ...x, enabled: on } : x)))} />)}
              {channels.length === 0 && <div className="pad muted">{t("No channels found.")}</div>}
              <div className="pad"><div><Button size="sm" onClick={() => api.saveTelegramChannels(channels).then(() => setMsg(t("Channels saved"))).catch((e) => setMsg(e.message))}>{t("Save")}</Button></div></div>
            </>
          )}
        </Group>
      )}
      {msg && <p style={{ color: "var(--accent)", marginTop: 16, fontSize: 14 }}>{msg}</p>}
      <Group><SettingsRow icon="logout" label={t("Sign out")} danger onClick={onLogout} /></Group>
    </main>
  );
}
