import { useLang } from "../contexts/LangContext";

export default function ConfirmDialog({ message, onConfirm, onCancel, danger }) {
  const { t } = useLang();

  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: 24,
          maxWidth: 360,
          width: "100%",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "1rem", marginBottom: 20, lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            className={danger ? "btn btn-danger" : "btn btn-primary"}
            onClick={onConfirm}
            style={{ flex: 1 }}
          >
            {t("confirm")}
          </button>
          <button
            className="btn btn-outline"
            onClick={onCancel}
            style={{ flex: 1 }}
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
