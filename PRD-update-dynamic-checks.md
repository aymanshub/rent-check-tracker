# PRD Update: Dynamic Check Addition (Scan-to-Add)
## Modifies: PRD-rent-check-tracker-v2.md AND PRD-addendum-check-scanning-v2.md

---

## Summary of Change

Bundles no longer have a fixed number of checks or pre-assigned months. A bundle is just an open container. Checks are added one-by-one by scanning. Each scan creates a new check, extracts all data via Gemini, and adds it to the bundle. The deposit date on the check determines its period — no assumptions about spacing or count.

**Old flow**: Create bundle (mode, family, split, count, start month, amounts) → checks pre-generated → scan each one later

**New flow**: Create bundle (mode, family, split) → scan a check → it's added to the bundle → repeat as many times as needed

---

## 1. Data Model Changes

### 1.1 Bundle — Simplified

**Remove these fields entirely:**
- ~~num_checks~~ — no fixed count
- ~~start_month~~ — derived from scanned checks
- ~~start_year~~ — derived from scanned checks

**Add these fields:**

| Field  | Type   | Notes |
|--------|--------|-------|
| label  | string | Admin-assigned display name. e.g. "2025 Rent", "2025-2026 Church". Free text, for identification. |
| status | enum   | `open` or `closed`. Open = can add more checks. Closed = bundle is complete, no more checks expected. |

**Final Bundle entity:**

| Field          | Type   | Notes |
|---------------|--------|-------|
| id            | string | UUID |
| label         | string | Display name (e.g. "2025 Rent") |
| mode          | enum   | `alternating` or `single` |
| checks_on_name| enum   | `george` or `asaad` |
| split_ratio   | number | 1–99, percentage for OTHER party. Only used in `single` mode. |
| status        | enum   | `open` or `closed` |
| created_at    | string | ISO date |

**Updated CONFIG.HEADERS.BUNDLES:**
```javascript
BUNDLES: ["id", "label", "mode", "checks_on_name", "split_ratio", "status", "created_at"],
```

### 1.2 Check — Simplified

**Remove these fields:**
- ~~index~~ — replaced by scan order, but we'll keep an `order` field for sorting
- ~~month_index~~ — derived from deposit_date
- ~~year~~ — derived from deposit_date

**Keep `order` for display sorting** (auto-incremented when a check is added):

**Final Check entity:**

| Field          | Type   | Notes |
|---------------|--------|-------|
| id            | string | UUID |
| bundle_id     | string | FK → Bundle.id |
| order         | number | Auto-incremented within bundle (1, 2, 3...). For display sorting. |
| amount        | number | Extracted from scan |
| issued_to     | enum   | `george` or `asaad` |
| status        | enum   | `pending` → ... (per lifecycle flow) |
| deposit_date  | string | Extracted from scan (YYYY-MM-DD). The date the check can be deposited. |
| check_number  | string | Extracted from scan |
| bank_branch   | string | Extracted from scan |
| account_number| string | Extracted from scan |
| payee_name    | string | Extracted from scan |
| image_id      | string | Google Drive file ID |
| image_url     | string | Viewable Drive link |
| date_received | string | ISO date (= date of scan confirmation) |
| date_handed   | string | ISO date |
| date_deposited| string | ISO date |
| date_drawn    | string | ISO date |
| date_delivered| string | ISO date |
| recipient_name| string | For handed_over and delivered statuses |
| draw_amount   | number | Calculated at "drawn" step |

**Updated CONFIG.HEADERS.CHECKS:**
```javascript
CHECKS: [
  "id", "bundle_id", "order", "amount", "issued_to", "status",
  "deposit_date", "check_number", "bank_branch", "account_number", "payee_name",
  "image_id", "image_url",
  "date_received", "date_handed", "date_deposited", "date_drawn", "date_delivered",
  "recipient_name", "draw_amount"
],
```

### 1.3 issued_to — How It's Determined

Since checks are added one at a time, `issued_to` assignment changes:

**Single mode**: Every check gets `issued_to = bundle.checks_on_name`. Simple.

**Alternating mode**: The admin selects which family this specific check belongs to during the scan review step. Add a family selector to the CheckScanReview form. Gemini's extracted `payee_name` can pre-suggest the family, but the admin confirms.

