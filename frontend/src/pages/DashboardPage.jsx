import { useEffect } from "react";
import { useLang } from "../contexts/LangContext";
import { useDashboard } from "../hooks/useDashboard";
import StatCard from "../components/StatCard";
import BundleCard from "../components/BundleCard";

export default function DashboardPage({ onNavigateBundle, checksCache }) {
  const { t } = useLang();
  const { data, loading, error, refresh } = useDashboard();

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading && !data) {
    return (
      <div className="page" style={{ textAlign: "center", paddingTop: 60 }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <p style={{ marginTop: 12, color: "var(--text-muted)" }}>{t("loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page" style={{ textAlign: "center", paddingTop: 60 }}>
        <p style={{ color: "var(--danger)" }}>{error}</p>
        <button className="btn btn-outline" onClick={refresh} style={{ marginTop: 12 }}>
          {t("retry")}
        </button>
      </div>
    );
  }

  const bundles = data?.bundles || [];
  const openBundleCount = bundles.filter((b) => b.status === "open").length;

  return (
    <div className="page">
      {/* Stat cards */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label={t("totalChecks")} value={data?.total || 0} />
        <StatCard label={t("awaitingAction")} value={data?.awaiting_action || 0} color="var(--accent)" />
        <StatCard label={t("completed")} value={data?.completed || 0} color="var(--status-delivered)" />
        <StatCard label={t("openBundles")} value={openBundleCount} color="var(--primary)" />
      </div>

      {/* Bundle list */}
      <h3 style={{ marginBottom: 12, fontSize: "1rem" }}>{t("bundles")}</h3>
      {bundles.length === 0 ? (
        <div
          className="card"
          style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}
        >
          <p style={{ fontSize: "1.2rem", marginBottom: 4 }}>{t("noBundles")}</p>
          <p style={{ fontSize: "0.85rem" }}>{t("noBundlesDesc")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {bundles.map((bundle) => (
            <BundleCard
              key={bundle.id}
              bundle={bundle}
              checks={checksCache?.[bundle.id] || []}
              onClick={() => onNavigateBundle(bundle.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
