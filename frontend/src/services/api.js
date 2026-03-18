import { GAS_URL } from "../config";

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
      // Wait briefly before retrying
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
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
 * Calls Gemini to extract check data AND crop coordinates in parallel.
 * Two separate focused calls are more reliable than one complex prompt.
 */
async function callGeminiDirect(base64Data, mimeType) {
  const apiKey = await getGeminiKey();
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const inlineData = { mimeType, data: base64Data };

  // Two parallel calls: extraction + crop
  const [extractResult, cropResult] = await Promise.all([
    callGemini(url, inlineData, [
      "Extract data from this Israeli bank check (שיק).",
      "Return ONLY a JSON object (empty string if unreadable):",
      '{"amount":"3500","deposit_date":"2025-03-15","check_number":"1234567","bank_branch":"Hapoalim 123","account_number":"987654"}',
      "amount = number only, no ₪. deposit_date = YYYY-MM-DD.",
    ].join("\n")),
    callGemini(url, inlineData, [
      "Find the bank check in this photo.",
      "Return ONLY a JSON object with the check bounding box as percentage of image (0-100):",
      '{"top":"5","left":"3","width":"90","height":"55"}',
    ].join("\n")),
  ]);

  // Normalize extraction
  if (extractResult.amount) {
    extractResult.amount = String(extractResult.amount).replace(/[^\d.]/g, "");
  }
  const fields = ["amount", "deposit_date", "check_number", "bank_branch", "account_number"];
  for (const f of fields) {
    if (!extractResult[f]) extractResult[f] = "";
  }
  // payee_name intentionally left out — pre-filled from bundle family name
  if (!extractResult.payee_name) extractResult.payee_name = "";

  // Attach crop data
  extractResult._crop = {
    top: parseFloat(cropResult.top) || 0,
    left: parseFloat(cropResult.left) || 0,
    width: parseFloat(cropResult.width) || 100,
    height: parseFloat(cropResult.height) || 100,
  };

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

/**
 * Crops a base64 image using percentage-based coordinates.
 */
function cropImage(dataUrl, crop) {
  return new Promise((resolve) => {
    if (!crop || crop.width >= 99) {
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mimeType: "image/jpeg", dataUrl });
      return;
    }
    const img = new Image();
    img.onload = () => {
      const sx = Math.round((crop.left / 100) * img.width);
      const sy = Math.round((crop.top / 100) * img.height);
      const sw = Math.min(Math.round((crop.width / 100) * img.width), img.width - sx);
      const sh = Math.min(Math.round((crop.height / 100) * img.height), img.height - sy);
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const croppedUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = croppedUrl.split(",")[1];
      resolve({ base64, mimeType: "image/jpeg", dataUrl: croppedUrl });
    };
    img.src = dataUrl;
  });
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
  // Returns { extracted, croppedImage } where croppedImage replaces the original
  scanCheck: async (bundleId, base64Data, mimeType, originalDataUrl) => {
    const extracted = await callGeminiDirect(base64Data, mimeType);
    // Crop the image to just the check using Gemini's coordinates
    const croppedImage = await cropImage(originalDataUrl, extracted._crop);
    delete extracted._crop;
    return { extracted, croppedImage };
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