---

## 2. Backend Changes

### 2.1 Updated BundleService.gs

```javascript
function createBundle(data) {
  if (!data.mode || !data.checks_on_name) {
    return { error: "mode and checks_on_name are required" };
  }
  if (!data.label || !data.label.trim()) {
    return { error: "label is required" };
  }
  
  var bundleId = Utilities.getUuid();
  var now = new Date().toISOString().split("T")[0];
  
  var bundle = {
    id: bundleId,
    label: data.label.trim(),
    mode: data.mode,
    checks_on_name: data.checks_on_name,
    split_ratio: data.mode === "single" ? (data.split_ratio || 50) : 50,
    status: "open",
    created_at: now,
  };
  
  appendRow(CONFIG.SHEET_NAMES.BUNDLES, bundle);
  
  // NO checks are created here — they are added via scan
  return { bundle: bundle };
}

/**
 * Close a bundle — no more checks can be added.
 */
function closeBundle(bundleId) {
  var bundle = findById(CONFIG.SHEET_NAMES.BUNDLES, bundleId);
  if (!bundle) return { error: "Bundle not found" };
  
  updateById(CONFIG.SHEET_NAMES.BUNDLES, bundleId, { status: "closed" });
  return { success: true };
}

/**
 * Reopen a closed bundle — allow adding more checks.
 */
function reopenBundle(bundleId) {
  var bundle = findById(CONFIG.SHEET_NAMES.BUNDLES, bundleId);
  if (!bundle) return { error: "Bundle not found" };
  
  updateById(CONFIG.SHEET_NAMES.BUNDLES, bundleId, { status: "open" });
  return { success: true };
}
```

### 2.2 Updated handleConfirmCheckData — Now Creates the Check

Previously, `confirm_check_data` updated an existing check. Now it **creates** a new check AND saves the scan data in one step.

```javascript
/**
 * Scan confirmed: create a new check in the bundle with all extracted data.
 *
 * Input: {
 *   bundle_id,
 *   image_data (base64),
 *   mime_type,
 *   confirmed_data: { amount, deposit_date, check_number, bank_branch, account_number, payee_name, issued_to }
 * }
 */
function handleConfirmCheckData(body) {
  if (!body.bundle_id || !body.image_data || !body.mime_type || !body.confirmed_data) {
    return { error: "bundle_id, image_data, mime_type, and confirmed_data are required" };
  }
  
  var bundle = findById(CONFIG.SHEET_NAMES.BUNDLES, body.bundle_id);
  if (!bundle) return { error: "Bundle not found" };
  
  if (bundle.status === "closed") {
    return { error: "Bundle is closed. Reopen it to add checks." };
  }
  
  var data = body.confirmed_data;
  
  // Validate amount
  var amount = Number(data.amount);
  if (!amount || amount <= 0) {
    return { error: "A valid amount is required" };
  }
  
  // Determine issued_to
  var issuedTo;
  if (bundle.mode === "single") {
    issuedTo = bundle.checks_on_name;
  } else {
    // Alternating mode — admin must specify which family
    if (!data.issued_to || (data.issued_to !== "george" && data.issued_to !== "asaad")) {
      return { error: "issued_to is required in alternating mode" };
    }
    issuedTo = data.issued_to;
  }
  
  // Calculate next order number
  var existingChecks = findByField(CONFIG.SHEET_NAMES.CHECKS, "bundle_id", body.bundle_id);
  var nextOrder = existingChecks.length + 1;
  
  // Generate check ID
  var checkId = Utilities.getUuid();
  
  // Upload image to Drive
  var ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[body.mime_type] || "jpg";
  
  // Build filename from deposit date if available, otherwise use order
  var fileName;
  if (data.deposit_date) {
    fileName = "check_" + String(nextOrder).padStart(2, "0") + "_" + data.deposit_date + "." + ext;
  } else {
    fileName = "check_" + String(nextOrder).padStart(2, "0") + "." + ext;
  }
  
  // Upload — we need a temporary check-like object for the upload function
  var tempCheck = { id: checkId, image_id: "" };
  var upload = uploadCheckImage(checkId, body.image_data, body.mime_type, fileName, bundle);
  if (upload.error) return { error: upload.error };
  
  // Create the check record
  var today = new Date().toISOString().split("T")[0];
  
  var check = {
    id: checkId,
    bundle_id: body.bundle_id,
    order: nextOrder,
    amount: amount,
    issued_to: issuedTo,
    status: CONFIG.STATUSES.RECEIVED,
    deposit_date: data.deposit_date || "",
    check_number: data.check_number || "",
    bank_branch: data.bank_branch || "",
    account_number: data.account_number || "",
    payee_name: data.payee_name || "",
    image_id: upload.fileId,
    image_url: upload.fileUrl,
    date_received: today,
    date_handed: "",
    date_deposited: "",
    date_drawn: "",
    date_delivered: "",
    recipient_name: "",
    draw_amount: "",
  };
  
  appendRow(CONFIG.SHEET_NAMES.CHECKS, check);
  
  return {
    success: true,
    check: check,
  };
}
```

