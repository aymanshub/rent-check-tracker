import { useState } from "react";
import { useLang } from "../contexts/LangContext";
import FamilyBadge from "./FamilyBadge";
import ImageLightbox from "./ImageLightbox";

// Convert YYYY-MM-DD → DD/MM/YYYY for display
function toDisplay(isoDate) {
  if (!isoDate) return "";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate;
}

// Convert DD/MM/YYYY → YYYY-MM-DD for storage
function toISO(displayDate) {
  if (!displayDate) return "";
  const m = displayDate.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : displayDate;
}

export default function CheckScanReview({
  imagePreview,
  extractedData,
  bundleMode,
  bundleFamily,
  onConfirm,
  onCancel,
  isSubmitting,
  warning,
}) {
  const { t } = useLang();
  // Pre-fill payee from bundle family name (more reliable than Gemini)
  const familyNames = { george: t("familyGeorge"), asaad: t("familyAsaad") };
  const defaultPayee = bundleMode === "single" && bundleFamily
    ? familyNames[bundleFamily] || ""
    : extractedData?.payee_name || "";

  const [form, setForm] = useState({
    amount: extractedData?.amount || "",
    deposit_date: toDisplay(extractedData?.deposit_date || ""),
    check_number: extractedData?.check_number || "",
    bank_branch: extractedData?.bank_branch || "",
    account_number: extractedData?.account_number || "",
    payee_name: defaultPayee,
    issued_to: "",
  });
  const [lightbox, setLightbox] = useState(false);

  const update = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const canConfirm = Number(form.amount) > 0 && (bundleMode !== "alternating" || form.issued_to);

  // Convert date back to YYYY-MM-DD before sending to backend
  const handleConfirm = () => {
    onConfirm({ ...form, deposit_date: toISO(form.deposit_date) });
  };

  const fields = [
    { key: "amount", label: t("amount"), type: "number", inputMode: "decimal", prefix: "\u20AA" },
    { key: "deposit_date", label: t("depositDate") + " (DD/MM/YYYY)", type: "text", inputMode: "numeric" },
    { key: "check_number", label: t("checkNumber"), type: "text" },
    { key: "bank_branch", label: t("bankBranch"), type: "text" },
    { key: "account_number", label: t("accountNumber"), type: "text" },
    { key: "payee_name", label: t("payeeName"), type: "text" },
  ];

  return (
    <div className="overlay" style={{ alignItems: "flex-start", overflowY: "auto" }}>
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480,
          width: "100%",
          margin: "16px auto",
          padding: 20,
        }}
      >
        <h3 style={{ marginBottom: 16 }}>{t("reviewCheck")}</h3>

        {/* Image preview */}
        {imagePreview && (
          <img
            src={imagePreview}
            alt="Scanned check"
            onClick={() => setLightbox(true)}
            style={{
              width: "100%",
              maxHeight: 200,
              objectFit: "cover",
              borderRadius: 8,
              marginBottom: 16,
              cursor: "pointer",
              border: "1px solid var(--border)",
            }}
          />
        )}

        {warning && (
          <div
            style={{
              padding: "8px 12px",
              background: "var(--accent-light)",
              borderRadius: 8,
              fontSize: "0.85rem",
              color: "var(--accent)",
              marginBottom: 12,
            }}
          >
            {warning}
          </div>
        )}

        {/* Editable fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {fields.map((f) => (
            <div key={f.key}>
              <label
                style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}
              >
                {f.label} {f.key === "amount" && "*"}
              </label>
              <input
                className={`input ${!form[f.key] && f.key !== "amount" ? "" : ""} ${
                  f.key === "amount" && !form[f.key] ? "input-warn" : ""
                }`}
                type={f.type}
                inputMode={f.inputMode}
                value={form[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.label}
                style={f.key === "amount" ? { fontWeight: 700, fontSize: "1.1rem" } : {}}
              />
            </div>
          ))}

          {/* Family selector for alternating mode */}
          {bundleMode === "alternating" && (
            <div>
              <label
                style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}
              >
                {t("belongsTo")} *
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {["george", "asaad"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => update("issued_to", f)}
                    className={form.issued_to === f ? "btn btn-primary" : "btn btn-outline"}
                    style={{ flex: 1 }}
                  >
                    <FamilyBadge family={f} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI notice */}
        <div
          style={{
            marginTop: 16,
            padding: "8px 12px",
            background: "#fefce8",
            borderRadius: 8,
            fontSize: "0.8rem",
            color: "#a16207",
            textAlign: "center",
          }}
        >
          {t("aiExtracted")}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!canConfirm || isSubmitting}
            style={{ flex: 1 }}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} /> {t("saving")}
              </>
            ) : (
              t("confirmSave")
            )}
          </button>
          <button
            className="btn btn-outline"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{ flex: 1 }}
          >
            {t("cancel")}
          </button>
        </div>
      </div>

      {lightbox && <ImageLightbox src={imagePreview} onClose={() => setLightbox(false)} />}
    </div>
  );
}
