import { useLang } from "../contexts/LangContext";

const LANGS = [
  // { code: "en", label: "English" },
  { code: "ar", label: "\u0639\u0631\u0628\u064A" },
  { code: "he", label: "\u05E2\u05D1\u05E8\u05D9\u05EA" },
];

export default function LanguageSwitcher({ compact }) {
  const { lang, setLang } = useLang();

  if (compact) {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            className="btn-ghost"
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: "0.8rem",
              fontWeight: lang === l.code ? 700 : 400,
              background: lang === l.code ? "var(--primary-light)" : "transparent",
              color: lang === l.code ? "var(--primary)" : "var(--text-muted)",
            }}
          >
            {l.code.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className={lang === l.code ? "btn btn-primary" : "btn btn-outline"}
          style={{ flex: 1, minWidth: 80 }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