### 2.3 Updated Main.gs Router

```javascript
// Add/update these actions in doPost:

// READ actions (no admin required):
case "dashboard":       return jsonResponse(getDashboard());
case "bundles":         return jsonResponse(getBundles());
case "checks":          return jsonResponse(getChecks(body.bundle_id));

// WRITE actions (admin required):
case "create_bundle":   return jsonResponse(createBundle(body.data));
case "close_bundle":    return jsonResponse(closeBundle(body.bundle_id));
case "reopen_bundle":   return jsonResponse(reopenBundle(body.bundle_id));
case "delete_bundle":   return jsonResponse(deleteBundleAndChecks(body.bundle_id));
case "scan_check":      return jsonResponse(handleScanCheck(body));
case "confirm_check_data": return jsonResponse(handleConfirmCheckData(body));
case "advance_check":   return jsonResponse(advanceCheck(body.check_id, body.recipient_name));
case "delete_check":    return jsonResponse(deleteCheck(body.check_id));  // NEW
case "users":           return jsonResponse(getUsers());
case "add_user":        return jsonResponse(addUser(body.data));
case "remove_user":     return jsonResponse(removeUser(body.user_id, user.id));
```

### 2.4 New: Delete Individual Check

Since checks are added dynamically, the admin might scan a wrong check or duplicate. Allow deleting individual checks.

```javascript
function deleteCheck(checkId) {
  var check = findById(CONFIG.SHEET_NAMES.CHECKS, checkId);
  if (!check) return { error: "Check not found" };
  
  // Delete image from Drive if exists
  if (check.image_id) {
    try {
      DriveApp.getFileById(check.image_id).setTrashed(true);
    } catch (e) { /* already gone */ }
  }
  
  deleteById(CONFIG.SHEET_NAMES.CHECKS, checkId);
  
  // Re-order remaining checks in bundle
  var remaining = findByField(CONFIG.SHEET_NAMES.CHECKS, "bundle_id", check.bundle_id);
  remaining.sort(function(a, b) { return Number(a.order) - Number(b.order); });
  for (var i = 0; i < remaining.length; i++) {
    if (Number(remaining[i].order) !== i + 1) {
      updateById(CONFIG.SHEET_NAMES.CHECKS, remaining[i].id, { order: i + 1 });
    }
  }
  
  return { success: true };
}
```

### 2.5 Updated getDashboard

Since bundles no longer have `num_checks`, the dashboard derives counts from actual checks:

```javascript
function getDashboard() {
  var bundles = readAll(CONFIG.SHEET_NAMES.BUNDLES);
  var checks = readAll(CONFIG.SHEET_NAMES.CHECKS);
  
  var total = checks.length;
  var pending = 0; // In new model, checks arrive as "received" — pending means awaiting further action
  var completed = 0;
  
  for (var i = 0; i < checks.length; i++) {
    var c = checks[i];
    var bundle = bundles.find(function(b) { return b.id === c.bundle_id; });
    if (!bundle) continue;
    
    var flow = getCheckFlow(c, bundle);
    if (c.status === flow[flow.length - 1]) {
      completed++;
    }
  }
  
  // Checks start as "received" (from scan), so "awaiting action" = received but not at terminal
  var awaitingAction = total - completed;
  
  return {
    total: total,
    awaiting_action: awaitingAction,
    completed: completed,
    bundles: bundles,
  };
}
```

