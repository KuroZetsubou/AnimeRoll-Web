import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Entry, Episode, Home, Job, Media, Provider, Series, SourceEpisode, SourceResult, stripHtml, User } from "./api";

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
      <h1>▶ AnimeRoll</h1>
      <p className="muted">Il tuo catalogo anime sul NAS</p>
      <form onSubmit={(e) => { e.preventDefault(); run(() => register ? api.register(username, password) : api.login(username, password)); }}>
        <input placeholder="Username" autoComplete="username webauthn" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Password" type="password" autoComplete={register ? "new-password" : "current-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="primary" disabled={!username || !password}>{register ? "Crea account" : "Accedi"}</button>
      </form>
      <button onClick={() => run(() => api.passkeyLogin(username || undefined))}>🔑 Accedi con passkey</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ---------- Shared bits ----------
function Poster({ to, title, img, badge }: { to: string; title: string; img?: string; badge?: string }) {
  return (
    <Link to={to} className="poster">
      <div className="poster-img" style={{ backgroundImage: img ? `url(${img})` : undefined }}>
        {badge && <span className="badge">{badge}</span>}
      </div>
      <span>{title}</span>
    </Link>
  );
}

function Shelf({ title, children }: { title: string; children: React.ReactNode[] }) {
  if (!children.length) return null;
  return (<section><h2>{title}</h2><div className="shelf">{children}</div></section>);
}

// ---------- Home ----------
export function HomePage() {
  const [home, setHome] = useState<Home>();
  const [error, setError] = useState<string>();
  useEffect(() => { api.home().then(setHome).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="error page">{error}</p>;
  if (!home) return <div className="center">Caricamento…</div>;
  const hero = home.aniListWatching[0]?.media ?? home.trending[0];

  return (
    <main>
      {hero && (
        <div className="hero" style={{ backgroundImage: `url(${hero.bannerUrl ?? hero.coverUrl})` }}>
          <div className="hero-body">
            <h1>{hero.title}</h1>
            <p>{stripHtml(hero.description).slice(0, 220)}…</p>
            <Link className="button primary" to={`/anime/${hero.id}`}>Scopri</Link>
          </div>
        </div>
      )}
      <Shelf title="Continua a guardare">
        {home.continueWatching.map(({ series, episode }) => (
          <Poster key={episode.id} to={`/series/${series.id}?play=${episode.id}`} title={`${series.title} · E${episode.number}`} img={series.posterUrl} />
        ))}
      </Shelf>
      <Shelf title="Stai guardando su AniList">
        {home.aniListWatching.map((e) => (
          <Poster key={e.media.id} to={`/anime/${e.media.id}`} title={e.media.title} img={e.media.coverUrl} badge={`${e.progress}/${e.media.episodes ?? "?"}`} />
        ))}
      </Shelf>
      <Shelf title="Sul tuo NAS">
        {home.recentlyAdded.map((s) => <Poster key={s.id} to={`/series/${s.id}`} title={s.title} img={s.posterUrl} badge={`${s.episodeCount} ep`} />)}
      </Shelf>
      <Shelf title="Questa stagione">{home.seasonal.map((m) => <Poster key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} />)}</Shelf>
      <Shelf title="Di tendenza">{home.trending.map((m) => <Poster key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} />)}</Shelf>
    </main>
  );
}

