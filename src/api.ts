import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

// Same JSON as AnimeRoll.Server (camelCase).
export type User = { id: string; username: string; aniListConnected: boolean; aniListUserName?: string; passkeyCount: number };
export type Media = {
  id: number; title: string; titleRomaji?: string; description?: string; coverUrl?: string; bannerUrl?: string;
  episodes?: number; year?: number; format?: string; genres: string[]; averageScore?: number; status?: string; nextAiringEpisode?: number; nextAiringAt?: number;
};
export type Related = { relation: string; media: Media };
export type Entry = { media: Media; status: string; progress: number };
export type Series = {
  id: number; aniListId?: number; title: string; description?: string; posterUrl?: string; bannerUrl?: string;
  totalEpisodes?: number; episodeCount: number;
};
export type Episode = {
  id: number; seriesId: number; number: number; title?: string; sizeBytes: number; durationSeconds?: number;
  source: string; positionSeconds?: number; completed: boolean;
};
export type Home = {
  continueWatching: { series: Series; episode: Episode }[];
  recentlyAdded: Series[]; aniListWatching: Entry[]; trending: Media[]; seasonal: Media[];
};
export type Subtitle = { index: number; language?: string; label: string; isDefault: boolean; isForced: boolean; isSignsOnly: boolean; url: string; assUrl?: string };
export type StreamInfo = { url: string; downloadUrl: string; resumeAt?: number; subtitles?: Subtitle[]; fonts?: string[]; audioTracks?: AudioTrack[] };
export type AudioTrack = { index: number; language?: string; label: string; url: string };

/** Same rule as the apps: preferred language, full tracks before "signs & songs", "off" respected. */
export function pickSubtitle(subs: Subtitle[]): Subtitle | undefined {
  let pref = "auto";
  try { pref = localStorage.getItem("animeroll.subtitles") ?? "auto"; } catch { /* private mode */ }
  if (pref === "off" || subs.length === 0) return undefined;
  const two = (l?: string) => ({ ita: "it", eng: "en", jpn: "ja", spa: "es", fre: "fr", fra: "fr", ger: "de", deu: "de", por: "pt" } as Record<string, string>)[l ?? ""] ?? l;
  const full = subs.filter((s) => !s.isSignsOnly);
  const wanted = pref === "auto" ? [...navigator.languages.map((l) => l.slice(0, 2)), "en"] : [pref];
  for (const code of wanted) {
    const hit = full.find((s) => two(s.language) === code);
    if (hit) return hit;
  }
  return full.find((s) => s.isDefault) ?? full[0] ?? subs[0];
}

export type Provider = {
  id: string; name: string; enabled: boolean; canSearch: boolean; canListEpisodes: boolean; canStream: boolean; canSubtitles?: boolean;
  hint?: string; refPattern?: string; isPlugin?: boolean;
};
export type SourceResult = { ref: string; title: string; posterUrl?: string; subtitle?: string; extra?: Record<string, string> };
export type SourceEpisode = { ref: string; number?: number; title: string; extra?: Record<string, string> };
export type Job = {
  id: string; source: string; seriesTitle: string; episodeNumber?: number; status: string; progress: number; message?: string;
  priority?: number;
};
export type QueueSettings = { maxConcurrentDownloads: number };
export type StorageInfo = { totalBytes: number; freeBytes: number; libraryBytes: number; reserveBytes: number };
export type PasskeyInfo = { id: number; name: string; createdAt?: string; lastUsedAt?: string };
export type TelegramStatus = { configured: boolean; loggedIn: boolean };
export type TelegramChannel = { id: number; title: string; enabled: boolean };

