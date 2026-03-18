import { useEffect, useRef } from "react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function LoginPage({ settings = {} }) {
  const { t } = useLang();
  const { renderSignInButton, error } = useAuth();
  const btnRef = useRef();

  useEffect(() => {
    if (btnRef.current) {
      renderSignInButton(btnRef.current);
    }
  }, [renderSignInButton]);

  const logoUrl = settings.app_logo_id
    ? `https://drive.google.com/thumbnail?id=${settings.app_logo_id}&sz=w200`
    : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg-gradient)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="App logo"
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              objectFit: "cover",
              margin: "0 auto 16px",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: "2.2rem",
            }}
          >
            {"\u{1F3E0}"}
          </div>
        )}
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)", marginBottom: 8 }}>
          {t("appName")}
        </h1>
      </div>

      <div
        className="card"
        style={{
          padding: "32px 24px",
          maxWidth: 360,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div ref={btnRef} style={{ display: "flex", justifyContent: "center" }} />

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 8,
              background: "#fef2f2",
              color: "var(--danger)",
              fontSize: "0.85rem",
            }}
          >
            {error === "Unauthorized" ? t("unauthorized") : error}
          </div>
        )}
      </div>

      <div style={{ marginTop: 32 }}>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
