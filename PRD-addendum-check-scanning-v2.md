# PRD Addendum v2: Check Scanning & AI Data Extraction
## Replaces: PRD-addendum-check-scanning.md
## Applies to: PRD-rent-check-tracker-v2.md

---

## Overview

When checks are received, the admin scans each check with their phone camera. The image is sent to Google's Gemini AI (free tier) which reads the handwritten Hebrew and extracts: amount, deposit date, check number, bank branch, account number, and payee name. The extracted data is shown in editable fields alongside the scan so the admin can review, correct if needed, and confirm. This eliminates manual data entry entirely.

---

## 1. Revised Workflow

### Old Flow (manual entry):
```
Create bundle (type all amounts manually) → Scan check (just for audit) → Track lifecycle
```

### New Flow (AI-powered):
```
Create bundle (basic info only: mode, family, # of checks, start month/year)
    → amounts are NOT entered upfront, left as 0/TBD
    → checks are created with status "pending" and amount=0
    
For each check:
    Scan check → Gemini extracts data → Admin reviews pre-filled fields → Confirm
    → amount, deposit_date, check_number, bank_branch, account_number, payee_name are saved
    → image is uploaded to Drive
    → check status advances to "received"
```

### What Changes in Bundle Creation

**Remove from CreateBundleForm:**
- "Same amount for all" checkbox
- Per-check amount inputs
- The entire amounts section

**Keep in CreateBundleForm:**
- Mode (alternating / single)
- Checks on name of (george / asaad)
- Split ratio (single mode only)
- Number of checks
- Start month + year

**The `amounts` array is no longer sent at creation.** All checks are created with `amount: 0`. The real amount is filled in when each check is scanned.

---

## 2. Data Model Changes

### 2.1 Check Entity — Updated Fields

**New fields** (added to existing Check entity):

