/**
 * GeminiService.gs — Extracts structured data from check images using Google Gemini.
 */

var GEMINI_MODEL = "gemini-2.5-flash";
var GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/"
                      + GEMINI_MODEL + ":generateContent";

function extractCheckData(base64Image, mimeType) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    return { error: "Gemini API key not configured" };
  }

  var prompt = [
    "Extract data from this Israeli bank check photo.",
    "Return ONLY a JSON object with these fields (use empty string if unreadable):",
    '{"amount":"3500","deposit_date":"2025-03-15","check_number":"1234567","bank_branch":"Hapoalim 123","account_number":"987654","payee_name":"שם"}',
    "amount = number only, no ₪ symbol. deposit_date = YYYY-MM-DD format."
  ].join("\n");

  var requestBody = {
    contents: [{
      parts: [
        { inlineData: { mimeType: mimeType, data: base64Image } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096
    },
    // MUST be at root level, NOT inside generationConfig
    thinkingConfig: {
      thinkingBudget: 0
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
    var responseText = response.getContentText();
    Logger.log("STEP 1 - HTTP status: " + responseCode);
    Logger.log("STEP 2 - Response length: " + responseText.length);
    Logger.log("STEP 3 - Response start: " + responseText.substring(0, 300));

    if (responseCode !== 200) {
      return { error: "Gemini API returned status " + responseCode + ": " + responseText.substring(0, 100) };
    }

    var result = JSON.parse(responseText);
    var candidate = result.candidates[0];
    Logger.log("STEP 4 - finishReason: " + candidate.finishReason);

    var parts = candidate.content.parts;
    Logger.log("STEP 5 - Parts count: " + parts.length);

    var text = "";
    for (var i = 0; i < parts.length; i++) {
      Logger.log("STEP 6 - Part " + i + ": thought=" + !!parts[i].thought + " len=" + (parts[i].text || "").length);
      if (parts[i].text && !parts[i].thought) {
        text += parts[i].text;
      }
    }

    Logger.log("STEP 7 - Extracted text: [" + text + "]");

    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    var jsonMatch = text.match(/\{[^{}]*\}/);
    if (!jsonMatch) {
      Logger.log("STEP 8 - No JSON match found");
      return { error: "Could not parse AI response. Raw: " + text.substring(0, 100) };
    }

    // Remove control characters (newlines, tabs, etc.) inside JSON strings
    var cleanJson = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, " ");
    Logger.log("STEP 9 - JSON match: [" + cleanJson + "]");

    var extracted = JSON.parse(cleanJson);

    if (extracted.amount) {
      extracted.amount = String(extracted.amount).replace(/[^\d.]/g, "");
    }
    if (extracted.deposit_date && !/^\d{4}-\d{2}-\d{2}$/.test(extracted.deposit_date)) {
      extracted.deposit_date = normalizeDate(extracted.deposit_date);
    }

    var fields = ["amount", "deposit_date", "check_number", "bank_branch", "account_number", "payee_name"];
    fields.forEach(function(f) {
      if (!extracted[f]) extracted[f] = "";
    });

    return extracted;

  } catch (e) {
    Logger.log("CATCH - Error: " + e.message);
    return { error: "Failed to extract check data: " + e.message };
  }
}

function normalizeDate(dateStr) {
  if (!dateStr) return "";
  var match = dateStr.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (match) {
    var day = match[1].padStart(2, "0");
    var month = match[2].padStart(2, "0");
    var year = match[3].length === 2 ? "20" + match[3] : match[3];
    return year + "-" + month + "-" + day;
  }
  return dateStr;
}