### 2.6 Updated getChecks — Sort by deposit_date

```javascript
function getChecks(bundleId) {
  if (!bundleId) return { error: "bundle_id required" };
  var checks = findByField(CONFIG.SHEET_NAMES.CHECKS, "bundle_id", bundleId);
  
  // Sort by deposit_date (chronological), fallback to order
  checks.sort(function(a, b) {
    if (a.deposit_date && b.deposit_date) {
      return a.deposit_date.localeCompare(b.deposit_date);
    }
    return Number(a.order) - Number(b.order);
  });
  
  return { checks: checks };
}
```

---

## 3. Frontend Changes

### 3.1 Simplified CreateBundleForm

The form now has only:

```
┌─────────────────────────────────────────┐
│  📦 New Bundle                          │
│                                         │
│  Bundle Label                           │
│  [_____2025 Church Rent__________]      │
│                                         │
│  Mode                                   │
│  [Single Name]  [Alternating]           │
│                                         │
│  Checks Issued To    (single mode)      │
│  [Dar George]  [Dar Asaad]              │
│                                         │
│  Split Ratio         (single mode)      │
│  Other party: [====50%====] slider      │
│                                         │
│  [Create Bundle]     [Cancel]           │
└─────────────────────────────────────────┘
```

**Removed entirely:**
- ~~Number of checks~~
- ~~Start month~~
- ~~Start year~~
- ~~Amount inputs~~ (all amounts)
- ~~Same amount toggle~~

### 3.2 Bundle Detail Page — Add Check Button

The bundle detail page gets a prominent "📷 Add Check" button:

```
┌─────────────────────────────────────────────────────┐
│  ← Back                                             │
│                                                     │
│  📦 2025 Church Rent                    [Open ●]    │
│  Single Name • Dar George • Split: 50%              │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │         📷 Add Check (Scan New)              │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  Checks (6)                    sorted by date ↑     │
│  ┌──────────────────────────────────────────────┐   │
│  │ #1 │ 15/01/25 │ ₪3,500 │ George │ ◉—◉—○—○ │   │
│  │ #2 │ 15/03/25 │ ₪3,500 │ George │ ◉—○—○—○ │   │
│  │ #3 │ 15/05/25 │ ₪3,000 │ George │ ◉—○—○—○ │   │
│  │ #4 │ 15/07/25 │ ₪3,500 │ George │ ◉—○—○—○ │   │
│  │ #5 │ 15/09/25 │ ₪3,000 │ George │ ◉—○—○—○ │   │
│  │ #6 │ 15/11/25 │ ₪4,000 │ George │ ◉—○—○—○ │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  [Close Bundle]              [Delete Bundle]        │
└─────────────────────────────────────────────────────┘
```

**Key behaviors:**
- "📷 Add Check" button is visible only if bundle status is `open` AND user is admin
- Tapping it opens camera → scan → Gemini → review → confirm → check appears in list
- Bundle status badge: green "Open" or gray "Closed"
- "Close Bundle" button toggles to "Reopen Bundle" when closed
- Checks are sorted by `deposit_date` (chronological)
- Each check shows: order #, deposit date (formatted), amount, family badge, status pipeline, action button
- Swipe-to-delete or delete icon on individual checks (admin only, with confirmation)

### 3.3 Updated CheckScanReview — Family Selector for Alternating Mode

In alternating mode, add a family selector to the review form:

```
┌─────────────────────────────────────────────┐
│  Review New Check                           │
│                                             │
│  ┌───────────────────────────────────┐      │
│  │      (scanned check image)        │      │
│  └───────────────────────────────────┘      │
│                                             │
│  ── AI-Extracted Fields ──                  │
│                                             │
│  Amount (₪)         [____3,500____] ✎      │
│  Deposit Date       [__2025-03-15_] ✎      │
│  Check Number       [___1234567___] ✎      │
│  Bank / Branch      [_Hapoalim 42_] ✎      │
│  Account Number     [___987654___]  ✎      │
│  Payee Name         [_ג׳ורג׳ חביב_] ✎      │
│                                             │
│  ── Check Belongs To ──  (alternating only) │
│  [● Dar George]  [○ Dar Asaad]              │
│                                             │
│  ┌──────────┐         ┌──────────────┐      │
│  │Confirm ✓ │         │  Cancel ✗    │      │
│  └──────────┘         └──────────────┘      │
│                                             │
│  ⚠ AI-extracted — please verify             │
└─────────────────────────────────────────────┘
```

