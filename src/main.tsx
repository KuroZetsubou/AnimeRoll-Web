import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api, auth, User } from "./api";
import { DownloadsPage, ExplorePage, HomePage, LibraryPage, LoginPage, ProfilePage, SearchPage, TitlePage } from "./pages";
import { Icon } from "./ui";
import "./styles.css";
import { t } from "./i18n";
import { Avatar, markProfilePicked, ProfilePicker, profilePicked } from "./profiles";

const TABS = [
  { to: "/", label: t("Home"), icon: "house", end: true },
  { to: "/explore", label: t("Explore"), icon: "compass" },
  { to: "/library", label: t("Library"), icon: "library" },
  { to: "/downloads", label: t("Downloads"), icon: "down" },
  { to: "/profile", label: t("Profile"), icon: "user" },
];

function Shell({ user, setUser, onLogout, onSwitch }: { user: User; setUser: (u: User) => void; onLogout: () => void; onSwitch: () => void }) {
  const location = useLocation();
  const isDetail = /^\/(anime|series)\//.test(location.pathname);
  // The title opens over the page it came from (docked panel on wide screens, full screen on phones).
  const bg = isDetail ? ((location.state as { bg?: typeof location } | null)?.bg ?? { ...location, pathname: "/", search: "" }) : location;
  return (
    <div className={`shell${isDetail ? " docked" : ""}`}>
      <nav className="sidebar">
        <div className="logo">Anime<b>Roll</b></div>
        {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.end}><Icon name={t.icon} />{t.label}</NavLink>)}
        <NavLink to="/search"><Icon name="search" />{t("Search")}</NavLink>
        <span className="sp" />
        <NavLink to="/profile" className="user-link"><Avatar name={user.username} index={user.avatar} size={26} />{user.username}</NavLink>
      </nav>
      <div className="main-area">
        <Routes location={bg}>
          <Route path="/" element={<HomePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/profile" element={<ProfilePage user={user} setUser={setUser} onLogout={onLogout} onSwitch={onSwitch} />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>
      {isDetail && (
        <Routes>
          <Route path="/anime/:aniListId" element={<TitlePage key={location.pathname} />} />
          <Route path="/series/:seriesId" element={<TitlePage key={location.pathname} />} />
        </Routes>
      )}
      <nav className="glassbar">
        {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.end}><Icon name={t.icon} />{t.label}</NavLink>)}
      </nav>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState(false);

  // After signing in (or reopening the page) ask "Who's watching?" once per browser session when the server has several profiles.
  const askProfile = () => api.profiles().then((p) => { if (p.length > 1 && !profilePicked()) setPicking(true); }).catch(() => {});

  useEffect(() => {
    if (!auth.token) { setReady(true); return; }
    api.me().then((u) => { setUser(u); askProfile(); }).catch(() => (auth.token = null)).finally(() => setReady(true));
  }, []);

  const signOut = () => { auth.token = null; markProfilePicked(false); setUser(null); setPicking(false); };

  if (!ready) return <div className="center">{t("Loading…")}</div>;
  if (!user) return <LoginPage onLogin={(token, u) => { auth.token = token; setUser(u); askProfile(); }} />;
  if (picking) return <ProfilePicker onEnter={(token, u) => { auth.token = token; setUser(u); setPicking(false); }} onCancel={profilePicked() ? () => setPicking(false) : undefined} />;
  return <BrowserRouter><Shell key={user.id} user={user} setUser={setUser} onLogout={signOut} onSwitch={() => setPicking(true)} /></BrowserRouter>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
