import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Navbar({ settings = {} }) {
  const { t } = useLang();
  const { user, logout } = useAuth();

  const logoUrl = settings.app_logo_id
    ? `https://drive.google.com/thumbnail?id=${settings.app_logo_id}&sz=w80`
    : null;

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
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: "1.1rem" }}>
        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }}
          />
        )}
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
