import { useLang } from "../contexts/LangContext";
import StatCard from "../components/StatCard";
import BundleCard from "../components/BundleCard";

export default function DashboardPage({ stats, bundles = [], onNavigateBundle, checksCache }) {
  const { t } = useLang();

  if (!stats) {
    return (
      <div className="page" style={{ textAlign: "center", paddingTop: 60 }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <p style={{ marginTop: 12, color: "var(--text-muted)" }}>{t("loading")}</p>
      </div>
    );
  }

  const openBundleCount = bundles.filter((b) => b.status === "open").length;

  return (
    <div className="page">
      {/* Stat cards */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label={t("totalChecks")} value={stats.total} />
        <StatCard label={t("awaitingAction")} value={stats.awaiting_action} color="var(--accent)" />
        <StatCard label={t("completed")} value={stats.completed} color="var(--status-delivered)" />
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