- In **single mode**: family selector is hidden — `issued_to` is always `bundle.checks_on_name`
- In **alternating mode**: family selector is shown. AI may pre-select based on `payee_name` matching, but admin can override.

### 3.4 Updated Dashboard Stat Cards

Since there's no "pending" (unscanned) checks anymore — checks are born as "received" — update the dashboard stats:

| Card | Meaning |
|------|---------|
| Total Checks | Count of all checks across all bundles |
| Awaiting Action | Checks not yet at terminal status |
| Completed | Checks at terminal status |
| Open Bundles | Bundles with status="open" (still accepting new checks) |

### 3.5 Bundle Card on Dashboard / Bundles Page

Since there's no `num_checks`, the progress display changes:

**Old**: "8/12" (completed / total pre-generated)
**New**: "4 of 6 completed" (completed / actual checks scanned so far)

Also show:
- Bundle label (the new display name)
- Open/Closed badge
- Total amount across all checks: `₪21,000`
- Date range derived from checks: "Jan 2025 — Nov 2025"

### 3.6 Empty Bundle State

When a bundle is just created and has no checks yet:

```
┌─────────────────────────────────────────────┐
│  📦 2025 Church Rent                [Open]  │
│                                             │
│  No checks yet. Scan your first check       │
│  to start tracking.                         │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │    📷  Scan First Check              │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 3.7 API Service Updates

```javascript
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
      bundle_id: bundleId,   // Note: now uses bundle_id, not check_id
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
```

### 3.8 Updated scan_check Handler

Since we no longer have a pre-existing check to reference, `scan_check` just does extraction:

```javascript
function handleScanCheck(body) {
  if (!body.bundle_id || !body.image_data || !body.mime_type) {
    return { error: "bundle_id, image_data, and mime_type are required" };
  }
  
  var bundle = findById(CONFIG.SHEET_NAMES.BUNDLES, body.bundle_id);
  if (!bundle) return { error: "Bundle not found" };
  if (bundle.status === "closed") return { error: "Bundle is closed" };
  
  // Run AI extraction
  var extracted = extractCheckData(body.image_data, body.mime_type);
  
  if (extracted.error) {
    // Return empty fields so admin can fill manually
    return {
      extracted: {
        amount: "", deposit_date: "", check_number: "",
        bank_branch: "", account_number: "", payee_name: ""
      },
      warning: extracted.error
    };
  }
  
  return { extracted: extracted };
}
```

---

## 4. Updated Translation Keys

Add/modify these keys in all three languages:

```javascript
// English
bundleLabel: "Bundle Name",
bundleLabelPlaceholder: "e.g. 2025 Church Rent",
openBundle: "Open",
closedBundle: "Closed",
closeBundle: "Close Bundle",
reopenBundle: "Reopen Bundle",
addCheck: "Add Check (Scan)",
scanFirstCheck: "Scan First Check",
noChecksYet: "No checks yet. Scan your first check to start tracking.",
checksCount: "checks",
totalValue: "Total Value",
dateRange: "Period",
deleteCheck: "Delete Check",
confirmDeleteCheck: "Delete this check and its scan?",
belongsTo: "Check Belongs To",
openBundles: "Open Bundles",
awaitingAction: "Awaiting Action",

// Arabic
bundleLabel: "اسم الدفعة",
bundleLabelPlaceholder: "مثال: إيجار الكنيسة 2025",
openBundle: "مفتوحة",
closedBundle: "مغلقة",
closeBundle: "إغلاق الدفعة",
reopenBundle: "إعادة فتح الدفعة",
addCheck: "إضافة شيك (مسح)",
scanFirstCheck: "مسح أول شيك",
noChecksYet: "لا توجد شيكات بعد. امسح أول شيك لبدء التتبع.",
checksCount: "شيكات",
totalValue: "القيمة الإجمالية",
dateRange: "الفترة",
deleteCheck: "حذف الشيك",
confirmDeleteCheck: "حذف هذا الشيك ومسحه؟",
belongsTo: "الشيك لصالح",
openBundles: "دفعات مفتوحة",
awaitingAction: "بانتظار إجراء",

