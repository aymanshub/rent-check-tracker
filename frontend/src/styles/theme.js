const theme = {
  colors: {
    bg: "#f5f0e8",
    bgGradient: "linear-gradient(135deg, #f5f0e8, #ede7db)",
    card: "#ffffff",
    primary: "#1a6b5a",
    primaryLight: "#e8f5f0",
    accent: "#c4993c",
    accentLight: "#fdf6e8",
    text: "#2c2c2c",
    textMuted: "#7a7a7a",
    border: "#e8e2d8",
    danger: "#dc4444",
    george: "#2563eb",
    asaad: "#7c3aed",
    statusPending: "#94a3b8",
    statusReceived: "#3b82f6",
    statusHanded: "#8b5cf6",
    statusDeposited: "#f59e0b",
    statusDrawn: "#f97316",
    statusDelivered: "#10b981",
  },
  fonts: {
    en: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    ar: "'Noto Sans Arabic', 'Segoe UI', sans-serif",
    he: "'Noto Sans Hebrew', 'Segoe UI', sans-serif",
  },
};

export default theme;

export const STATUS_COLORS = {
  pending: theme.colors.statusPending,
  received: theme.colors.statusReceived,
  handed_over: theme.colors.statusHanded,
  deposited: theme.colors.statusDeposited,
  drawn: theme.colors.statusDrawn,
  delivered: theme.colors.statusDelivered,
};

export const FAMILY_COLORS = {
  george: theme.colors.george,
  asaad: theme.colors.asaad,
};
