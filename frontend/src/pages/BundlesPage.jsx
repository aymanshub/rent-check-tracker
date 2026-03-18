import { useState } from "react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";
import BundleCard from "../components/BundleCard";
import CreateBundleForm from "../components/CreateBundleForm";

export default function BundlesPage({ onNavigateBundle, checksCache, onRefreshAll, bundles = [] }) {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (data) => {
    setCreating(true);
    try {
      await api.createBundle(data);
    } catch {
      // GAS may save but response corrupted on mobile
    }
    setCreating(false);
    setShowCreate(false);
    if (onRefreshAll) onRefreshAll();
  };

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: "1.2rem" }}>{t("bundles")}</h2>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + {t("newBundle")}
          </button>
        )}
      </div>

      {bundles.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
          <p style={{ fontSize: "1.2rem", marginBottom: 4 }}>{t("noBundles")}</p>
          <p style={{ fontSize: "0.85rem" }}>{t("noBundlesDesc")}</p>
        </div>
      )}

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

      {showCreate && (
        <CreateBundleForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          submitting={creating}
        />
      )}
    </div>
  );
}