const TOKEN = "animeroll.token";
export const auth = {
  get token() { try { return localStorage.getItem(TOKEN); } catch { return null; } },
  set token(v: string | null) { try { v ? localStorage.setItem(TOKEN, v) : localStorage.removeItem(TOKEN); } catch { /* private mode */ } },
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && auth.token) { auth.token = null; location.reload(); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? err.detail ?? `Errore ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

type AuthResponse = { accessToken: string; user: User };

export const api = {
  status: () => call<{ needsSetup: boolean }>("GET", "/api/auth/status"),
  login: (username: string, password: string) => call<AuthResponse>("POST", "/api/auth/login", { username, password }),
  register: (username: string, password: string) => call<AuthResponse>("POST", "/api/auth/register", { username, password }),
  me: () => call<User>("GET", "/api/auth/me"),

  async passkeyLogin(username?: string) {
    const begin = await call<{ ceremonyId: string; options: any }>("POST", "/api/auth/passkeys/login/begin", { username });
    const response = await startAuthentication({ optionsJSON: begin.options });
    return call<AuthResponse>("POST", "/api/auth/passkeys/login/finish", { ceremonyId: begin.ceremonyId, response });
  },
  async passkeyRegister(name: string) {
    const begin = await call<{ ceremonyId: string; options: any }>("POST", "/api/auth/passkeys/register/begin", {});
    const response = await startRegistration({ optionsJSON: begin.options });
    await call("POST", "/api/auth/passkeys/register/finish", { ceremonyId: begin.ceremonyId, response, name });
  },

  home: () => call<Home>("GET", "/api/library/home"),
  library: () => call<Series[]>("GET", "/api/library/series"),
  seriesByAniList: (id: number) => call<Series>("GET", `/api/library/by-anilist/${id}`).catch(() => null),
  series: (id: number) => call<Series>("GET", `/api/library/series/${id}`),
  episodes: (seriesId: number) => call<Episode[]>("GET", `/api/library/series/${seriesId}/episodes`),
  stream: (episodeId: number) => call<StreamInfo>("GET", `/api/library/episodes/${episodeId}/stream`),
  deleteEpisode: (id: number) => call("DELETE", `/api/library/episodes/${id}`),
  deleteSeries: (id: number) => call("DELETE", `/api/library/series/${id}`),
  storage: () => call<StorageInfo>("GET", "/api/settings/storage"),
  repairEpisode: (id: number) => call<unknown>("POST", `/api/library/episodes/${id}/repair`),
  refreshSubtitles: (seriesId: number, source: string, seriesRef: string) =>
    call<{ queued: number; notFound: number[] }>("POST", `/api/library/series/${seriesId}/subtitles`, { source, seriesRef }),
  repairSeries: (id: number) => call<unknown>("POST", `/api/library/series/${id}/repair`),
  progress: (episodeId: number, positionSeconds: number, durationSeconds?: number) =>
    call("PUT", `/api/library/episodes/${episodeId}/progress`, { positionSeconds, durationSeconds }),

  aniListMedia: (id: number) => call<Media>("GET", `/api/anilist/media/${id}`),
  aniListEntry: (id: number) => call<Entry | null>("GET", `/api/anilist/entry/${id}`).catch(() => null),
  aniListSearch: (q: string) => call<Media[]>("GET", `/api/anilist/search?q=${encodeURIComponent(q)}`),
  aniListRelations: (id: number) => call<Related[]>("GET", `/api/anilist/media/${id}/relations`).catch(() => [] as Related[]),
  setAniListProgress: (mediaId: number, progress: number) => call("PUT", `/api/anilist/entry/${mediaId}/progress`, { progress }),
  moveEpisodes: (episodeIds: number[], aniListId: number, numberOffset: number) =>
    call<{ seriesId: number; moved: number }>("POST", "/api/library/episodes/move", { episodeIds, aniListId, numberOffset }),
  aniListRecommendations: (id: number) => call<Media[]>("GET", `/api/anilist/media/${id}/recommendations`).catch(() => [] as Media[]),
  aniListBrowse: (season: string, year: number, genre?: string) =>
    call<Media[]>("GET", `/api/anilist/browse?season=${season}&year=${year}${genre ? `&genre=${encodeURIComponent(genre)}` : ""}`),
  aniListList: (status: string) => call<Entry[]>("GET", `/api/anilist/list/${status}`),
  setAniListStatus: (mediaId: number, status: string) => call("PUT", `/api/anilist/entry/${mediaId}/status`, { status }),
  aniListDisconnect: () => call("DELETE", "/api/anilist/connect"),
  passkeys: () => call<PasskeyInfo[]>("GET", "/api/auth/passkeys"),
  deletePasskey: (id: number) => call("DELETE", `/api/auth/passkeys/${id}`),
  telegramStatus: () => call<TelegramStatus>("GET", "/api/telegram/status"),
  telegramLogin: (code?: string) => call<{ next?: string }>("POST", "/api/telegram/login", code ? { code } : {}),
  telegramChannels: () => call<TelegramChannel[]>("GET", "/api/telegram/channels"),
  saveTelegramChannels: (c: TelegramChannel[]) => call("PUT", "/api/telegram/channels", c),
  scanInbox: () => call<unknown>("POST", "/api/library/scan-inbox"),
  aniListConnect: () => call<{ url: string }>("GET", "/api/anilist/connect"),

  providers: () => call<Provider[]>("GET", "/api/sources"),
  search: (source: string, q: string) => call<SourceResult[]>("GET", `/api/sources/${source}/search?q=${encodeURIComponent(q)}`),
  sourceEpisodes: (source: string, ref: string) =>
    call<SourceEpisode[]>("GET", `/api/sources/${source}/episodes?ref=${encodeURIComponent(ref)}`),
  sourceStream: (source: string, ref: string) =>
    call<{ url: string }>("GET", `/api/sources/${source}/stream?ref=${encodeURIComponent(ref)}`),

  sendToNas: (source: string, seriesTitle: string, aniListId: number | undefined, items: { sourceRef: string; episodeNumber?: number }[]) =>
    call<Job[]>("POST", "/api/downloads", { source, seriesTitle, aniListId, items }),
  jobs: () => call<Job[]>("GET", "/api/downloads"),
  cancelJob: (id: string) => call("POST", `/api/downloads/${id}/cancel`),
  retryJob: (id: string) => call("POST", `/api/downloads/${id}/retry`),
  pauseJob: (id: string) => call("POST", `/api/downloads/${id}/pause`),
  resumeJob: (id: string) => call("POST", `/api/downloads/${id}/resume`),
  startNow: (id: string) => call("POST", `/api/downloads/${id}/start-now`),
  setPriority: (id: string, priority: number) => call("PUT", `/api/downloads/${id}/priority`, { priority }),
  pauseAll: () => call("POST", "/api/downloads/pause-all"),
  resumeAll: () => call("POST", "/api/downloads/resume-all"),
  clearFinished: () => call("DELETE", "/api/downloads/finished"),
  queueSettings: () => call<QueueSettings>("GET", "/api/settings/queue"),
  setQueueSettings: (s: QueueSettings) => call<QueueSettings>("PUT", "/api/settings/queue", s),

  async upload(file: File, seriesTitle: string, aniListId?: number, episodeNumber?: number) {
    const form = new FormData();
    form.append("file", file);
    form.append("seriesTitle", seriesTitle);
    if (aniListId) form.append("aniListId", String(aniListId));
    if (episodeNumber !== undefined) form.append("episodeNumber", String(episodeNumber));
    const res = await fetch("/api/library/upload", { method: "POST", body: form, headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) throw new Error(`Upload fallito (${res.status})`);
  },
};

export const stripHtml = (s?: string) => (s ?? "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "");