| Field          | Type   | Notes |
|---------------|--------|-------|
| deposit_date  | string | The date written on the check (when it CAN be deposited). Format: YYYY-MM-DD. Extracted by AI. |
| check_number  | string | Check serial number printed/written on check |
| bank_branch   | string | Bank name and/or branch number |
| account_number| string | Account number on the check |
| payee_name    | string | Name written on check (who it's payable to) |
| image_id      | string | Google Drive file ID |
| image_url     | string | `https://drive.google.com/file/d/{image_id}/view` |

**Modified fields:**
| Field  | Change |
|--------|--------|
| amount | Now starts as `0` at creation. Populated when check is scanned. |

### 2.2 Updated CONFIG.HEADERS.CHECKS

```javascript
CHECKS: [
  "id", "bundle_id", "index", "month_index", "year",
  "amount", "issued_to", "status",
  "date_received", "date_handed", "date_deposited", "date_drawn", "date_delivered",
  "recipient_name", "draw_amount",
  "deposit_date", "check_number", "bank_branch", "account_number", "payee_name",
  "image_id", "image_url"
],
```

### 2.3 Updated Check Creation in BundleService.gs

When generating checks in `createBundle()`, amounts are zero and new fields are empty:

```javascript
checks.push({
  id: Utilities.getUuid(),
  bundle_id: bundleId,
  index: i,
  month_index: monthIndex,
  year: data.start_year + yearOffset,
  amount: 0,                    // ← Filled by AI scan later
  issued_to: issuedTo,
  status: CONFIG.STATUSES.PENDING,
  date_received: "",
  date_handed: "",
  date_deposited: "",
  date_drawn: "",
  date_delivered: "",
  recipient_name: "",
  draw_amount: "",
  deposit_date: "",             // ← New: filled by AI scan
  check_number: "",             // ← New: filled by AI scan
  bank_branch: "",              // ← New: filled by AI scan
  account_number: "",           // ← New: filled by AI scan
  payee_name: "",               // ← New: filled by AI scan
  image_id: "",
  image_url: "",
});
```

---

## 3. Gemini AI Integration

### 3.1 Setup (Free, No Billing)

1. Go to https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Copy the key
4. Store it in GAS Script Properties:
   - In Apps Script editor → Project Settings → Script Properties
   - Add: Key = `GEMINI_API_KEY`, Value = `your_key_here`

**Free tier quota**: 15 requests per minute, 1,500 per day. For 12–24 checks per year, this is effectively unlimited.

### 3.2 GeminiService.gs — New File

```javascript
/**
 * GeminiService — extracts structured data from check images using Google Gemini.
 */

var GEMINI_MODEL = "gemini-2.0-flash";
var GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/" 
                      + GEMINI_MODEL + ":generateContent";

/**
 * Extracts check data from a scanned image using Gemini AI.
 *
 * @param {string} base64Image — Base64-encoded image data (no prefix)
 * @param {string} mimeType — e.g. "image/jpeg"
 * @returns {Object} Extracted data: { amount, deposit_date, check_number, bank_branch, account_number, payee_name }
 *                   All fields are strings. Returns empty strings for fields that couldn't be read.
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
    "4. bank_branch — The bank name and branch number (סניף). Return as 'BankName Branch###' or just the branch number if bank name is not clear.",
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
      temperature: 0.1,      // Low temperature for factual extraction
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
      // Try to parse common formats
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
  
  return dateStr; // Return as-is if can't parse
}
```

### 3.3 Updated Main.gs — New Actions

Add two new actions to the `doPost` router:

```javascript
// In the WRITE actions section (admin required):
case "scan_check":
  return jsonResponse(handleScanCheck(body));
case "confirm_check_data":
  return jsonResponse(handleConfirmCheckData(body));
```

### 3.4 New Handler Functions (add to Main.gs or a new ScanService.gs)

```javascript
/**
 * Step 1: Receives scanned image, runs Gemini extraction, returns suggested data.
 * Does NOT save anything yet — waits for confirmation.
 *
 * Input: { check_id, image_data (base64), mime_type }
 * Returns: { extracted: { amount, deposit_date, check_number, bank_branch, account_number, payee_name } }
 */
function handleScanCheck(body) {
  if (!body.check_id || !body.image_data || !body.mime_type) {
    return { error: "check_id, image_data, and mime_type are required" };
  }
  
  var check = findById(CONFIG.SHEET_NAMES.CHECKS, body.check_id);
  if (!check) return { error: "Check not found" };
  
  // Run AI extraction
  var extracted = extractCheckData(body.image_data, body.mime_type);
  
  if (extracted.error) {
    return { error: extracted.error };
  }
  
  // Return extracted data for review — do NOT save yet
  return { extracted: extracted };
}

/**
 * Step 2: Admin has reviewed and possibly edited the extracted data. Save everything.
 *
 * Input: {
 *   check_id,
 *   image_data (base64),
 *   mime_type,
 *   confirmed_data: { amount, deposit_date, check_number, bank_branch, account_number, payee_name }
 * }
 *
 * This function:
 * 1. Uploads image to Drive
 * 2. Saves all confirmed data fields to the check row
 * 3. Advances check status to "received"
 * 4. Sets date_received to today
 */
function handleConfirmCheckData(body) {
  if (!body.check_id || !body.image_data || !body.mime_type || !body.confirmed_data) {
    return { error: "check_id, image_data, mime_type, and confirmed_data are required" };
  }
  
  var check = findById(CONFIG.SHEET_NAMES.CHECKS, body.check_id);
  if (!check) return { error: "Check not found" };
  
  var bundle = findById(CONFIG.SHEET_NAMES.BUNDLES, check.bundle_id);
  if (!bundle) return { error: "Bundle not found" };
  
  // Validate amount
  var amount = Number(body.confirmed_data.amount);
  if (!amount || amount <= 0) {
    return { error: "A valid amount is required" };
  }
  
  // 1. Upload image to Drive
  var ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[body.mime_type] || "jpg";
  var fileName = getCheckImageName(check, ext);
  var upload = uploadCheckImage(body.check_id, body.image_data, body.mime_type, fileName, bundle);
  
  if (upload.error) return { error: upload.error };
  
  // 2. Save all data
  var today = new Date().toISOString().split("T")[0];
  var data = body.confirmed_data;
  
  var updates = {
    amount: amount,
    deposit_date: data.deposit_date || "",
    check_number: data.check_number || "",
    bank_branch: data.bank_branch || "",
    account_number: data.account_number || "",
    payee_name: data.payee_name || "",
    image_id: upload.fileId,
    image_url: upload.fileUrl,
    status: CONFIG.STATUSES.RECEIVED,
    date_received: today,
  };
  
  updateById(CONFIG.SHEET_NAMES.CHECKS, body.check_id, updates);
  
  return {
    success: true,
    check_id: body.check_id,
    new_status: CONFIG.STATUSES.RECEIVED,
    image_url: upload.fileUrl,
  };
}
```

### 3.5 Updated advanceCheck — Skip "received" for scanned checks

Since `confirm_check_data` already sets status to "received", the advance function should start from "received" and go to the next step. No change needed — the existing `advanceCheck` logic handles this correctly because it reads the current status from the sheet.

However, **remove "received" as a manually advanceable status**. The ONLY way a check gets to "received" is through the scan+confirm flow. Update the frontend to never show a "Mark Received" button — instead show a "Scan Check" button for pending checks.

---

## 4. Google Drive — Same as Previous Addendum

### DriveService.gs

Keep the exact same `DriveService.gs` from the previous addendum:
- `getRootFolder()` — get/create root "Rent Check Tracker" folder
- `getBundleFolder(bundle)` — get/create bundle subfolder
- `uploadCheckImage(checkId, base64Data, mimeType, fileName, bundle)` — upload and share
- `getCheckImageName(check, ext)` — generate filename
- `deleteBundleImages(bundle)` — cleanup on bundle delete

All unchanged. See previous addendum for full code.

---

## 5. Frontend Changes

### 5.1 Revised "Mark Received" → "Scan Check" Flow

The button for pending checks changes from "Mark Received" to **"📷 Scan"**. Here is the full interaction:

```
1. Admin taps "📷 Scan" on a pending check
2. Camera opens (or file picker)
3. Photo is taken → compressed client-side
4. Loading state: "Reading check..." with spinner
5. App calls GAS scan_check → Gemini reads the image → returns extracted data
6. Review screen appears:

┌─────────────────────────────────────────────┐
│  Review Check #3 — Mar 2025                 │
│                                             │
│  ┌───────────────────────────────────┐      │
│  │                                   │      │
│  │      (scanned check image)        │      │
│  │                                   │      │
│  └───────────────────────────────────┘      │
│                                             │
│  Amount (₪)          [____3,500____] ✎     │
│  Deposit Date        [__2025-03-15_] ✎     │
│  Check Number        [___1234567___] ✎     │
│  Bank / Branch       [_Hapoalim 42_] ✎     │
│  Account Number      [___987654___]  ✎     │
│  Payee Name          [_ג׳ורג׳ חביב_] ✎     │
│                                             │
│  ┌──────────┐         ┌──────────────┐      │
│  │ Confirm ✓│         │  Cancel ✗    │      │
│  └──────────┘         └──────────────┘      │
│                                             │
│  ⚠ AI-extracted — please verify             │
└─────────────────────────────────────────────┘

7a. Admin edits any wrong fields → taps Confirm
    → calls GAS confirm_check_data with image + corrected data
    → check is saved with data + image + status="received"
    → review screen closes, check row updates

7b. Admin taps Cancel
    → nothing is saved, check stays "pending"
    → can re-scan anytime
```

### 5.2 New Component: CheckScanReview.jsx

```jsx
/**
 * CheckScanReview — Full-screen review overlay after scanning.
 * 
 * Props:
 *   - check: Object — the check being scanned
 *   - imagePreview: string — base64 data URL for the scanned image
 *   - imageBase64: string — raw base64 (no prefix) for API upload
 *   - imageMimeType: string — e.g. "image/jpeg"
 *   - extractedData: Object — { amount, deposit_date, check_number, bank_branch, account_number, payee_name }
 *   - onConfirm(confirmedData) — called with possibly-edited data
 *   - onCancel() — discard and close
 *   - isSubmitting: boolean — show loading state during confirm
 * 
 * Behavior:
 *   - Image displayed at top (tappable to zoom via ImageLightbox)
 *   - 6 editable fields pre-filled with AI-extracted values
 *   - Fields with empty values get highlighted border (yellow) as "needs attention"
 *   - Amount field: numeric keyboard on mobile (inputMode="decimal")
 *   - Deposit date field: date picker (type="date")
 *   - Other fields: text inputs
 *   - "⚠ AI-extracted — please verify" notice at bottom
 *   - Confirm button disabled if amount is empty or zero
 *   - All labels in current language (trilingual)
 *   - RTL-aware layout
 */
```

### 5.3 Updated CheckRow Action Buttons

Replace the current action button logic for pending checks:

```
Status: pending
  → Show "📷 Scan" button (was "Mark Received")
  → Tapping opens camera → then CheckScanReview

Status: received (already scanned)
  → Show camera icon / thumbnail (tappable → ImageLightbox)
  → Show next action button based on flow (e.g. "Mark Deposited", "Mark Handed Over")

Status: other
  → Same as before (flow-based action buttons)
```

### 5.4 Bundle Detail — Visual Indicators for Scanned vs Unscanned

In the checks table, add visual cues:

| Check State | Visual |
|------------|--------|
| Pending (not scanned) | Amount shows "—" or "₪0", gray text. Camera icon with "+" badge. |
| Received (scanned) | Amount shows real value in bold. Small thumbnail of scan. Tappable. |
| Any status with image | Small 📷 icon next to check number. Tap to view in lightbox. |
| Any status without image | No icon (shouldn't happen after v2, but handle legacy data) |

### 5.5 Updated CreateBundleForm

**Remove entirely:**
- `sameAmount` checkbox and state
- `baseAmount` input
- `amounts` per-check inputs
- The entire "Check Amounts" section

**The form now has only:**
1. Mode selector (alternating / single)
2. Checks on name of (george / asaad)
3. Split ratio slider (single mode only)
4. Number of checks
5. Start month dropdown
6. Start year input

**Submit sends:**
```javascript
{
  action: "create_bundle",
  data: {
    mode: "single",
    checks_on_name: "george",
    split_ratio: 50,
    num_checks: 12,
    start_month: 0,
    start_year: 2025,
    // NO amounts array
  }
}
```

### 5.6 Dashboard — Handle Zero Amounts

When displaying bundle summaries on the dashboard, handle checks with `amount: 0`:
- Total value: sum only checks where `amount > 0`
- Show count of "unscanned" checks: e.g. "8/12 scanned"
- Bundle card could show: "₪28,000 total (4 checks pending scan)"

### 5.7 API Service Updates

Update `src/services/api.js`:

```javascript
export const api = {
  // ... existing methods ...
  
  // NEW: Two-step scan flow
  scanCheck: (checkId, base64Data, mimeType) =>
    gasRequest("scan_check", {
      check_id: checkId,
      image_data: base64Data,
      mime_type: mimeType,
    }),
  
  confirmCheckData: (checkId, base64Data, mimeType, confirmedData) =>
    gasRequest("confirm_check_data", {
      check_id: checkId,
      image_data: base64Data,
      mime_type: mimeType,
      confirmed_data: confirmedData,
    }),
  
  // REMOVE: the old single-step upload
  // uploadCheckImage is no longer called directly from frontend
};
```

### 5.8 Image Compression — Same as Before

Keep the client-side compression (phones produce 5-10MB photos, compress to ~300KB):

```javascript
async function compressImage(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg", dataUrl });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
```

### 5.9 Loading States

The scan-confirm flow has two async steps. Show clear loading states:

| Step | Duration | UI |
|------|----------|-----|
| Image compression | < 1s | "Compressing..." |
| Gemini extraction (scan_check) | 2-5s | "🔍 Reading check..." with spinner |
| Review (user time) | user-controlled | Review form shown |
| Upload + save (confirm_check_data) | 2-4s | "💾 Saving..." with disabled confirm button |

---

## 6. Updated Translation Keys

Add to **all three languages** in `translations.js`:

```javascript
// English
scanCheck: "Scan Check",
takePhoto: "Take Photo",
chooseFile: "Choose File",
readingCheck: "Reading check...",
reviewCheck: "Review Check",
confirmSave: "Confirm & Save",
aiExtracted: "AI-extracted — please verify",
depositDate: "Deposit Date",
checkNumber: "Check Number",
bankBranch: "Bank / Branch",
accountNumber: "Account Number",
payeeName: "Payee Name",
saving: "Saving...",
scanRequired: "Scan required to receive check",
unscanned: "unscanned",
scanned: "scanned",
viewScan: "View Scan",
openInDrive: "Open in Drive",
retake: "Rescan",
noImage: "No scan",
pendingScan: "pending scan",
compressing: "Compressing...",

// Arabic  
scanCheck: "مسح الشيك",
takePhoto: "التقاط صورة",
chooseFile: "اختيار ملف",
readingCheck: "جاري قراءة الشيك...",
reviewCheck: "مراجعة الشيك",
confirmSave: "تأكيد وحفظ",
aiExtracted: "تم الاستخراج بالذكاء الاصطناعي — يرجى التحقق",
depositDate: "تاريخ الإيداع",
checkNumber: "رقم الشيك",
bankBranch: "البنك / الفرع",
accountNumber: "رقم الحساب",
payeeName: "اسم المستفيد",
saving: "جاري الحفظ...",
scanRequired: "المسح مطلوب لاستلام الشيك",
unscanned: "غير ممسوح",
scanned: "ممسوح",
viewScan: "عرض المسح",
openInDrive: "فتح في Drive",
retake: "إعادة المسح",
noImage: "لا يوجد مسح",
pendingScan: "بانتظار المسح",
compressing: "جاري الضغط...",

// Hebrew
scanCheck: "סרוק צ'ק",
takePhoto: "צלם תמונה",
chooseFile: "בחר קובץ",
readingCheck: "קורא את הצ'ק...",
reviewCheck: "בדיקת צ'ק",
confirmSave: "אישור ושמירה",
aiExtracted: "חולץ באמצעות AI — נא לאמת",
depositDate: "תאריך פירעון",
checkNumber: "מספר צ'ק",
bankBranch: "בנק / סניף",
accountNumber: "מספר חשבון",
payeeName: "שם המוטב",
saving: "שומר...",
scanRequired: "נדרשת סריקה לקבלת הצ'ק",
unscanned: "לא נסרק",
scanned: "נסרק",
viewScan: "צפה בסריקה",
openInDrive: "פתח ב-Drive",
retake: "סרוק שוב",
noImage: "אין סריקה",
pendingScan: "ממתין לסריקה",
compressing: "דוחס...",
```

---

## 7. Setup Instructions — One Extra Step

Add to the setup instructions in the main PRD (Section 5):

#### E. Get Gemini API Key (Free)
1. Go to https://aistudio.google.com/apikey
2. Click "Create API Key" (no billing, no credit card)
3. Copy the key
4. In Google Apps Script editor → Project Settings (gear icon) → Script Properties
5. Add property: Key = `GEMINI_API_KEY`, Value = `your_key_here`

---

## 8. Implementation Order Update

Replace the scanning steps in the main PRD with:

### Phase 1 additions (GAS Backend):
```
After creating base GAS files:
  → Create GeminiService.gs with extractCheckData() and normalizeDate()
  → Create DriveService.gs with folder management and upload functions
  → Add scan_check and confirm_check_data routes to Main.gs
  → Update BundleService.gs: remove amounts from creation, add cascade image delete
  → Test: manually run extractCheckData() with a test image from script editor
```

### Phase 3 additions (Frontend):
```
During page building:
  → Build CheckImageCapture.jsx (camera/file picker + compression)
  → Build CheckScanReview.jsx (review overlay with editable pre-filled fields)
  → Build ImageLightbox.jsx (fullscreen image viewer)
  → Update CheckRow.jsx: "Scan" button for pending, thumbnail for scanned
  → Update CreateBundleForm.jsx: REMOVE amounts section entirely
  → Update BundleDetailPage.jsx: show scanned/unscanned counts
  → Update DashboardPage.jsx: handle zero-amount checks in totals
  → Add scanCheck + confirmCheckData to api.js
```

---

## 9. Edge Cases

1. **Gemini can't read a field**: Returns empty string → field shows empty in review → admin types it manually. No blocker.
2. **Gemini returns wrong amount**: Admin sees it in review alongside the image → corrects the field → confirms. The image is right there for reference.
3. **Photo is blurry**: Extraction may fail or return garbage → admin sees it → can cancel and retake.
4. **GAS payload size limit**: Google Apps Script has a ~50MB POST body limit. With JPEG compression at 0.8 quality and 1920px max width, images are typically 200-500KB base64. Well within limits.
5. **Gemini API down**: `scan_check` returns an error → frontend shows "Could not read check. Please try again or enter data manually." → show the review form with all empty fields so admin can type manually.
6. **Re-scanning**: If a check is already "received" and has an image, show a "Rescan" option that replaces the old image and re-runs extraction. The old Drive file is trashed.
7. **Amount validation**: Confirm button is disabled if amount is 0 or empty. All other fields are optional (nice to have but not blocking).
8. **draw_amount recalculation**: Since amount is now filled at scan time (not creation), `draw_amount` is calculated later during the "drawn" status transition. The existing advanceCheck logic already handles this correctly: `Math.round(amount * split_ratio / 100)`.