// ---------- Title (NAS series or AniList media) ----------
export function TitlePage() {
  const params = useParams();
  const [media, setMedia] = useState<Media | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [playing, setPlaying] = useState<{ url: string; episode?: Episode; resumeAt?: number }>();
  const [sources, setSources] = useState(false);

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
    const autoplay = new URLSearchParams(location.search).get("play");
    const ep = eps.find((e) => String(e.id) === autoplay);
    if (ep) play(ep);
  };
  useEffect(() => { load(); }, [params.aniListId, params.seriesId]);

  const play = async (ep: Episode) => {
    const s = await api.stream(ep.id);
    setPlaying({ url: s.url, episode: ep, resumeAt: s.resumeAt });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const title = media?.title ?? series?.title ?? "";
  return (
    <main className="page">
      {playing ? (
        <Player key={playing.url} {...playing} onEnded={() => {
          const next = episodes.find((e) => playing.episode && e.number > playing.episode.number);
          if (next) play(next);
        }} />
      ) : (
        <div className="title-header" style={{ backgroundImage: `url(${media?.bannerUrl ?? series?.bannerUrl ?? ""})` }} />
      )}
      <div className="title-info">
        <img src={media?.coverUrl ?? series?.posterUrl} alt="" />
        <div>
          <h1>{title}</h1>
          <p className="muted">{[media?.year, media?.format, media?.episodes && `${media.episodes} episodi`, media?.averageScore && `★ ${media.averageScore}%`].filter(Boolean).join(" · ")}</p>
          {entry && <p className="accent">AniList: {entry.progress}/{media?.episodes ?? "?"} visti</p>}
          <p>{stripHtml(media?.description ?? series?.description).slice(0, 600)}</p>
          <button className="primary" onClick={() => setSources(true)}>⬇ Scarica sul NAS</button>
        </div>
      </div>
      <h2>Episodi</h2>
      {episodes.length === 0 && <p className="muted">Non ancora sul NAS. Usa “Scarica sul NAS”.</p>}
      <ul className="episodes">
        {episodes.map((e) => (
          <li key={e.id} className={playing?.episode?.id === e.id ? "active" : ""}>
            <button onClick={() => play(e)}>▶ E{e.number} {e.title}</button>
            <span className="muted">{e.completed || (entry && entry.progress >= e.number) ? "✓ visto" : ""}</span>
          </li>
        ))}
      </ul>
      {sources && <SourcesDialog title={title} aniListId={media?.id ?? series?.aniListId} onClose={() => { setSources(false); load(); }}
        onStream={(url) => { setPlaying({ url }); setSources(false); }} />}
    </main>
  );
}

function Player({ url, episode, resumeAt, onEnded }: { url: string; episode?: Episode; resumeAt?: number; onEnded: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !episode) return;
    const report = () => { if (v.currentTime > 1) api.progress(episode.id, v.currentTime, v.duration || undefined).catch(() => {}); };
    const timer = setInterval(() => { if (!v.paused) report(); }, 15000);
    v.addEventListener("pause", report);
    return () => { clearInterval(timer); v.removeEventListener("pause", report); report(); };
  }, [episode]);
  return (
    <video ref={ref} className="player" src={url} controls autoPlay
      onLoadedMetadata={(e) => { if (resumeAt && resumeAt > 5) e.currentTarget.currentTime = resumeAt; }} onEnded={onEnded} />
  );
}

function SourcesDialog({ title, aniListId, onClose, onStream }:
  { title: string; aniListId?: number; onClose: () => void; onStream: (url: string) => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState<Provider>();
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<SourceResult[]>([]);
  const [picked, setPicked] = useState<SourceResult>();
  const [episodes, setEpisodes] = useState<SourceEpisode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string>();
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
    await api.sendToNas(provider!.id, title, Number.isNaN(alId) ? undefined : alId, items);
    setMsg(`${items.length} download inviati al NAS`);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <header><h2>Fonti per “{title}”</h2><button onClick={onClose}>✕</button></header>
        <div className="row">
          <select value={provider?.id} onChange={(e) => setProvider(providers.find((p) => p.id === e.target.value))}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {provider?.canSearch && (<>
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button onClick={search}>Cerca</button>
          </>)}
        </div>
        {provider?.hint && <p className="muted">{provider.hint}</p>}
        {msg && <p className="accent">{msg}</p>}
        {provider && !provider.canSearch && (
          <div className="row">
            <input placeholder="Link o riferimento (https://…)" value={manualRef} onChange={(e) => setManualRef(e.target.value)} />
            <input placeholder="Ep. n°" style={{ width: 80 }} value={manualEp} onChange={(e) => setManualEp(e.target.value)} />
            <button className="primary"
              disabled={!manualRef.trim() || (!!provider.refPattern && !new RegExp(provider.refPattern).test(manualRef.trim()))}
              onClick={() => send([{ sourceRef: manualRef.trim(), episodeNumber: manualEp ? Number(manualEp.replace(",", ".")) : undefined }])}>
              Scarica sul NAS
            </button>
          </div>
        )}
        {!picked && (
          <ul className="results">
            {results.map((r) => (
              <li key={r.ref}><button onClick={() => open(r)}><b>{r.title}</b><br /><span className="muted">{r.subtitle}</span></button></li>
            ))}
          </ul>
        )}
        {picked && (<>
          <div className="row">
            <button onClick={() => setPicked(undefined)}>← Risultati</button>
            <button onClick={() => setSelected(new Set(selected.size === episodes.length ? [] : episodes.map((e) => e.ref)))}>Tutti/Nessuno</button>
            <button className="primary" disabled={!selected.size}
              onClick={() => send(episodes.filter((e) => selected.has(e.ref)).map((e) => ({ sourceRef: e.ref, episodeNumber: e.number })))}>
              Scarica sul NAS ({selected.size})
            </button>
          </div>
          <ul className="results">
            {episodes.map((e) => (
              <li key={e.ref} className="row">
                <label><input type="checkbox" checked={selected.has(e.ref)} onChange={() => {
                  const s = new Set(selected); s.has(e.ref) ? s.delete(e.ref) : s.add(e.ref); setSelected(s);
                }} /> {e.title}</label>
                {provider?.canStream && <button onClick={async () => onStream((await api.sourceStream(provider.id, e.ref)).url)}>▶ Guarda ora</button>}
              </li>
            ))}
          </ul>
        </>)}
      </div>
    </div>
  );
}

