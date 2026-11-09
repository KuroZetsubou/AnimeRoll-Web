import { useEffect, useState } from "react";
import { api, auth, LIST_STATUSES, type Entry, type Media, type Profile, type TrackerInfo, type User } from "./api";
import { Button, Drawer, Field, Group, Icon, IconButton, SettingsRow } from "./ui";
import { LANGUAGES, lang, setLang, t } from "./i18n";

// ---------- Avatars: one colour + the initial ----------
export const AVATAR_COLORS = ["#ff6a1a", "#e5484d", "#f5a524", "#30a46c", "#12a594", "#3e63dd", "#8e4ec6", "#d6409f"];

export function Avatar({ name, index, size = 40 }: { name: string; index: number; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.46, background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

const PICKED = "animeroll.picked";
export const profilePicked = () => { try { return sessionStorage.getItem(PICKED) === "1"; } catch { return true; } };
export const markProfilePicked = (v: boolean) => { try { v ? sessionStorage.setItem(PICKED, "1") : sessionStorage.removeItem(PICKED); } catch { /* private mode */ } };

function ColorPicker({ value, onChange, name }: { value: number; onChange: (i: number) => void; name: string }) {
  return (
    <div className="avatar-row">
      {AVATAR_COLORS.map((_, i) => (
        <button key={i} type="button" className={i === value ? "on" : ""} aria-label={`${t("Avatar")} ${i + 1}`} onClick={() => onChange(i)}>
          <Avatar name={name || "?"} index={i} size={40} />
        </button>
      ))}
    </div>
  );
}

// ---------- "Who's watching?" ----------
export function ProfilePicker({ onEnter, onCancel }: { onEnter: (token: string, user: User) => void; onCancel?: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>();
  const [locked, setLocked] = useState<Profile>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();

  const load = () => api.profiles().then(setProfiles).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const enter = async (p: Profile, passcode?: string) => {
    try {
      const r = await api.enterProfile(p.id, passcode);
      markProfilePicked(true);
      onEnter(r.accessToken, r.user);
    } catch (e) { setError((e as Error).message); throw e; }
  };

  return (
    <div className="picker">
      <h1>{t("Who's watching?")}</h1>
      {error && <p className="error">{error}</p>}
      <div className="picker-grid">
        {profiles?.map((p) => (
          <button key={p.id} onClick={() => (p.hasPasscode && !p.isCurrent ? setLocked(p) : enter(p).catch(() => {}))}>
            <Avatar name={p.name} index={p.avatar} size={96} />
            <span>{p.name}{p.hasPasscode && <Icon name="lock" size={14} />}</span>
          </button>
        ))}
        <button onClick={() => setAdding(true)}>
          <span className="avatar add"><Icon name="plus" size={36} /></span>
          <span>{t("Add profile")}</span>
        </button>
      </div>
      {onCancel && <Button variant="ghost" onClick={onCancel}>{t("Cancel")}</Button>}
      {locked && <PasscodeAsk title={locked.name} onClose={() => setLocked(undefined)} onSubmit={(code) => enter(locked, code)} />}
      {adding && <NewProfileDrawer onClose={() => setAdding(false)} onCreated={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function PasscodeAsk({ title, onClose, onSubmit }: { title: string; onClose: () => void; onSubmit: (code: string) => Promise<unknown> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setError(undefined);
    try { await onSubmit(code); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Drawer title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); go(); }}>
        <Field label={t("Passcode")} icon="lock" type="password" autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}
        <Button full style={{ marginTop: 12 }} disabled={busy || code.length < 4}>{t("Enter")}</Button>
      </form>
    </Drawer>
  );
}

function NewProfileDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(Math.floor(Math.random() * AVATAR_COLORS.length));
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError(undefined);
    try { await api.createProfile(name.trim(), avatar, passcode || undefined); onCreated(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Drawer title={t("New profile")} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label={t("Name")} icon="user" autoFocus value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <ColorPicker value={avatar} onChange={setAvatar} name={name} />
        <Field label={t("Passcode (optional, 4-12 characters)")} icon="lock" type="password" autoComplete="off" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, margin: "8px 0" }}>{t("Each profile has its own watch history and its own AniList or MyAnimeList list. The library is shared. A passcode keeps others from entering this profile.")}</p>
        {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}
        <Button full disabled={busy || name.trim().length < 2 || (passcode.length > 0 && passcode.length < 4)}>{t("Create profile")}</Button>
      </form>
    </Drawer>
  );
}

// ---------- Profile page: this profile, tracker, language ----------
export function ProfileGroups({ user, setUser, onSwitch, onDeleted }:
  { user: User; setUser: (u: User) => void; onSwitch: () => void; onDeleted: () => void }) {
  const [edit, setEdit] = useState(false);
  const [passcodeSheet, setPasscodeSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [msg, setMsg] = useState<string>();
  useEffect(() => { api.profiles().then(setProfiles).catch(() => {}); }, [user.id, edit]);

  return (
    <>
      <Group title={t("Profile")}>
        <div className="row-s" style={{ cursor: "default" }}>
          <Avatar name={user.username} index={user.avatar} size={44} />
          <span className="l">{user.username}<small>{user.hasPasscode ? t("Locked with a passcode") : t("Open to everyone using this server")}</small></span>
          <IconButton icon="edit" label={t("Edit profile")} onClick={() => setEdit(true)} />
        </div>
        <SettingsRow icon="lock" label={user.hasPasscode ? t("Change or remove passcode") : t("Set a passcode")} onClick={() => setPasscodeSheet(true)} />
        <SettingsRow icon="user" label={t("Switch profile")} onClick={onSwitch} />
        {profiles.length > 1 && <SettingsRow icon="trash" label={t("Delete this profile")} danger onClick={() => setConfirmDelete(true)} />}
      </Group>
      {msg && <p style={{ color: "var(--accent)", fontSize: 14 }}>{msg}</p>}
      {edit && <EditProfileDrawer user={user} onClose={() => setEdit(false)} onSaved={async () => { setEdit(false); setUser(await api.me()); }} />}
      {passcodeSheet && <PasscodeDrawer user={user} onClose={() => setPasscodeSheet(false)}
        onSaved={async () => { setPasscodeSheet(false); setUser(await api.me()); setMsg(t("Passcode updated")); }} />}
      {confirmDelete && (
        <Drawer title={t("Delete this profile?")} onClose={() => setConfirmDelete(false)}>
          <p className="muted" style={{ fontSize: 14 }}>{t("Its watch history and passkeys are deleted. Anime it downloaded stay in the library. This cannot be undone.")}</p>
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <Button full onClick={() => api.deleteProfile(user.id).then(() => { markProfilePicked(false); onDeleted(); }).catch((e) => { setMsg(e.message); setConfirmDelete(false); })}>{t("Delete profile")}</Button>
            <Button full variant="ghost" onClick={() => setConfirmDelete(false)}>{t("Cancel")}</Button>
          </div>
        </Drawer>
      )}
    </>
  );
}

function EditProfileDrawer({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.username);
  const [avatar, setAvatar] = useState(user.avatar);
  const [error, setError] = useState<string>();
  const save = async () => {
    try { await api.updateProfile(user.id, { name: name.trim(), avatar }); onSaved(); } catch (e) { setError((e as Error).message); }
  };
  return (
    <Drawer title={t("Edit profile")} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label={t("Name")} icon="user" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <ColorPicker value={avatar} onChange={setAvatar} name={name} />
        {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}
        <Button full style={{ marginTop: 12 }} disabled={name.trim().length < 2}>{t("Save")}</Button>
      </form>
    </Drawer>
  );
}

function PasscodeDrawer({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string>();
  const save = async (remove: boolean) => {
    setError(undefined);
    try { await api.setPasscode(user.hasPasscode ? current : undefined, remove ? null : next); onSaved(); }
    catch (e) { setError((e as Error).message === "Error 401" ? t("Wrong passcode.") : (e as Error).message); }
  };
  return (
    <Drawer title={t("Passcode")} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }}>
        {user.hasPasscode && <Field label={t("Current passcode")} icon="lock" type="password" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} />}
        <Field label={t("New passcode (4-12 characters)")} icon="lock" type="password" autoComplete="off" value={next} onChange={(e) => setNext(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, margin: "8px 0" }}>{t("The passcode is asked when someone switches to this profile from another one. It does not replace the password or passkey used to sign in to the server.")}</p>
        {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <Button full disabled={next.length < 4 || next.length > 12 || (user.hasPasscode && !current)}>{t("Save")}</Button>
          {user.hasPasscode && <Button type="button" full variant="ghost" disabled={!current} onClick={() => save(true)}>{t("Remove passcode")}</Button>}
        </div>
      </form>
    </Drawer>
  );
}

// ---------- AniList / MyAnimeList ----------
export function TrackerGroup({ setUser }: { setUser: (u: User) => void }) {
  const [info, setInfo] = useState<TrackerInfo>();
  const [msg, setMsg] = useState<string>();
  const load = () => api.tracker().then(setInfo).catch(() => {});
  useEffect(() => { load(); }, []);
  const refresh = async () => { await load(); setUser(await api.me()); };

  const row = (id: "anilist" | "mal", name: string, acc: TrackerInfo["aniList"], connect: () => Promise<{ url: string }>, disconnect: () => Promise<unknown>) => (
    <div key={id}>
      <SettingsRow icon="link" label={name}
        value={acc.connected ? (info?.active === id ? `${acc.userName ?? ""} · ${t("in use")}` : acc.userName ?? "") : acc.configured ? t("Not connected") : t("Not set up on the server")} />
      <div className="pad" style={{ paddingTop: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {acc.connected ? (
          <>
            {info?.active !== id && <Button size="sm" onClick={() => api.setActiveTracker(id).then(refresh).catch((e) => setMsg(e.message))}>{t("Use this list")}</Button>}
            <Button size="sm" variant="secondary" onClick={() => disconnect().then(refresh).catch((e) => setMsg(e.message))}>{t("Disconnect")}</Button>
          </>
        ) : acc.configured && <Button size="sm" onClick={async () => { try { location.href = (await connect()).url; } catch (e) { setMsg((e as Error).message); } }}>{t("Connect {name}", { name })}</Button>}
      </div>
    </div>
  );

  return (
    <Group title={t("Lists")} note={t("Each profile keeps its own list. Past 85% of an episode the server updates the list in use; progress never goes backwards and the last episode sets Completed. Titles and images always come from AniList.")}>
      {info && row("anilist", "AniList", info.aniList, api.aniListConnect, api.aniListDisconnect)}
      {info && row("mal", "MyAnimeList", info.mal, api.malConnect, api.malDisconnect)}
      {msg && <div className="pad" style={{ color: "var(--accent)", fontSize: 14 }}>{msg}</div>}
    </Group>
  );
}

export function LanguageGroup() {
  return (
    <Group title={t("Language")} note={t("More languages can be added by the community: see src/locales in the Web repository.")}>
      <div className="row-s">
        <Icon name="info" color="var(--text-2)" />
        <span className="l">{t("App language")}</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </div>
    </Group>
  );
}

// ---------- Status, episodes watched and rating of one title ----------
export function ListStatusDrawer({ media, entry, onClose, onSaved, onError }:
  { media: Media; entry: Entry | null; onClose: () => void; onSaved: (e: Entry | null) => void; onError: (m: string) => void }) {
  const [cur, setCur] = useState(entry);
  const [busy, setBusy] = useState(false);
  const total = media.episodes ?? 9999;
  const progress = cur?.progress ?? 0;
  const label: Record<string, string> = {
    CURRENT: t("Watching"), PLANNING: t("Planning"), COMPLETED: t("Completed"), PAUSED: t("Paused"), DROPPED: t("Dropped"), REPEATING: t("Rewatching"),
  };

  const save = async (u: { status?: string; progress?: number; score?: number }) => {
    setBusy(true);
    try {
      await api.saveEntry(media.id, u);
      const e = await api.trackerEntry(media.id);
      setCur(e); onSaved(e);
    } catch (e) {
      const m = (e as Error).message;
      onError(/Nessuna lista|No list|Error 409/i.test(m) ? t("Connect a list from Profile") : m);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Drawer title={t("List status")} onClose={onClose}>
      <div className="row-s" style={{ marginBottom: 8, cursor: "default" }}>
        <span className="l">{t("Episodes watched")}<small>{media.episodes ? t("of {n}", { n: media.episodes }) : ""}</small></span>
        <IconButton icon="minus" label={t("One less")} disabled={busy || progress <= 0} onClick={() => save({ progress: progress - 1 })} />
        <b style={{ minWidth: 32, textAlign: "center" }}>{progress}</b>
        <IconButton icon="plus" label={t("One more")} disabled={busy || progress >= total} onClick={() => save({ progress: progress + 1 })} />
      </div>

      <h3 className="sheet-h">{t("Status")}</h3>
      {LIST_STATUSES.map((k) => (
        <button key={k} className="opt" disabled={busy} onClick={() => save({ status: k })}>{label[k]}{cur?.status === k && <Icon name="check" size={20} color="var(--accent)" />}</button>
      ))}

      <h3 className="sheet-h">{t("Your rating")}</h3>
      <div className="score-row">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} className={Math.round(cur?.score ?? 0) === n ? "on" : ""} disabled={busy || !cur} onClick={() => save({ score: n })}>{n}</button>
        ))}
      </div>
      {cur?.score ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => save({ score: 0 })}>{t("Remove rating")}</Button> : null}
      {!cur && <p className="muted" style={{ fontSize: 12 }}>{t("Choose a status first to add this title to your list, then you can rate it.")}</p>}
    </Drawer>
  );
}
