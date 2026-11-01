import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api, auth, User } from "./api";
import { DownloadsPage, ExplorePage, HomePage, LibraryPage, LoginPage, ProfilePage, SearchPage, TitlePage } from "./pages";
import { Icon } from "./ui";
import "./styles.css";

const TABS = [
  { to: "/", label: "Home", icon: "house", end: true },
  { to: "/explore", label: "Esplora", icon: "compass" },
  { to: "/library", label: "Libreria", icon: "library" },
  { to: "/downloads", label: "Download", icon: "down" },
  { to: "/profile", label: "Profilo", icon: "user" },
];

function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const location = useLocation();
  const isDetail = /^\/(anime|series)\//.test(location.pathname);
  // The title opens over the page it came from (docked panel on wide screens, full screen on phones).
  const bg = isDetail ? ((location.state as { bg?: typeof location } | null)?.bg ?? { ...location, pathname: "/", search: "" }) : location;
  return (
    <div className={`shell${isDetail ? " docked" : ""}`}>
      <nav className="sidebar">
        <div className="logo">Anime<b>Roll</b></div>
        {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.end}><Icon name={t.icon} />{t.label}</NavLink>)}
        <NavLink to="/search"><Icon name="search" />Cerca</NavLink>
        <span className="sp" />
        <NavLink to="/profile" className="user-link"><Icon name="user" />{user.username}</NavLink>
      </nav>
      <div className="main-area">
        <Routes location={bg}>
          <Route path="/" element={<HomePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/profile" element={<ProfilePage user={user} onLogout={onLogout} />} />
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

  useEffect(() => {
    if (!auth.token) { setReady(true); return; }
    api.me().then(setUser).catch(() => (auth.token = null)).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="center">Caricamento…</div>;
  if (!user) return <LoginPage onLogin={(token, u) => { auth.token = token; setUser(u); }} />;
  return <BrowserRouter><Shell user={user} onLogout={() => { auth.token = null; setUser(null); }} /></BrowserRouter>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
