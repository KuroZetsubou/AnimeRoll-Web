import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

// Lucide-style stroke icons (2px, 24 grid), inlined so the app has no CDN dependency.
const P: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  house: <><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  compass: <><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></>,
  library: <><path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" /></>,
  down: <><path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" /></>,
  user: <><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></>,
  play: <polygon points="6 3 20 12 6 21 6 3" />,
  pause: <><rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  chevdown: <path d="m6 9 6 6 6-6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  plus: <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  ccw: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>,
  cw: <><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>,
  skip: <><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" x2="19" y1="5" y2="19" /></>,
  ff: <><polygon points="13 19 22 12 13 5 13 19" /><polygon points="2 19 11 12 2 5 2 19" /></>,
  audio: <><path d="M4 12v0M8 8v8M12 5v14M16 9v6M20 11v2" /></>,
  move: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  minus: <path d="M5 12h14" />,
  captions: <><rect width="18" height="14" x="3" y="5" rx="2" /><path d="M7 15h4M15 15h2M7 11h2M13 11h4" /></>,
  calendar: <><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  trash: <><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></>,
  link: <><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 1 1 0 10h-2" /><path d="M8 12h8" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  key: <><path d="m21 2-9.6 9.6" /><circle cx="7.5" cy="15.5" r="5.5" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>,
  server: <><rect width="20" height="8" x="2" y="2" rx="2" /><rect width="20" height="8" x="2" y="14" rx="2" /><path d="M6 6h.01M6 18h.01" /></>,
  lock: <><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  pip: <><path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4" /><rect width="10" height="7" x="12" y="13" rx="2" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  ok: <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  folder: <><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>,
  broom: <><path d="m16 22-1-4" /><path d="M19 13.99a1 1 0 0 0 1-1V12a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v.99a1 1 0 0 0 1 1" /><path d="M5 14h14l1.973 6.767A1 1 0 0 1 20 22H4a1 1 0 0 1-.973-1.233z" /><path d="m8 22 1-4" /></>,
  zap: <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
};

export function Icon({ name, size = 22, color }: { name: string; size?: number; color?: string }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  );
}

type BtnProps = { variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" | "lg"; icon?: string; full?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>;
export function Button({ variant = "primary", size = "md", icon, full, children, className = "", ...rest }: BtnProps) {
  const cls = ["btn", variant === "primary" ? "" : variant, size === "md" ? "" : size, full ? "full" : "", className].filter(Boolean).join(" ");
  return <button className={cls} {...rest}>{icon && <Icon name={icon} size={size === "sm" ? 16 : 20} />}{children}</button>;
}

export function IconButton({ icon, label, filled, ...rest }: { icon: string; label: string; filled?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`iconbtn${filled ? " filled" : ""}`} aria-label={label} {...rest}><Icon name={icon} /></button>;
}

export const Chip = ({ on, small, children, onClick }: { on?: boolean; small?: boolean; children: React.ReactNode; onClick?: () => void }) =>
  <button className={`chip${on ? " on" : ""}${small ? " small" : ""}`} onClick={onClick}>{children}</button>;

export const Badge = ({ tone, children }: { tone?: "teal" | "neutral"; children: React.ReactNode }) => <span className={`badge ${tone ?? ""}`}>{children}</span>;

export function Segmented<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return <div className="segmented">{options.map((o) => <button key={o} className={o === value ? "on" : ""} onClick={() => onChange(o)}>{o}</button>)}</div>;
}

export function Field({ label, icon, ...rest }: { label?: string; icon?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <div className="input">{icon && <Icon name={icon} size={20} />}<input {...rest} /></div>
    </label>
  );
}

export const Progress = ({ value }: { value: number }) => <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;

export function Empty({ icon, children }: { icon: string; children: React.ReactNode }) {
  return <div className="empty"><Icon name={icon} size={34} />{children}</div>;
}

export function Drawer({ title, onClose, children }: { title?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  // Rendered on <body> so a docked or animated parent never clips or offsets it.
  return createPortal(
    <div className="backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        {title && <header><h2>{title}</h2><IconButton icon="x" label="Chiudi" onClick={onClose} /></header>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Poster card: portrait (2:3) or landscape (16:9), optional rank number (Top 10), badge and progress line. */
export function PosterCard({ to, title, meta, img, badge, progress, landscape, rank, onClick }:
  { to?: string; title?: string; meta?: string; img?: string; badge?: string; progress?: number; landscape?: boolean; rank?: number; onClick?: () => void }) {
  const inner = (
    <>
      {rank != null && <span className="rank">{rank}</span>}
      <div className="art" style={img ? { backgroundImage: `url(${img})` } : undefined}>
        {badge && <span className="badge">{badge}</span>}
        {progress != null && <Progress value={progress} />}
      </div>
      {title && <div className="t">{title}</div>}
      {meta && <div className="m">{meta}</div>}
    </>
  );
  const loc = useLocation();
  const hideKeyboard = () => (document.activeElement as HTMLElement | null)?.blur();
  const cls = `poster${landscape ? " landscape" : ""}${rank != null ? " ranked" : ""}`;
  return to ? <Link onClick={hideKeyboard} to={to} state={{ bg: (loc.state as { bg?: unknown } | null)?.bg ?? loc }} className={cls}>{inner}</Link> : <div className={cls} onClick={onClick} style={{ cursor: "pointer" }}>{inner}</div>;
}

export function Shelf({ title, children }: { title: string; children: React.ReactNode[] }) {
  if (!children.length) return null;
  return <section className="shelf-wrap"><h2>{title}</h2><div className="shelf">{children}</div></section>;
}

export function SettingsRow({ icon, label, value, toggle, onToggle, onClick, danger }:
  { icon?: string; label: React.ReactNode; value?: string; toggle?: boolean; onToggle?: (v: boolean) => void; onClick?: () => void; danger?: boolean }) {
  const isToggle = toggle !== undefined;
  return (
    <button className={`row-s${danger ? " danger" : ""}`} onClick={isToggle ? () => onToggle?.(!toggle) : onClick} style={!isToggle && !onClick ? { cursor: "default" } : undefined}>
      {icon && <Icon name={icon} color={danger ? "var(--danger)" : "var(--text-2)"} />}
      <span className="l">{label}</span>
      {value && <span className="v">{value}</span>}
      {isToggle ? <span className={`switch${toggle ? " on" : ""}`} /> : onClick && !danger && <Icon name="right" size={18} color="var(--text-3)" />}
    </button>
  );
}

export function Group({ title, note, children }: { title?: string; note?: string; children: React.ReactNode }) {
  return <div className="group">{title && <h3>{title}</h3>}<div className="box">{children}</div>{note && <p className="note">{note}</p>}</div>;
}

/** Compact = phone width: pickers go full screen instead of a centered modal. */
export function useCompact() {
  const [c, setC] = useState(() => window.matchMedia("(max-width: 899px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 899px)");
    const h = () => setC(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return c;
}

export const fmtTime = (s: number) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(x).padStart(2, "0")}`;
};
