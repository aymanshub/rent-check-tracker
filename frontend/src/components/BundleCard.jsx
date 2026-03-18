import { useLang } from "../contexts/LangContext";
import FamilyBadge from "./FamilyBadge";

function formatCurrency(amount) {
  return "\u20AA" + Number(amount || 0).toLocaleString();
}

function getDateRange(checks) {
  const dates = checks
    .map((c) => c.deposit_date)
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return null;
  const fmt = (d) => {
    const [y, m] = d.split("-");
    return `${m}/${y}`;
  };
  if (dates.length === 1) return fmt(dates[0]);
  return `${fmt(dates[0])} \u2013 ${fmt(dates[dates.length - 1])}`;
}

export default function BundleCard({ bundle, checks = [], onClick }) {
  const { t } = useLang();
  const total = checks.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const isOpen = bundle.status === "open";
  const dateRange = getDateRange(checks);

  // Count completed checks
  const completedCount = checks.filter((c) => {
    if (bundle.mode === "alternating") {
      if (c.issued_to === bundle.checks_on_name) {
        return c.status === "deposited";
      }
      return c.status === "handed_over";
    }
    return c.status === "delivered";
  }).length;

  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        padding: 16,
        cursor: "pointer",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--shadow-md)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "var(--shadow)")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "1rem" }}>{bundle.label}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
            {t(bundle.mode === "single" ? "singleName" : "alternating")}
            {" \u2022 "}
            <FamilyBadge family={bundle.checks_on_name} size="sm" />
            {bundle.mode === "single" && ` \u2022 ${bundle.split_ratio}%`}
          </div>
        </div>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: "0.7rem",
            fontWeight: 600,
            background: isOpen ? "#dcfce7" : "#f1f5f9",
            color: isOpen ? "#16a34a" : "#64748b",
          }}
        >
          {t(isOpen ? "openBundle" : "closedBundle")}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, fontSize: "0.8rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
        <span>
          <span className="ltr-num" style={{ fontWeight: 600, color: "var(--text)" }}>
            {completedCount}/{checks.length}
          </span>{" "}
          {t("checksCount")}
        </span>
        {total > 0 && (
          <span>
            <span className="ltr-num" style={{ fontWeight: 600, color: "var(--text)" }}>
              {formatCurrency(total)}
            </span>
          </span>
        )}
        {dateRange && <span>{dateRange}</span>}
      </div>

      {/* Progress bar */}
      {checks.length > 0 && (
        <div
          style={{
            marginTop: 10,
            height: 4,
            borderRadius: 2,
            background: "var(--border)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(completedCount / checks.length) * 100}%`,
              background: "var(--primary)",
              borderRadius: 2,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}