// Hebrew
bundleLabel: "שם חבילה",
bundleLabelPlaceholder: "לדוגמה: שכירות כנסייה 2025",
openBundle: "פתוחה",
closedBundle: "סגורה",
closeBundle: "סגור חבילה",
reopenBundle: "פתח מחדש",
addCheck: "הוסף צ'ק (סריקה)",
scanFirstCheck: "סרוק צ'ק ראשון",
noChecksYet: "אין צ'קים עדיין. סרוק את הצ'ק הראשון להתחיל.",
checksCount: "צ'קים",
totalValue: "סה״כ",
dateRange: "תקופה",
deleteCheck: "מחק צ'ק",
confirmDeleteCheck: "למחוק צ'ק זה והסריקה שלו?",
belongsTo: "הצ'ק שייך ל",
openBundles: "חבילות פתוחות",
awaitingAction: "ממתין לפעולה",
```

---

## 5. Updated Edge Cases

1. **Empty bundle**: Valid state. Bundle can exist with 0 checks. Show empty state with CTA.
2. **Scanning into closed bundle**: Rejected server-side. Frontend hides "Add Check" button.
3. **Duplicate scan**: If admin accidentally scans the same check twice, two entries are created. Admin can delete the duplicate. Gemini may return identical data — no dedup logic needed (keep it simple).
4. **Delete check**: Removes the check row AND trashes the Drive image. Re-orders remaining checks.
5. **Bundle date range**: Derived from `MIN(deposit_date)` to `MAX(deposit_date)` of its checks. If only one check or no dates, show just what's available.
6. **Bundle total**: `SUM(amount)` of all checks in the bundle.
7. **Close/reopen**: Soft state toggle. No data changes. Just controls whether "Add Check" is available.
8. **Alternating mode — family selection**: In alternating mode, Gemini extracts `payee_name`. Frontend can attempt to match against known family names to pre-select. If no match, default to no selection (admin must pick).

---

## 6. Implementation Order — Revised

This replaces the implementation order in both parent documents:

### Phase 1: Google Apps Script
```
1. Config.gs — updated headers, constants
2. SheetDB.gs — generic CRUD (unchanged)
3. Auth.gs — authentication (unchanged)
4. GeminiService.gs — AI extraction (unchanged from addendum v2)
5. DriveService.gs — image upload/delete (unchanged from addendum v2)
6. BundleService.gs — simplified create, close, reopen, delete
7. CheckService.gs — getChecks (sort by deposit_date), advanceCheck, deleteCheck
8. Main.gs — updated router with all new actions
9. Run initializeApp() to seed admin user
```

### Phase 2: Frontend Foundation
```
10. Scaffold Vite React project
11. config.js, theme.js, translations.js (with all new keys), global.css
12. AuthContext.jsx — Google Identity Services
13. LangContext.jsx — trilingual with RTL
14. api.js — all endpoints listed in §3.7
```

### Phase 3: Frontend Pages
```
15. LoginPage.jsx
16. App.jsx with routing
17. Navbar.jsx + TabBar.jsx
18. DashboardPage.jsx with updated stat cards
19. BundlesPage.jsx with BundleCard (shows label, open/closed, check count, total, date range)
20. CreateBundleForm.jsx (simplified: label, mode, family, split ratio)
21. CheckImageCapture.jsx (camera/file picker + compression)
22. CheckScanReview.jsx (review form with AI pre-fill + family selector for alternating)
23. ImageLightbox.jsx (fullscreen image viewer)
24. BundleDetailPage.jsx (Add Check button, checks table, close/reopen/delete)
25. CheckRow.jsx + StatusPipeline.jsx + FamilyBadge.jsx
26. SettingsPage.jsx (language + user management)
27. ConfirmDialog.jsx (reusable)
```

### Phase 4: PWA + Deploy
```
28. manifest.json, service worker, icons
29. GitHub Actions deployment workflow
30. Test PWA install on Android + iOS
```
