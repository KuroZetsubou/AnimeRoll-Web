import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { api, auth, User } from "./api";
import { DownloadsPage, HomePage, LibraryPage, LoginPage, SearchPage, SettingsPage, TitlePage } from "./pages";
import "./styles.css";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth.token) { setReady(true); return; }
    api.me().then(setUser).catch(() => (auth.token = null)).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="center">Caricamento…</div>;
  if (!user) return <LoginPage onLogin={(token, u) => { auth.token = token; setUser(u); }} />;

  return (
    <BrowserRouter>
      <nav className="topbar">
        <span className="logo">▶ AnimeRoll</span>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/search">Cerca</NavLink>
        <NavLink to="/library">Libreria</NavLink>
        <NavLink to="/downloads">Download</NavLink>
        <NavLink to="/settings">{user.username}</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/settings" element={<SettingsPage user={user} onLogout={() => { auth.token = null; setUser(null); }} />} />
        <Route path="/anime/:aniListId" element={<TitlePage />} />
        <Route path="/series/:seriesId" element={<TitlePage />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
