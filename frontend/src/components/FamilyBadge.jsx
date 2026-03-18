import { useLang } from "../contexts/LangContext";

const FAMILY_STYLES = {
  george: { bg: "#dbeafe", color: "#2563eb", border: "#93c5fd" },
  asaad: { bg: "#ede9fe", color: "#7c3aed", border: "#c4b5fd" },
};

export default function FamilyBadge({ family, size = "sm" }) {
  const { t } = useLang();
  const style = FAMILY_STYLES[family] || FAMILY_STYLES.george;
  const label = family === "george" ? t("familyGeorge") : t("familyAsaad");
  const pad = size === "sm" ? "2px 8px" : "4px 12px";
  const fontSize = size === "sm" ? "0.7rem" : "0.8rem";

  return (
    <span
      style={{
        display: "inline-block",
        padding: pad,
        borderRadius: 999,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        fontSize,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
