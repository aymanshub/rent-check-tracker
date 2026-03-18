import { GAS_URL } from "../config";

/**
 * Makes a request to the Google Apps Script backend.
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
  if (text.trimStart().startsWith("<")) {
    const redirectUrl = extractRedirectUrl(text);
    if (redirectUrl) {
      text = await doFetch(redirectUrl, fetchOpts);
    }
  }

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

async function callGeminiDirect(base64Data, mimeType) {
  const apiKey = await getGeminiKey();
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = [
    "Extract data from this Israeli bank check photo.",
    "Return ONLY a JSON object with these fields (use empty string if unreadable):",
    '{"amount":"3500","deposit_date":"2025-03-15","check_number":"1234567","bank_branch":"Hapoalim 123","account_number":"987654","payee_name":"שם"}',
    "amount = number only, no ₪ symbol. deposit_date = YYYY-MM-DD format.",
  ].join("\n");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      thinkingConfig: { thinkingBudget: 0 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error("Gemini error: " + err.substring(0, 150));
  }

  const result = await response.json();
  const parts = result.candidates[0].content.parts;

  // Get last non-thinking text part
  let text = "";
  for (const part of parts) {
    if (part.text && !part.thought) text = part.text;
  }

  // Clean and extract JSON
  text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  text = text.replace(/[\x00-\x1F\x7F]/g, " ");
  const match = text.match(/\{[^{}]*\}/);
  if (!match) throw new Error("Could not read check data from image");

  const extracted = JSON.parse(match[0]);

  // Normalize
  if (extracted.amount) {
    extracted.amount = String(extracted.amount).replace(/[^\d.]/g, "");
  }
  const fields = ["amount", "deposit_date", "check_number", "bank_branch", "account_number", "payee_name"];
  for (const f of fields) {
    if (!extracted[f]) extracted[f] = "";
  }

  return extracted;
}

// ═══════════════════════════════════════════

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

  // Scan flow — Step 1: call Gemini DIRECTLY from browser (no GAS redirect issues)
  scanCheck: async (bundleId, base64Data, mimeType) => {
    const extracted = await callGeminiDirect(base64Data, mimeType);
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
};
