import { useLang } from "../contexts/LangContext";

const TABS = [
  { key: "dashboard", icon: "\u{1F3E0}" },
  { key: "bundles", icon: "\u{1F4E6}" },
  { key: "settings", icon: "\u2699\uFE0F" },
];

export default function TabBar({ active, onNavigate }) {
  const { t } = useLang();

  return (
    <div
      className="tab-bar"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--card)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-around",
        zIndex: 100,
        boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
      }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onNavigate(tab.key)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "10px 0 8px",
              color: isActive ? "var(--primary)" : "var(--text-muted)",
              fontWeight: isActive ? 600 : 400,
              fontSize: "0.7rem",
              minHeight: 56,
              transition: "color 0.15s",
            }}
          >
            <span style={{ fontSize: "1.3rem" }}>{tab.icon}</span>
            <span>{t(tab.key)}</span>
          </button>
        );
      })}
    </div>
  );
}
