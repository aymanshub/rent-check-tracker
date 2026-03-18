import { GAS_URL } from "../config";

// ═══════════════════════════════════════════
// API response caching (stale-while-revalidate)
// ═══════════════════════════════════════════

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  try {
    const raw = localStorage.getItem("api_cache_" + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function setCache(key, data) {
  try {
    localStorage.setItem("api_cache_" + key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage full — ignore */ }
}

function clearApiCache() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("api_cache_")) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

/**
 * Makes a request to the Google Apps Script backend.
 * Retries up to 3 times on corrupted responses (common on mobile
 * due to GAS redirect chain).
 */
export async function gasRequest(action, data = {}, retries = 3) {
  const token = localStorage.getItem("id_token");
  if (!token) throw new Error("Not authenticated");

  const payload = JSON.stringify({ token, action, ...data });
  const fetchOpts = {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: payload,
    redirect: "follow",
  };

  let lastError;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      let text = await doFetch(GAS_URL, fetchOpts);

      // On mobile, GAS may return an HTML redirect page instead of JSON.
      if (text.trimStart().startsWith("<")) {
        const redirectUrl = extractRedirectUrl(text);
        if (redirectUrl) {
          text = await doFetch(redirectUrl, fetchOpts);
        }
      }

      if (text.trimStart().startsWith("<")) {
        throw new Error("HTML response");
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
    } catch (err) {
      lastError = err;
      // Don't retry auth errors
      if (err.message === "Token expired" || err.message === "Not authenticated") {
        throw err;
      }
      // Wait briefly before retrying (300ms base instead of 500ms)
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

async function doFetch(url, opts) {
  const response = await fetch(url, opts);
  return response.text();
}

function extractRedirectUrl(html) {
  const metaMatch = html.match(/content=["'][^"']*url=([^"'\s>]+)/i);
  if (metaMatch) return metaMatch[1].replace(/&amp;/g, "&");
  const hrefMatch = html.match(/href="([^"]+)"/);
  if (hrefMatch) return hrefMatch[1].replace(/&amp;/g, "&");
  return null;
}

// ═══════════════════════════════════════════
// Gemini direct call — bypasses GAS for AI extraction
// to avoid mobile redirect issues with large payloads
// ═══════════════════════════════════════════

let _geminiKey = null;

async function getGeminiKey() {
  if (_geminiKey) return _geminiKey;
  const result = await gasRequest("get_gemini_key");
  _geminiKey = result.key;
  return _geminiKey;
}

/**
 * Calls Gemini to extract check data. Single call (no crop).
 * Accepts optional prefillHints from prior checks in the bundle.
 */
async function callGeminiDirect(base64Data, mimeType, prefillHints) {
  const apiKey = await getGeminiKey();
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const inlineData = { mimeType, data: base64Data };

  const promptLines = [
    "Extract data from this Israeli bank check (שיק) photo.",
    "",
    "Israeli check layout guide:",
    "- TOP-RIGHT: issuer/drawer (printed org name) — this is who WROTE the check, NOT the payee",
    "- TOP-LEFT: date field",
    "- MIDDLE: payee line (לפקודת) — THIS is the payee, the person/entity the check is made out to",
    "- CENTER: amount in digits and words",
    "- BOTTOM: MICR line containing bank code, branch number, account number, check number",
    "- NOTE: check may have a receipt stub (ספח) attached at the top — IGNORE it, focus only on the check portion below",
    "",
    "Return ONLY a JSON object with these fields (use empty string if unreadable):",
    '{"amount":"3500","deposit_date":"2025-03-15","check_number":"1234567","bank_branch":"12-345","account_number":"987654","payee_name":"שם הנפרע"}',
    "",
    "Rules:",
    "- amount: digits only, no ₪ symbol, no commas",
    "- deposit_date: YYYY-MM-DD format",
    "- check_number: from MICR line at bottom",
    "- bank_branch: format as 'bank_code-branch_number' from MICR line",
    "- account_number: from MICR line",
    "- payee_name: from the לפקודת line (the payee), NOT the issuer/drawer printed at top-right",
  ];

  if (prefillHints) {
    promptLines.push("");
    promptLines.push("Previous checks in this bundle had these values — use them unless clearly different on this check:");
    if (prefillHints.bank_branch) promptLines.push(`- bank_branch: "${prefillHints.bank_branch}"`);
    if (prefillHints.account_number) promptLines.push(`- account_number: "${prefillHints.account_number}"`);
  }

  const extractResult = await callGemini(url, inlineData, promptLines.join("\n"));

  // Normalize extraction
  if (extractResult.amount) {
    extractResult.amount = String(extractResult.amount).replace(/[^\d.]/g, "");
  }
  const fields = ["amount", "deposit_date", "check_number", "bank_branch", "account_number", "payee_name"];
  for (const f of fields) {
    if (!extractResult[f]) extractResult[f] = "";
  }

  return extractResult;
}

async function callGemini(url, inlineData, prompt) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inlineData }, { text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error("Gemini error: " + err.substring(0, 150));
  }

  const result = await response.json();
  const parts = result.candidates[0].content.parts;
  let text = "";
  for (const part of parts) {
    if (part.text && !part.thought) text = part.text;
  }
  text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  text = text.replace(/[\x00-\x1F\x7F]/g, " ");
  const match = text.match(/\{[^{}]*\}/);
  if (!match) return {};
  try { return JSON.parse(match[0]); } catch { return {}; }
}

// ═══════════════════════════════════════════

export const api = {
  // User info (lightweight — used by AuthContext)
  getUserInfo: () => gasRequest("get_user_info"),

  // Dashboard (with stale-while-revalidate caching)
  dashboard: async () => {
    const cached = getCached("dashboard");
    const fetchFresh = gasRequest("dashboard").then((result) => {
      setCache("dashboard", result);
      return result;
    });
    if (cached) {
      // Return cached immediately, refresh in background
      fetchFresh.catch(() => {});
      return cached;
    }
    return fetchFresh;
  },

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

  // Scan flow — Step 1: call Gemini DIRECTLY from browser (single call, no crop)
  // Accepts optional prefillHints { bank_branch, account_number } from prior checks
  scanCheck: async (bundleId, base64Data, mimeType, prefillHints) => {
    const extracted = await callGeminiDirect(base64Data, mimeType, prefillHints);
    return { extracted };
  },

  // Scan flow — Step 2: confirm and save through GAS (image + data for Drive upload)
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

  // Settings
  getSettings: () => gasRequest("get_settings"),
  updateSetting: (key, value) => gasRequest("update_setting", { key, value }),
  uploadLogo: (base64Data, mimeType) => gasRequest("upload_logo", { image_data: base64Data, mime_type: mimeType }),

  // Logout cleanup
  clearCache: clearApiCache,
};