// ---------- Search / Library / Downloads / Settings ----------
export function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Media[]>([]);
  useEffect(() => {
    if (q.length < 2) return setResults([]);
    const t = setTimeout(() => api.aniListSearch(q).then(setResults).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <main className="page">
      <input className="search" autoFocus placeholder="Cerca un anime…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid">{results.map((m) => <Poster key={m.id} to={`/anime/${m.id}`} title={m.title} img={m.coverUrl} />)}</div>
    </main>
  );
}

export function LibraryPage() {
  const [series, setSeries] = useState<Series[]>([]);
  const [upload, setUpload] = useState<string>();
  useEffect(() => { api.library().then(setSeries); }, []);
  const onFiles = async (files: FileList | null) => {
    const title = prompt("Titolo della serie per questi file?");
    if (!files || !title) return;
    for (const [i, f] of Array.from(files).entries()) {
      setUpload(`Carico ${i + 1}/${files.length}: ${f.name}`);
      await api.upload(f, title).catch((e) => setUpload(e.message));
    }
    setUpload("Caricamento completato");
    api.library().then(setSeries);
  };
  return (
    <main className="page">
      <div className="row">
        <h1>Libreria</h1>
        <label className="button">⬆ Carica file locali<input type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => onFiles(e.target.files)} /></label>
      </div>
      {upload && <p className="muted">{upload}</p>}
      <div className="grid">{series.map((s) => <Poster key={s.id} to={`/series/${s.id}`} title={s.title} img={s.posterUrl} badge={`${s.episodeCount}`} />)}</div>
    </main>
  );
}

export function DownloadsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    const load = () => api.jobs().then(setJobs).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);
  const active = (s: string) => ["Queued", "Running", "PostProcessing"].includes(s);
  return (
    <main className="page">
      <h1>Download sul NAS</h1>
      {jobs.length === 0 && <p className="muted">Nessun download.</p>}
      <ul className="jobs">
        {jobs.map((j) => (
          <li key={j.id}>
            <div><b>{j.seriesTitle}</b>{j.episodeNumber !== undefined && ` · E${j.episodeNumber}`} <span className="badge">{j.source}</span></div>
            {active(j.status) && <progress value={j.progress} max={1} />}
            <div className="muted">{j.status}{j.message && ` · ${j.message}`}</div>
            {active(j.status) ? <button onClick={() => api.cancelJob(j.id)}>Annulla</button>
              : j.status === "Failed" && <button onClick={() => api.retryJob(j.id)}>Riprova</button>}
          </li>
        ))}
      </ul>
    </main>
  );
}

export function SettingsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [msg, setMsg] = useState<string>();
  return (
    <main className="page narrow">
      <h1>Profilo</h1>
      <p>Utente: <b>{user.username}</b></p>
      <p>AniList: {user.aniListConnected ? <b>{user.aniListUserName}</b> :
        <button onClick={async () => { location.href = (await api.aniListConnect()).url; }}>Collega AniList</button>}</p>
      <p>Passkey registrate: {user.passkeyCount}{" "}
        <button onClick={() => api.passkeyRegister(navigator.platform || "Browser").then(() => setMsg("Passkey creata")).catch((e) => setMsg(e.message))}>
          Aggiungi passkey
        </button>
      </p>
      {msg && <p className="accent">{msg}</p>}
      <button onClick={onLogout}>Esci</button>
    </main>
  );
}
