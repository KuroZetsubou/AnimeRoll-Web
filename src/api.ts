import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

// Same JSON as AnimeRoll.Server (camelCase).
export type User = { id: string; username: string; aniListConnected: boolean; aniListUserName?: string; passkeyCount: number };
export type Media = {
  id: number; title: string; titleRomaji?: string; description?: string; coverUrl?: string; bannerUrl?: string;
  episodes?: number; year?: number; format?: string; genres: string[]; averageScore?: number;
};
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
export type Provider = {
  id: string; name: string; enabled: boolean; canSearch: boolean; canListEpisodes: boolean; canStream: boolean;
  hint?: string; refPattern?: string; isPlugin?: boolean;
};
export type SourceResult = { ref: string; title: string; posterUrl?: string; subtitle?: string; extra?: Record<string, string> };
export type SourceEpisode = { ref: string; number?: number; title: string; extra?: Record<string, string> };
export type Job = {
  id: string; source: string; seriesTitle: string; episodeNumber?: number; status: string; progress: number; message?: string;
};

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
  stream: (episodeId: number) => call<{ url: string; downloadUrl: string; resumeAt?: number }>("GET", `/api/library/episodes/${episodeId}/stream`),
  progress: (episodeId: number, positionSeconds: number, durationSeconds?: number) =>
    call("PUT", `/api/library/episodes/${episodeId}/progress`, { positionSeconds, durationSeconds }),

  aniListMedia: (id: number) => call<Media>("GET", `/api/anilist/media/${id}`),
  aniListEntry: (id: number) => call<Entry | null>("GET", `/api/anilist/entry/${id}`).catch(() => null),
  aniListSearch: (q: string) => call<Media[]>("GET", `/api/anilist/search?q=${encodeURIComponent(q)}`),
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
