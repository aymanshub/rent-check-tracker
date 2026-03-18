export default function StatCard({ label, value, color }) {
  return (
    <div
      className="card"
      style={{
        padding: "16px",
        textAlign: "center",
      }}
    >
      <div
        className="ltr-num"
        style={{
          fontSize: "1.8rem",
          fontWeight: 700,
          color: color || "var(--primary)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "0.8rem",
          color: "var(--text-muted)",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}
