/**
 * Config.gs — Constants and configuration.
 * All .gs files share the same global scope in Google Apps Script.
 */

var CONFIG = {
  SHEET_NAMES: {
    USERS: "users",
    BUNDLES: "bundles",
    CHECKS: "checks",
    SETTINGS: "settings",
  },
  FAMILIES: {
    GEORGE: "george",
    ASAAD: "asaad",
  },
  ROLES: {
    ADMIN: "admin",
    MEMBER: "member",
  },
  STATUSES: {
    PENDING: "pending",
    RECEIVED: "received",
    HANDED: "handed_over",
    DEPOSITED: "deposited",
    DRAWN: "drawn",
    DELIVERED: "delivered",
  },
  FLOWS: {
    ALTERNATING_OWN:   ["received", "deposited"],
    ALTERNATING_OTHER: ["received", "handed_over"],
    SINGLE:            ["received", "deposited", "drawn", "delivered"],
  },
  // Column headers for each sheet (order matters — matches sheet columns)
  HEADERS: {
    USERS: ["id", "email", "name", "role", "family", "created_at"],
    BUNDLES: ["id", "label", "mode", "checks_on_name", "split_ratio", "status", "created_at"],
    CHECKS: [
      "id", "bundle_id", "order", "amount", "issued_to", "status",
      "deposit_date", "check_number", "bank_branch", "account_number", "payee_name",
      "image_id", "image_url",
      "date_received", "date_handed", "date_deposited", "date_drawn", "date_delivered",
      "recipient_name", "draw_amount"
    ],
    SETTINGS: ["key", "value"],
  },
  // Drive folder name for check images
  DRIVE_ROOT_FOLDER: "Rent Check Tracker",
};
