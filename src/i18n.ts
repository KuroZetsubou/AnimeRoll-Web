// Translations. The English text in the code IS the key: `t("Delete episode")`.
// A language is one file in src/locales/ (see locales/README.md): it maps English text to its translation,
// and anything it leaves out shows in English. Placeholders look like {name}: t("{n} episodes", { n: 12 }).
type Catalog = Record<string, string>;
type LocaleModule = { default: Catalog; name: string };

const modules = import.meta.glob<LocaleModule>("./locales/*.ts", { eager: true });
export const LANGUAGES: { code: string; name: string }[] = [{ code: "en", name: "English" }];
const catalogs: Record<string, Catalog> = { en: {} };
for (const [path, mod] of Object.entries(modules)) {
  const code = path.match(/\.\/locales\/(.+)\.ts$/)?.[1];
  if (!code || code === "en") continue;
  catalogs[code] = mod.default;
  LANGUAGES.push({ code, name: mod.name });
}

const KEY = "animeroll.lang";
function detect(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && catalogs[saved]) return saved;
  } catch { /* private mode */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.slice(0, 2).toLowerCase();
    if (catalogs[code]) return code;
  }
  return "en";
}

export let lang = detect();
document.documentElement.lang = lang;

/** Changes the language and reloads, so every text is rebuilt in it. */
export function setLang(code: string) {
  try { localStorage.setItem(KEY, code); } catch { /* private mode */ }
  location.reload();
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const s = catalogs[lang]?.[text] ?? text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Locale for dates and numbers ("it-IT", "en-US"…). */
export const dateLocale = lang === "en" ? "en-US" : lang;
