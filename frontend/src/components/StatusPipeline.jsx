import { STATUS_COLORS } from "../styles/theme";

const STATUS_ICONS = {
  pending: "\u23F3",
  received: "\u2709\uFE0F",
  handed_over: "\u{1F91D}",
  deposited: "\u{1F3E6}",
  drawn: "\u{1F4B5}",
  delivered: "\u2705",
};

export default function StatusPipeline({ flow, currentStatus }) {
  const currentIdx = flow.indexOf(currentStatus);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {flow.map((status, i) => {
        const achieved = i <= currentIdx;
        const color = achieved ? STATUS_COLORS[status] : "#d1d5db";
        const isLast = i === flow.length - 1;

        return (
          <div key={status} style={{ display: "flex", alignItems: "center" }}>
            {/* Circle */}
            <div
              title={status}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: achieved ? color : "#f1f5f9",
                border: `2px solid ${color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                flexShrink: 0,
              }}
            >
              {achieved ? STATUS_ICONS[status] : ""}
            </div>
            {/* Connecting line */}
            {!isLast && (
              <div
                style={{
                  width: 16,
                  height: 2,
                  background: i < currentIdx ? STATUS_COLORS[flow[i + 1]] : "#d1d5db",
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
