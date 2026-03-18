import { memo } from "react";
import { useLang } from "../contexts/LangContext";
import { STATUS_COLORS } from "../styles/theme";

const STATUS_ICONS = {
  pending: "\u23F3",
  received: "\u2709\uFE0F",
  handed_over: "\u{1F91D}",
  deposited: "\u{1F3E6}",
  drawn: "\u{1F4B5}",
  delivered: "\u2705",
};

export default memo(function StatusPipeline({ flow, currentStatus }) {
  const { t } = useLang();
  const currentIdx = flow.indexOf(currentStatus);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
      {flow.map((status, i) => {
        const isCurrent = i === currentIdx;
        const isPast = i < currentIdx;
        const isFuture = i > currentIdx;
        const color = !isFuture ? STATUS_COLORS[status] : "#d1d5db";
        const isLast = i === flow.length - 1;

        return (
          <div key={status} style={{ display: "flex", alignItems: "flex-start" }}>
            {/* Circle + label column */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: isCurrent ? 32 : 28,
                  height: isCurrent ? 32 : 28,
                  borderRadius: "50%",
                  background: isFuture ? "#e8e8e8" : color,
                  border: isCurrent
                    ? `3px solid ${color}`
                    : `2px solid ${isFuture ? "#d1d5db" : color}`,
                  boxShadow: isCurrent ? `0 0 0 3px ${color}33` : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: isCurrent ? "0.8rem" : "0.7rem",
                  flexShrink: 0,
                  opacity: isPast ? 0.6 : 1,
                  filter: isFuture ? "grayscale(1)" : "none",
                }}
              >
                {STATUS_ICONS[status]}
              </div>
              {/* Text label under current step only */}
              {isCurrent && (
                <div
                  style={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    color: color,
                    marginTop: 3,
                    whiteSpace: "nowrap",
                    textAlign: "center",
                  }}
                >
                  {t(status)}
                </div>
              )}
            </div>
            {/* Connecting line */}
            {!isLast && (
              <div
                style={{
                  width: 16,
                  height: 2,
                  background: isPast ? STATUS_COLORS[flow[i + 1]] : "#d1d5db",
                  flexShrink: 0,
                  marginTop: isCurrent ? 15 : 13,
                  opacity: isPast ? 0.6 : 1,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});
