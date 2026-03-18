import { GAS_URL } from "../config";

/**
 * Makes a request to the Google Apps Script backend.
 *
 * GAS web apps return a 302 redirect. On mobile browsers, POST requests
 * get downgraded to GET on redirect (per HTTP spec), causing Google to
 * return an HTML page instead of JSON. We detect this and follow the
 * redirect URL manually with a fresh POST.
 */
export async function gasRequest(action, data = {}) {
  const token = localStorage.getItem("id_token");
  if (!token) throw new Error("Not authenticated");

  const payload = JSON.stringify({ token, action, ...data });
  const fetchOpts = {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: payload,
    redirect: "follow",
  };

  let text = await doFetch(GAS_URL, fetchOpts);

  // On mobile, GAS may return an HTML redirect page instead of JSON.
  // Extract the redirect URL and retry with a fresh POST.
  if (text.trimStart().startsWith("<")) {
    const redirectUrl = extractRedirectUrl(text);
    if (redirectUrl) {
      text = await doFetch(redirectUrl, fetchOpts);
    }
  }

  // Still HTML? Fail gracefully.
  if (text.trimStart().startsWith("<")) {
    throw new Error("Server returned an unexpected response. Please try again.");
  }

  const result = JSON.parse(text);

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

async function doFetch(url, opts) {
  const response = await fetch(url, opts);
  return response.text();
}

/**
 * GAS HTML redirect pages contain a URL in either:
 *   - A meta refresh tag: <meta http-equiv="refresh" content="0; url=...">
 *   - An anchor tag: <a href="...">
 * Extract and return it.
 */
function extractRedirectUrl(html) {
  // Try meta refresh
  const metaMatch = html.match(/content=["'][^"']*url=([^"'\s>]+)/i);
  if (metaMatch) return metaMatch[1].replace(/&amp;/g, "&");

  // Try anchor href
  const hrefMatch = html.match(/href="([^"]+)"/);
  if (hrefMatch) return hrefMatch[1].replace(/&amp;/g, "&");

  return null;
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
