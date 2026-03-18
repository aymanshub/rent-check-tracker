import { useEffect, useState } from "react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import { useBundles } from "../hooks/useBundles";
import BundleCard from "../components/BundleCard";
import CreateBundleForm from "../components/CreateBundleForm";

export default function BundlesPage({ onNavigateBundle, checksCache }) {
  const { t } = useLang();
  const { user } = useAuth();
  const { bundles, loading, error, refresh, create } = useBundles();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (data) => {
    setCreating(true);
    try {
      try {
        await create(data);
      } catch {
        // GAS may save successfully but response corrupted on mobile
      }
      setShowCreate(false);
      await refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: "1.2rem" }}>{t("bundles")}</h2>
        {user && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + {t("newBundle")}
          </button>
        )}
      </div>

      {loading && bundles.length === 0 && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      )}

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: 12 }}>
          {error}
          <button className="btn btn-ghost" onClick={refresh} style={{ marginInlineStart: 8 }}>
            {t("retry")}
          </button>
        </div>
      )}

      {!loading && bundles.length === 0 && !error && (
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
