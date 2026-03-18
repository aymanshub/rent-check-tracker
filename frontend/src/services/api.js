import { GAS_URL } from "../config";

export async function gasRequest(action, data = {}) {
  const token = localStorage.getItem("id_token");
  if (!token) throw new Error("Not authenticated");

  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ token, action, ...data }),
  });

  const result = await response.json();

  if (result.error === "Unauthorized") {
    localStorage.removeItem("id_token");
    window.dispatchEvent(new Event("auth-expired"));
    throw new Error("Token expired");
  }

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}

export const api = {
  // Dashboard
  dashboard: () => gasRequest("dashboard"),

  // Bundles
  bundles: () => gasRequest("bundles"),
  createBundle: (data) => gasRequest("create_bundle", { data }),
  closeBundle: (bundleId) => gasRequest("close_bundle", { bundle_id: bundleId }),
  reopenBundle: (bundleId) => gasRequest("reopen_bundle", { bundle_id: bundleId }),
  deleteBundle: (bundleId) => gasRequest("delete_bundle", { bundle_id: bundleId }),

  // Checks
  checks: (bundleId) => gasRequest("checks", { bundle_id: bundleId }),
  advanceCheck: (checkId, recipientName) =>
    gasRequest("advance_check", { check_id: checkId, recipient_name: recipientName }),
  deleteCheck: (checkId) => gasRequest("delete_check", { check_id: checkId }),

  // Scan flow (two-step)
  scanCheck: (bundleId, base64Data, mimeType) =>
    gasRequest("scan_check", {
      bundle_id: bundleId,
      image_data: base64Data,
      mime_type: mimeType,
    }),
  confirmCheckData: (bundleId, base64Data, mimeType, confirmedData) =>
    gasRequest("confirm_check_data", {
      bundle_id: bundleId,
      image_data: base64Data,
      mime_type: mimeType,
      confirmed_data: confirmedData,
    }),

  // Users
  users: () => gasRequest("users"),
  addUser: (data) => gasRequest("add_user", { data }),
  removeUser: (userId) => gasRequest("remove_user", { user_id: userId }),
};
