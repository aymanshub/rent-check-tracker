import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Navbar() {
  const { t } = useLang();
  const { user, logout } = useAuth();

  return (
    <nav
      style={{
        background: "var(--primary)",
        color: "white",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>
        {t("appName")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LanguageSwitcher compact />
        {user && (
          <button
            onClick={logout}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: "0.8rem",
              background: "rgba(255,255,255,0.15)",
              color: "white",
            }}
          >
            {t("signOut")}
          </button>
        )}
      </div>
    </nav>
  );
}
