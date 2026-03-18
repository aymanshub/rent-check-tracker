import { useState } from "react";
import { useLang } from "../contexts/LangContext";

export default function CreateBundleForm({ onSubmit, onCancel, submitting }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    label: "",
    mode: "single",
    checks_on_name: "george",
  });

  const update = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const canSubmit = form.label.trim() && !submitting;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(form);
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: "100%", padding: 24 }}
      >
        <h3 style={{ marginBottom: 20 }}>{t("newBundle")}</h3>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Label */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>
              {t("bundleLabel")}
            </label>
            <input
              className="input"
              value={form.label}
              onChange={(e) => update("label", e.target.value)}
              placeholder={t("bundleLabelPlaceholder")}
              autoFocus
            />
          </div>

          {/* Mode */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>
              {t("mode")}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {["single", "alternating"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => update("mode", m)}
                  className={form.mode === m ? "btn btn-primary" : "btn btn-outline"}
                  style={{ flex: 1 }}
                >
                  {t(m === "single" ? "singleName" : "alternating")}
                </button>
              ))}
            </div>
          </div>

          {/* Checks on name */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>
              {t("checksOnName")}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {["george", "asaad"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => update("checks_on_name", f)}
                  className={form.checks_on_name === f ? "btn btn-primary" : "btn btn-outline"}
                  style={{
                    flex: 1,
                    borderColor: form.checks_on_name === f
                      ? (f === "george" ? "var(--george)" : "var(--asaad)")
                      : undefined,
                    background: form.checks_on_name === f
                      ? (f === "george" ? "var(--george)" : "var(--asaad)")
                      : undefined,
                  }}
                >
                  {f === "george" ? t("familyGeorge") : t("familyAsaad")}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSubmit}
              style={{ flex: 1 }}
            >
              {submitting ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16 }} /> {t("loading")}
                </>
              ) : (
                t("createBundle")
              )}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onCancel}
              disabled={submitting}
              style={{ flex: 1 }}
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
