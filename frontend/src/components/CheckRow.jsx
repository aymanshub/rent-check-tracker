import { useState, memo } from "react";
import { useLang } from "../contexts/LangContext";
import FamilyBadge from "./FamilyBadge";
import StatusPipeline from "./StatusPipeline";
import ImageLightbox from "./ImageLightbox";

function formatCurrency(amount) {
  return "\u20AA" + Number(amount || 0).toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return "\u2014";
  // Handle ISO datetime strings from Google Sheets (e.g. "2025-03-15T22:00:00.000Z")
  const clean = String(dateStr).split("T")[0];
  const [y, m, d] = clean.split("-");
  if (!y || !m || !d) return String(dateStr);
  return `${d}/${m}/${y}`;
}

function getFlow(check, bundle) {
  if (bundle.mode === "alternating") {
    return check.issued_to === bundle.checks_on_name
      ? ["pending", "received", "deposited"]
      : ["pending", "received", "handed_over"];
  }
  return ["pending", "received", "deposited", "drawn", "delivered"];
}

function getNextAction(check, bundle, t) {
  const flow = getFlow(check, bundle);
  const idx = flow.indexOf(check.status);
  if (idx < 0 || idx >= flow.length - 1) return null;
  const next = flow[idx + 1];
  const labels = {
    deposited: t("markDeposited"),
    handed_over: t("markHandedOver"),
    drawn: t("markDrawn"),
    delivered: t("markDelivered"),
  };
  return { status: next, label: labels[next] || next, needsRecipient: next === "handed_over" || next === "delivered" };
}

export default memo(function CheckRow({ check, bundle, onAdvance, onDelete, isAdmin }) {
  const { t } = useLang();
  const [lightbox, setLightbox] = useState(false);
  const [recipientPrompt, setRecipientPrompt] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [advancing, setAdvancing] = useState(false);

  const flow = getFlow(check, bundle);
  const action = isAdmin ? getNextAction(check, bundle, t) : null;
  const isTerminal = flow.indexOf(check.status) === flow.length - 1;

  const handleAdvance = async () => {
    if (action?.needsRecipient) {
      if (!recipientPrompt) {
        setRecipientPrompt(true);
        return;
      }
      if (!recipientName.trim()) return;
    }
    setAdvancing(true);
    try {
      await onAdvance(check.id, recipientName.trim() || undefined);
      setRecipientPrompt(false);
      setRecipientName("");
    } finally {
      setAdvancing(false);
    }
  };

  // Image thumbnail URL (Drive thumbnail)
  const thumbUrl = check.image_id
    ? `https://drive.google.com/thumbnail?id=${check.image_id}&sz=w100`
    : null;

  return (
    <div
      className="card"
      style={{ padding: 14, marginBottom: 8 }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* Thumbnail */}
        {thumbUrl && (
          <img
            src={thumbUrl}
            alt=""
            onClick={() => setLightbox(true)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 6,
              objectFit: "cover",
              cursor: "pointer",
              border: "1px solid var(--border)",
              flexShrink: 0,
            }}
          />
        )}

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                className="ltr-num"
                style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-muted)" }}
              >
                #{check.order}
              </span>
              <FamilyBadge family={check.issued_to} size="sm" />
            </div>
            <span className="ltr-num" style={{ fontWeight: 700, fontSize: "1rem" }}>
              {formatCurrency(check.amount)}
            </span>
          </div>

          {/* Meta row */}
          <div style={{ display: "flex", gap: 10, fontSize: "0.75rem", color: "var(--text-muted)", flexWrap: "wrap", marginBottom: 6 }}>
            {check.deposit_date && (
              <span className="ltr-num">{formatDate(check.deposit_date)}</span>
            )}
            {check.check_number && (
              <span className="ltr-num">#{check.check_number}</span>
            )}
            {check.bank_branch && <span>{check.bank_branch}</span>}
          </div>

          {/* Pipeline */}
          <StatusPipeline flow={flow} currentStatus={check.status} />

          {/* Draw amount — show as guide before drawn, and as record after */}
          {bundle.mode === "single" && Number(bundle.split_ratio) > 0 && (
            <div style={{ fontSize: "0.75rem", color: "var(--accent)", marginTop: 4 }}>
              {t("drawAmount")}: <span className="ltr-num">
                {formatCurrency(check.draw_amount && Number(check.draw_amount) > 0
                  ? check.draw_amount
                  : Math.round(Number(check.amount) * Number(bundle.split_ratio) / 100)
                )}
              </span>
            </div>
          )}

          {/* Recipient */}
          {check.recipient_name && (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
              {t("recipientName")}: {check.recipient_name}
            </div>
          )}

          {/* Recipient input prompt */}
          {recipientPrompt && (
            <div style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder={t("recipientNamePlaceholder")}
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                autoFocus
                style={{ marginBottom: 6 }}
              />
            </div>
          )}

          {/* Action buttons */}
          {isAdmin && !isTerminal && action && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleAdvance}
                disabled={advancing}
                style={{ fontSize: "0.8rem", padding: "6px 14px" }}
              >
                {advancing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : action.label}
              </button>
              {isAdmin && (
                <button
                  className="btn btn-ghost"
                  onClick={() => onDelete(check.id)}
                  style={{ fontSize: "0.75rem", color: "var(--danger)" }}
                >
                  {t("delete")}
                </button>
              )}
            </div>
          )}

          {isAdmin && isTerminal && (
            <div style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--status-delivered)", fontWeight: 600 }}>
              {t("completed")} {"\u2713"}
            </div>
          )}
        </div>
      </div>

      {lightbox && check.image_id && (
        <ImageLightbox
          src={`https://drive.google.com/thumbnail?id=${check.image_id}&sz=w800`}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  );
});
