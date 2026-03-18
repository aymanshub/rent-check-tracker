/**
 * GeminiService.gs — Extracts structured data from check images using Google Gemini.
 */

var GEMINI_MODEL = "gemini-2.0-flash";
var GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/"
                      + GEMINI_MODEL + ":generateContent";

/**
 * Extracts check data from a scanned image using Gemini AI.
 *
 * @param {string} base64Image — Base64-encoded image data (no prefix)
 * @param {string} mimeType — e.g. "image/jpeg"
 * @returns {Object} Extracted data or { error: string }
 */
function extractCheckData(base64Image, mimeType) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    return { error: "Gemini API key not configured" };
  }

  var prompt = [
    "This is a photo of an Israeli bank check (שיק) with handwritten Hebrew text.",
    "Extract the following fields from the check image.",
    "If a field is not readable or not present, return an empty string for that field.",
    "",
    "Fields to extract:",
    "1. amount — The monetary amount in ₪ (New Israeli Shekels). Return as a number only, no currency symbol. If written in both digits and words, prefer the digit version.",
    "2. deposit_date — The date the check can be deposited (תאריך). Format as YYYY-MM-DD. If only Hebrew date format is visible (e.g. 15/03/2025), convert to YYYY-MM-DD.",
    "3. check_number — The check serial number (מספר שיק), usually printed at the bottom of the check.",
    "4. bank_branch — The bank name and/or branch number (סניף). Return as 'BankName Branch###' or just the branch number if bank name is not clear.",
    "5. account_number — The bank account number (מספר חשבון).",
    "6. payee_name — The name of the person or entity the check is payable to (לפקודת).",
    "",
    "IMPORTANT: Respond ONLY with a valid JSON object, no markdown, no explanation, no backticks. Example:",
    '{"amount": "3500", "deposit_date": "2025-03-15", "check_number": "1234567", "bank_branch": "Hapoalim 123", "account_number": "987654", "payee_name": "ג׳ורג׳ חביב"}'
  ].join("\n");

  var requestBody = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        },
        {
          text: prompt
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 500,
    }
  };

  try {
    var response = UrlFetchApp.fetch(GEMINI_ENDPOINT + "?key=" + apiKey, {
      method: "POST",
      contentType: "application/json",
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true,
    });

    var responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      Logger.log("Gemini API error: " + response.getContentText());
      return { error: "Gemini API returned status " + responseCode };
    }

    var result = JSON.parse(response.getContentText());
    var text = result.candidates[0].content.parts[0].text;

    // Clean up potential markdown formatting
    text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    var extracted = JSON.parse(text);

    // Normalize amount to number string
    if (extracted.amount) {
      extracted.amount = String(extracted.amount).replace(/[^\d.]/g, "");
    }

    // Validate date format
    if (extracted.deposit_date && !/^\d{4}-\d{2}-\d{2}$/.test(extracted.deposit_date)) {
      extracted.deposit_date = normalizeDate(extracted.deposit_date);
    }

    // Ensure all fields exist (default to empty string)
    var fields = ["amount", "deposit_date", "check_number", "bank_branch", "account_number", "payee_name"];
    fields.forEach(function(f) {
      if (!extracted[f]) extracted[f] = "";
    });

    return extracted;

  } catch (e) {
    Logger.log("Gemini extraction error: " + e.message);
    return { error: "Failed to extract check data: " + e.message };
  }
}

/**
 * Attempts to normalize various date formats to YYYY-MM-DD.
 */
function normalizeDate(dateStr) {
  if (!dateStr) return "";

  // Try DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  var match = dateStr.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (match) {
    var day = match[1].padStart(2, "0");
    var month = match[2].padStart(2, "0");
    var year = match[3].length === 2 ? "20" + match[3] : match[3];
    return year + "-" + month + "-" + day;
  }

  return dateStr;
}
