import { useEffect, useState } from "react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import { useUsers } from "../hooks/useUsers";
import LanguageSwitcher from "../components/LanguageSwitcher";
import FamilyBadge from "../components/FamilyBadge";
import ConfirmDialog from "../components/ConfirmDialog";

export default function SettingsPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const { users, loading, refresh, add, remove } = useUsers();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", name: "", family: "george" });
  const [adding, setAdding] = useState(false);
  const [removeId, setRemoveId] = useState(null);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await add(addForm);
      setShowAdd(false);
      setAddForm({ email: "", name: "", family: "george" });
      await refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async () => {
    if (!removeId) return;
    try {
      await remove(removeId);
      setRemoveId(null);
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="page">
      <h2 style={{ fontSize: "1.2rem", marginBottom: 20 }}>{t("settings")}</h2>

      {/* Language */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: 10 }}>{t("language")}</h3>
        <LanguageSwitcher />
      </div>

      {/* User Management */}
      {user && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: "0.95rem" }}>{t("userManagement")}</h3>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
              + {t("addUser")}
            </button>
          </div>

          {loading && users.length === 0 && (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div className="spinner" />
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--bg)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{u.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{u.email}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <FamilyBadge family={u.family} size="sm" />
                    <span
                      style={{
                        padding: "1px 8px",
                        borderRadius: 999,
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        background: u.role === "admin" ? "var(--accent-light)" : "#f1f5f9",
                        color: u.role === "admin" ? "var(--accent)" : "var(--text-muted)",
                      }}
                    >
                      {t(u.role)}
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => setRemoveId(u.id)}
                  style={{ color: "var(--danger)", fontSize: "0.75rem" }}
                >
                  {t("removeUser")}
                </button>
              </div>
            ))}
          </div>

          {users.length === 0 && !loading && (
            <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 16 }}>
              {t("noUsers")}
            </p>
          )}
        </div>
      )}

      {/* Add user form */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400, width: "100%", padding: 24 }}
          >
            <h3 style={{ marginBottom: 16 }}>{t("addUser")}</h3>
            <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                className="input"
                type="email"
                placeholder={t("email")}
                value={addForm.email}
                onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                required
                autoFocus
              />
              <input
                className="input"
                placeholder={t("name")}
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
              <div style={{ display: "flex", gap: 8 }}>
                {["george", "asaad"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAddForm((p) => ({ ...p, family: f }))}
                    className={addForm.family === f ? "btn btn-primary" : "btn btn-outline"}
                    style={{ flex: 1 }}
                  >
                    {f === "george" ? t("familyGeorge") : t("familyAsaad")}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" className="btn btn-primary" disabled={adding} style={{ flex: 1 }}>
                  {adding ? <span className="spinner" style={{ width: 16, height: 16 }} /> : t("addUser")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAdd(false)}
                  style={{ flex: 1 }}
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove confirm */}
      {removeId && (
        <ConfirmDialog
          message={t("confirmRemoveUser")}
          onConfirm={handleRemove}
          onCancel={() => setRemoveId(null)}
          danger
        />
      )}
    </div>
  );
}
