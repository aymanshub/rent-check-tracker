# PRD & Implementation Guide: Family Rent Check Tracker
## Zero-Cost Architecture: Google Apps Script + GitHub Pages + PWA

---

## 1. Product Overview

### 1.1 Background
A family owns a house inherited from grandparents, rented to the local Orthodox church. Rent is paid via post-dated checks, renewed roughly annually. The rent income is shared between two branches of the family:

- **دار عمي جورج (Dar Uncle George)** — code key: `george`
- **دار عمي أسعد (Dar Uncle Asaad)** — code key: `asaad`

Checks are collected from a church representative, tracked, deposited, and (when needed) the proceeds are split between the two families.

### 1.2 Goal
A mobile-friendly PWA that allows family members to register and track rent checks through their full lifecycle, with all data stored in a Google Sheet on the admin's Drive.

### 1.3 Architecture — Zero Cost

```
┌─────────────────────────────────────────────────────┐
│  User's Phone (Android / iPhone)                    │
│  PWA — installed to home screen, fullscreen, offline│
│  React SPA built with Vite                          │
│  Hosted on GitHub Pages (free forever)              │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS fetch calls
                   ▼
┌─────────────────────────────────────────────────────┐
│  Google Apps Script (free forever)                  │
│  Deployed as Web App                                │
│  Handles: Auth, CRUD, business logic                │
│  Native access to Google Sheets — no API keys       │
└──────────────────┬──────────────────────────────────┘
                   │ SpreadsheetApp (native, zero config)
                   ▼
┌─────────────────────────────────────────────────────┐
│  Google Sheet (free, lives in admin's Drive)        │
│  3 tabs: users, bundles, checks                     │
│  Visible to admin — can inspect raw data anytime    │
└─────────────────────────────────────────────────────┘
```

**Total cost: ₪0. No Google Cloud project. No server hosting. No API keys. No service accounts.**

### 1.4 Users
- **Admin** (the app owner): Full CRUD on bundles, checks, and users.
- **Members** (uncle's sons, family): **View only** for now. Designed to be upgradeable later.

---

## 2. Domain Model & Business Rules

### 2.1 Entities

#### Family (fixed constants)
```
george  →  AR: "دار عمي جورج"   EN: "Dar Uncle George"   HE: "דאר עמי ג'ורג'"
asaad   →  AR: "دار عمي أسعد"   EN: "Dar Uncle Asaad"    HE: "דאר עמי אסעד"
```

#### User
| Field      | Type   | Notes |
|-----------|--------|-------|
| id        | string | UUID (generated via `Utilities.getUuid()`) |
| email     | string | Google email, used for auth matching |
| name      | string | Display name |
| role      | enum   | `admin` or `member` |
| family    | enum   | `george` or `asaad` |
| created_at| string | ISO date |

#### Bundle
A batch of checks from one renewal period.

| Field          | Type   | Notes |
|---------------|--------|-------|
| id            | string | UUID |
| mode          | enum   | `alternating` or `single` |
| checks_on_name| enum   | `george` or `asaad`. In `single` mode: the name on ALL checks. In `alternating` mode: which family the admin belongs to (for flow routing). |
| split_ratio   | number | 1–99. Percentage for the OTHER party. Only used in `single` mode. |
| num_checks    | number | Total checks in this bundle |
| start_month   | number | 0-indexed (0=Jan, 11=Dec) |
| start_year    | number | e.g. 2025 |
| created_at    | string | ISO date |

**RULE**: One bundle = one mode. Never mixed. Each check is issued to exactly ONE family.

#### Check
| Field          | Type    | Notes |
|---------------|---------|-------|
| id            | string  | UUID |
| bundle_id     | string  | FK → Bundle.id |
| index         | number  | 0-based position in bundle |
| month_index   | number  | 0–11 calendar month |
| year          | number  | Calendar year |
| amount        | number  | Face value in ₪ |
| issued_to     | enum    | `george` or `asaad` |
| status        | enum    | See §2.2 |
| date_received | string  | ISO date or empty |
| date_handed   | string  | ISO date or empty |
| date_deposited| string  | ISO date or empty |
| date_drawn    | string  | ISO date or empty |
| date_delivered| string  | ISO date or empty |
| recipient_name| string  | Name of person who received checks/cash (for handed/delivered) |
| draw_amount   | number  | Calculated: `Math.round(amount * split_ratio / 100)` |

### 2.2 Check Lifecycle — Three Flows

#### Flow A: Alternating Mode — Own Family's Check
Check is on your family's name → you deposit it. Done.
```
pending → received → deposited  ✓ TERMINAL
```

#### Flow B: Alternating Mode — Other Family's Check
Check is on the other family's name → you hand it over to them. Done.
```
pending → received → handed_over  ✓ TERMINAL
```
- `handed_over` **REQUIRES** `recipient_name`

#### Flow C: Single Name Mode
All checks on one name → deposit → withdraw other party's share → deliver cash.
```
pending → received → deposited → drawn → delivered  ✓ TERMINAL
```
- `drawn` auto-calculates `draw_amount = Math.round(amount * split_ratio / 100)`
- `delivered` **REQUIRES** `recipient_name`

#### Flow Selection Logic
```javascript
function getFlow(check, bundle) {
  if (bundle.mode === "alternating") {
    // "Own" = check is issued to the same family as checks_on_name
    if (check.issued_to === bundle.checks_on_name) {
      return ["pending", "received", "deposited"];           // Flow A
    } else {
      return ["pending", "received", "handed_over"];         // Flow B
    }
  }
  return ["pending", "received", "deposited", "drawn", "delivered"]; // Flow C
}
```

#### Check Assignment in Alternating Mode
When creating checks in `alternating` mode:
- Even index (0, 2, 4...) → `asaad`
- Odd index (1, 3, 5...) → `george`

### 2.3 Action Tracking
- Each status change records: **date only** (no actor tracking).
- `recipient_name` is recorded for `handed_over` and `delivered` statuses.

---

## 3. Google Apps Script Backend

### 3.1 How It Works

Google Apps Script (GAS) is JavaScript that runs on Google's servers. When deployed as a "Web App", it exposes a URL that handles HTTP requests via two special functions:

```javascript
function doGet(e)  { /* handles GET requests */  }
function doPost(e) { /* handles POST/PATCH/DELETE requests */ }
```

GAS has native access to Google Sheets — no API keys, no OAuth for Sheets, no credentials:
```javascript
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("checks");
const data = sheet.getDataRange().getValues(); // that's it — full read
```

**Deployment**: In the Apps Script editor → Deploy → Web App → "Execute as: Me" + "Who has access: Anyone". This generates a URL like:
```
https://script.google.com/macros/s/AKfycbx.../exec
```

### 3.2 Project File Structure (Google Apps Script)

In the Apps Script editor (or using `clasp` CLI for local dev), create these files:

```
gas-backend/
├── appsscript.json        # Project manifest
├── Main.gs                # doGet/doPost router
├── Auth.gs                # Authentication logic
├── SheetDB.gs             # Generic Sheet CRUD operations
├── BundleService.gs       # Bundle creation/deletion logic
├── CheckService.gs        # Check flow advancement logic
├── UserService.gs         # User management
└── Config.gs              # Constants, sheet names, family definitions
```

**IMPORTANT**: All `.gs` files share the same global scope. No imports needed. Functions defined in any file are accessible from any other file.

### 3.3 Config.gs — Constants

```javascript
const CONFIG = {
  SHEET_NAMES: {
    USERS: "users",
    BUNDLES: "bundles",
    CHECKS: "checks",
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
    ALTERNATING_OWN:   ["pending", "received", "deposited"],
    ALTERNATING_OTHER: ["pending", "received", "handed_over"],
    SINGLE:            ["pending", "received", "deposited", "drawn", "delivered"],
  },
  // Column headers for each sheet (order matters — matches sheet columns)
  HEADERS: {
    USERS:   ["id", "email", "name", "role", "family", "created_at"],
    BUNDLES: ["id", "mode", "checks_on_name", "split_ratio", "num_checks", "start_month", "start_year", "created_at"],
    CHECKS:  ["id", "bundle_id", "index", "month_index", "year", "amount", "issued_to", "status", "date_received", "date_handed", "date_deposited", "date_drawn", "date_delivered", "recipient_name", "draw_amount"],
  },
};
```

### 3.4 SheetDB.gs — Generic CRUD Layer

This is the heart of the "database". Think of it as an ORM for Google Sheets.

```javascript
/**
 * SheetDB — treats a Google Sheet tab as a database table.
 * Row 1 = headers. Data starts at row 2. Column A = primary key (id).
 */

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    // Auto-create sheet with headers
    sheet = ss.insertSheet(name);
    const headers = CONFIG.HEADERS[name.toUpperCase()];
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
  }
  return sheet;
}

function readAll(sheetName) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // only headers or empty
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function findById(sheetName, id) {
  const all = readAll(sheetName);
  return all.find(row => row.id === id) || null;
}

function findByField(sheetName, field, value) {
  const all = readAll(sheetName);
  return all.filter(row => row[field] === value);
}

function appendRow(sheetName, record) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => record[h] !== undefined ? record[h] : "");
  sheet.appendRow(row);
}

function bulkAppend(sheetName, records) {
  if (records.length === 0) return;
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = records.map(record =>
    headers.map(h => record[h] !== undefined ? record[h] : "")
  );
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
}

function updateById(sheetName, id, updates) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("id");
  
  for (let r = 1; r < data.length; r++) {
    if (data[r][idCol] === id) {
      Object.keys(updates).forEach(key => {
        const col = headers.indexOf(key);
        if (col >= 0) {
          sheet.getRange(r + 1, col + 1).setValue(updates[key]);
        }
      });
      return true;
    }
  }
  return false;
}

function deleteById(sheetName, id) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const idCol = 0; // Column A is always id
  
  // Delete from bottom to top to preserve row indices
  for (let r = data.length - 1; r >= 1; r--) {
    if (data[r][idCol] === id) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

function deleteByField(sheetName, field, value) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = headers.indexOf(field);
  
  // Delete from bottom to top
  for (let r = data.length - 1; r >= 1; r--) {
    if (data[r][col] === value) {
      sheet.deleteRow(r + 1);
    }
  }
}
```

### 3.5 Auth.gs — Authentication

**Strategy**: GAS Web Apps can detect the Google-signed-in user via `Session.getActiveUser().getEmail()` BUT only when deployed with "Execute as: User accessing the web app" AND the user has edit access to the script. This is fragile.

**Better strategy — Token-based**:
1. Frontend uses Google Identity Services (GIS) to get an `id_token` (a JWT from Google).
2. Frontend sends this `id_token` to GAS in every request as a header-like parameter.
3. GAS verifies the `id_token` by calling Google's tokeninfo endpoint.
4. GAS checks the email from the token against the `users` sheet.

```javascript
/**
 * Verifies a Google id_token and returns the user record if authorized.
 * Returns null if invalid or user not in the users sheet.
 */
function authenticateRequest(idToken) {
  if (!idToken) return null;
  
  try {
    // Verify token with Google
    const response = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken
    );
    const payload = JSON.parse(response.getContentText());
    
    if (!payload.email) return null;
    
    // Check if user exists in our users sheet
    const users = readAll(CONFIG.SHEET_NAMES.USERS);
    const user = users.find(u => u.email.toLowerCase() === payload.email.toLowerCase());
    
    return user || null;
  } catch (e) {
    Logger.log("Auth error: " + e.message);
    return null;
  }
}
```

### 3.6 Main.gs — Request Router

GAS Web Apps can only use `doGet` and `doPost`. We route using an `action` parameter.

```javascript
/**
 * All requests come through doGet or doPost.
 * 
 * doGet:  read operations (list bundles, checks, dashboard, users)
 * doPost: write operations (create bundle, advance check, add/remove user, delete bundle)
 *
 * Every request must include parameter: token=<google_id_token>
 * Write operations must include parameter: action=<action_name>
 *
 * GET examples:
 *   ?action=dashboard&token=xxx
 *   ?action=bundles&token=xxx
 *   ?action=checks&bundle_id=abc&token=xxx
 *   ?action=users&token=xxx
 *
 * POST examples (data in POST body as JSON):
 *   action=create_bundle  body: { bundle data }
 *   action=delete_bundle  body: { bundle_id }
 *   action=advance_check  body: { check_id, recipient_name? }
 *   action=add_user       body: { email, name, family }
 *   action=remove_user    body: { user_id }
 */

function doGet(e) {
  const token = e.parameter.token;
  const user = authenticateRequest(token);
  
  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  
  const action = e.parameter.action || "dashboard";
  
  switch (action) {
    case "dashboard":
      return jsonResponse(getDashboard());
    case "bundles":
      return jsonResponse(getBundles());
    case "checks":
      return jsonResponse(getChecks(e.parameter.bundle_id));
    case "users":
      if (user.role !== CONFIG.ROLES.ADMIN) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
      return jsonResponse(getUsers());
    default:
      return jsonResponse({ error: "Unknown action" }, 400);
  }
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const token = body.token;
  const user = authenticateRequest(token);
  
  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  
  if (user.role !== CONFIG.ROLES.ADMIN) {
    return jsonResponse({ error: "Forbidden — admin only" }, 403);
  }
  
  const action = body.action;
  
  switch (action) {
    case "create_bundle":
      return jsonResponse(createBundle(body.data));
    case "delete_bundle":
      return jsonResponse(deleteBundleAndChecks(body.bundle_id));
    case "advance_check":
      return jsonResponse(advanceCheck(body.check_id, body.recipient_name));
    case "add_user":
      return jsonResponse(addUser(body.data));
    case "remove_user":
      return jsonResponse(removeUser(body.user_id, user.id));
    default:
      return jsonResponse({ error: "Unknown action" }, 400);
  }
}

function jsonResponse(data, status) {
  // GAS Web Apps always return 200 HTTP status.
  // We embed our own status in the response body.
  const output = ContentService.createTextOutput(
    JSON.stringify({ status: status || 200, ...data })
  );
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
```

### 3.7 BundleService.gs

```javascript
function getBundles() {
  return { bundles: readAll(CONFIG.SHEET_NAMES.BUNDLES) };
}

function createBundle(data) {
  // Validate
  if (!data.mode || !data.checks_on_name || !data.num_checks || !data.amounts) {
    return { error: "Missing required fields" };
  }
  if (data.amounts.length !== data.num_checks) {
    return { error: "amounts length must equal num_checks" };
  }
  
  const bundleId = Utilities.getUuid();
  const now = new Date().toISOString().split("T")[0];
  
  const bundle = {
    id: bundleId,
    mode: data.mode,
    checks_on_name: data.checks_on_name,
    split_ratio: data.mode === "single" ? (data.split_ratio || 50) : 50,
    num_checks: data.num_checks,
    start_month: data.start_month,
    start_year: data.start_year,
    created_at: now,
  };
  
  // Generate checks
  const checks = [];
  for (let i = 0; i < data.num_checks; i++) {
    const monthIndex = (data.start_month + i) % 12;
    const yearOffset = Math.floor((data.start_month + i) / 12);
    
    let issuedTo;
    if (data.mode === "alternating") {
      issuedTo = (i % 2 === 0) ? CONFIG.FAMILIES.ASAAD : CONFIG.FAMILIES.GEORGE;
    } else {
      issuedTo = data.checks_on_name;
    }
    
    checks.push({
      id: Utilities.getUuid(),
      bundle_id: bundleId,
      index: i,
      month_index: monthIndex,
      year: data.start_year + yearOffset,
      amount: data.amounts[i],
      issued_to: issuedTo,
      status: CONFIG.STATUSES.PENDING,
      date_received: "",
      date_handed: "",
      date_deposited: "",
      date_drawn: "",
      date_delivered: "",
      recipient_name: "",
      draw_amount: "",
    });
  }
  
  appendRow(CONFIG.SHEET_NAMES.BUNDLES, bundle);
  bulkAppend(CONFIG.SHEET_NAMES.CHECKS, checks);
  
  return { bundle: bundle, checks: checks };
}

function deleteBundleAndChecks(bundleId) {
  deleteByField(CONFIG.SHEET_NAMES.CHECKS, "bundle_id", bundleId);
  deleteById(CONFIG.SHEET_NAMES.BUNDLES, bundleId);
  return { success: true };
}
```

### 3.8 CheckService.gs

```javascript
function getChecks(bundleId) {
  if (!bundleId) return { error: "bundle_id required" };
  const checks = findByField(CONFIG.SHEET_NAMES.CHECKS, "bundle_id", bundleId);
  checks.sort((a, b) => Number(a.index) - Number(b.index));
  return { checks: checks };
}

function getCheckFlow(check, bundle) {
  if (bundle.mode === "alternating") {
    if (check.issued_to === bundle.checks_on_name) {
      return CONFIG.FLOWS.ALTERNATING_OWN;
    } else {
      return CONFIG.FLOWS.ALTERNATING_OTHER;
    }
  }
  return CONFIG.FLOWS.SINGLE;
}

function advanceCheck(checkId, recipientName) {
  const check = findById(CONFIG.SHEET_NAMES.CHECKS, checkId);
  if (!check) return { error: "Check not found" };
  
  const bundle = findById(CONFIG.SHEET_NAMES.BUNDLES, check.bundle_id);
  if (!bundle) return { error: "Bundle not found" };
  
  const flow = getCheckFlow(check, bundle);
  const currentIndex = flow.indexOf(check.status);
  
  if (currentIndex < 0 || currentIndex >= flow.length - 1) {
    return { error: "Check already at terminal status" };
  }
  
  const nextStatus = flow[currentIndex + 1];
  
  // Validate recipient_name requirement
  if ((nextStatus === CONFIG.STATUSES.HANDED || nextStatus === CONFIG.STATUSES.DELIVERED) && !recipientName) {
    return { error: "recipient_name required for this status" };
  }
  
  const today = new Date().toISOString().split("T")[0];
  const updates = { status: nextStatus };
  
  // Map status to its date column
  const dateColumnMap = {
    "received": "date_received",
    "handed_over": "date_handed",
    "deposited": "date_deposited",
    "drawn": "date_drawn",
    "delivered": "date_delivered",
  };
  
  if (dateColumnMap[nextStatus]) {
    updates[dateColumnMap[nextStatus]] = today;
  }
  
  if (nextStatus === CONFIG.STATUSES.DRAWN) {
    updates.draw_amount = Math.round(Number(check.amount) * Number(bundle.split_ratio) / 100);
  }
  
  if (recipientName) {
    updates.recipient_name = recipientName;
  }
  
  updateById(CONFIG.SHEET_NAMES.CHECKS, checkId, updates);
  
  return { success: true, check_id: checkId, new_status: nextStatus };
}

function getDashboard() {
  const bundles = readAll(CONFIG.SHEET_NAMES.BUNDLES);
  const checks = readAll(CONFIG.SHEET_NAMES.CHECKS);
  
  const total = checks.length;
  const pending = checks.filter(c => c.status === CONFIG.STATUSES.PENDING).length;
  
  let completed = 0;
  for (const c of checks) {
    const bundle = bundles.find(b => b.id === c.bundle_id);
    if (!bundle) continue;
    const flow = getCheckFlow(c, bundle);
    if (c.status === flow[flow.length - 1]) {
      completed++;
    }
  }
  
  return {
    total,
    pending,
    completed,
    in_progress: total - pending - completed,
    bundles: bundles,
  };
}
```

### 3.9 UserService.gs

```javascript
function getUsers() {
  return { users: readAll(CONFIG.SHEET_NAMES.USERS) };
}

function addUser(data) {
  if (!data.email || !data.name || !data.family) {
    return { error: "email, name, and family are required" };
  }
  
  // Check for duplicate email
  const existing = readAll(CONFIG.SHEET_NAMES.USERS);
  if (existing.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
    return { error: "User with this email already exists" };
  }
  
  const user = {
    id: Utilities.getUuid(),
    email: data.email,
    name: data.name,
    role: CONFIG.ROLES.MEMBER, // new users are always members
    family: data.family,
    created_at: new Date().toISOString().split("T")[0],
  };
  
  appendRow(CONFIG.SHEET_NAMES.USERS, user);
  return { user: user };
}

function removeUser(userId, currentUserId) {
  if (userId === currentUserId) {
    return { error: "Cannot remove yourself" };
  }
  
  const user = findById(CONFIG.SHEET_NAMES.USERS, userId);
  if (!user) return { error: "User not found" };
  
  // Don't allow removing the last admin
  const admins = readAll(CONFIG.SHEET_NAMES.USERS).filter(u => u.role === CONFIG.ROLES.ADMIN);
  if (user.role === CONFIG.ROLES.ADMIN && admins.length <= 1) {
    return { error: "Cannot remove the last admin" };
  }
  
  deleteById(CONFIG.SHEET_NAMES.USERS, userId);
  return { success: true };
}
```

### 3.10 Initial Setup Script

Add this function to Main.gs. Run it ONCE manually from the Apps Script editor to seed the admin user:

```javascript
/**
 * Run this ONCE from the script editor (Run → initializeApp).
 * Creates sheet tabs with headers and adds the first admin user.
 * Edit the email/name below before running.
 */
function initializeApp() {
  // Ensure all sheets exist with headers
  Object.values(CONFIG.SHEET_NAMES).forEach(name => getSheet(name));
  
  // Add admin user — EDIT THESE VALUES
  const adminUser = {
    id: Utilities.getUuid(),
    email: "YOUR_GOOGLE_EMAIL@gmail.com",  // ← CHANGE THIS
    name: "Your Name",                      // ← CHANGE THIS
    role: CONFIG.ROLES.ADMIN,
    family: CONFIG.FAMILIES.GEORGE,          // ← CHANGE IF NEEDED
    created_at: new Date().toISOString().split("T")[0],
  };
  
  appendRow(CONFIG.SHEET_NAMES.USERS, adminUser);
  Logger.log("Admin user created: " + adminUser.email);
  Logger.log("App initialized successfully.");
}
```

### 3.11 CORS Configuration

GAS Web Apps don't support custom CORS headers. The standard workaround:

**For GET requests**: Frontend calls the GAS URL directly — GAS returns JSON with CORS handled automatically for `doGet`.

**For POST requests**: Frontend must use `mode: "no-cors"` which prevents reading the response, OR use the **redirect trick**:

**RECOMMENDED APPROACH — Use doPost with JSON and fetch in redirect-follow mode**:

Actually, the cleanest proven pattern for GAS + external frontend is:

```javascript
// Frontend — all requests go through POST:
async function gasRequest(action, data = {}) {
  const GAS_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
  
  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // IMPORTANT: text/plain avoids CORS preflight
    body: JSON.stringify({
      token: getStoredIdToken(),
      action: action,
      ...data,
    }),
  });
  
  return response.json();
}

// Usage:
const dashboard = await gasRequest("dashboard");
const bundles = await gasRequest("bundles");
const checks = await gasRequest("checks", { bundle_id: "abc" });
const result = await gasRequest("create_bundle", { data: bundleData });
```

**CRITICAL**: Using `Content-Type: text/plain` avoids the CORS preflight (OPTIONS request) that GAS cannot handle. The GAS side reads the body with `JSON.parse(e.postData.contents)` regardless.

**Update Main.gs**: Since everything goes through POST now, merge the router:

```javascript
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const token = body.token;
  const user = authenticateRequest(token);
  
  if (!user) return jsonResponse({ error: "Unauthorized" });
  
  const action = body.action;
  
  // READ actions (no admin required)
  switch (action) {
    case "dashboard":  return jsonResponse(getDashboard());
    case "bundles":    return jsonResponse(getBundles());
    case "checks":     return jsonResponse(getChecks(body.bundle_id));
  }
  
  // WRITE actions (admin required)
  if (user.role !== CONFIG.ROLES.ADMIN) {
    return jsonResponse({ error: "Forbidden — admin only" });
  }
  
  switch (action) {
    case "create_bundle":  return jsonResponse(createBundle(body.data));
    case "delete_bundle":  return jsonResponse(deleteBundleAndChecks(body.bundle_id));
    case "advance_check":  return jsonResponse(advanceCheck(body.check_id, body.recipient_name));
    case "users":          return jsonResponse(getUsers());
    case "add_user":       return jsonResponse(addUser(body.data));
    case "remove_user":    return jsonResponse(removeUser(body.user_id, user.id));
    default:               return jsonResponse({ error: "Unknown action" });
  }
}

// Keep doGet for health check only
function doGet(e) {
  return jsonResponse({ status: "ok", message: "Rent Check Tracker API" });
}
```

---

## 4. Frontend — React PWA

### 4.1 Project Structure

```
frontend/
├── public/
│   ├── index.html
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service worker for offline + caching
│   ├── icon-192.png           # PWA icon
│   └── icon-512.png           # PWA icon
├── src/
│   ├── main.jsx               # Entry point, mounts App
│   ├── App.jsx                # Router + context providers
│   ├── config.js              # GAS_URL, Google Client ID constants
│   ├── i18n/
│   │   └── translations.js    # Full EN/AR/HE translation object (~80 keys each)
│   ├── contexts/
│   │   ├── AuthContext.jsx     # Google sign-in + token management
│   │   └── LangContext.jsx     # Language + direction state
│   ├── services/
│   │   └── api.js             # gasRequest() wrapper — all API calls
│   ├── hooks/
│   │   ├── useBundles.js      # State + CRUD for bundles
│   │   ├── useChecks.js       # State + operations for checks
│   │   ├── useUsers.js        # State + CRUD for users
│   │   └── useDashboard.js    # Dashboard data hook
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── BundlesPage.jsx
│   │   ├── BundleDetailPage.jsx
│   │   └── SettingsPage.jsx
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── TabBar.jsx
│   │   ├── StatCard.jsx
│   │   ├── BundleCard.jsx
│   │   ├── CheckRow.jsx
│   │   ├── StatusPipeline.jsx
│   │   ├── FamilyBadge.jsx
│   │   ├── CreateBundleForm.jsx
│   │   ├── ConfirmDialog.jsx
│   │   └── LanguageSwitcher.jsx
│   └── styles/
│       ├── theme.js           # Colors, fonts, spacing
│       └── global.css         # Base styles, RTL support, PWA adjustments
├── package.json
└── vite.config.js
```

### 4.2 PWA Configuration

**`public/manifest.json`**:
```json
{
  "name": "Rent Check Tracker",
  "short_name": "CheckTracker",
  "description": "Family rent check management",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f5f0e8",
  "theme_color": "#1a6b5a",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**`public/sw.js`** — Simple cache-first service worker:
```javascript
const CACHE_NAME = "check-tracker-v1";
const STATIC_ASSETS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("fetch", (event) => {
  // Cache static assets, network-first for API calls
  if (event.request.url.includes("script.google.com")) {
    return; // Don't cache API calls
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
```

**Register in `main.jsx`**:
```javascript
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
```

### 4.3 Authentication — Google Identity Services

Use Google's new GIS library (replaces the old gapi sign-in). No backend OAuth flow needed — the browser gets an `id_token` directly.

**Setup**: Get a Google OAuth Client ID from https://console.cloud.google.com/apis/credentials (this is free, no billing required). Set authorized JavaScript origins to both `http://localhost:5173` and your GitHub Pages domain.

**`src/config.js`**:
```javascript
export const GAS_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
export const GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com";
```

**`src/contexts/AuthContext.jsx`** — Key logic:
```jsx
// Load the GIS script in index.html:
// <script src="https://accounts.google.com/gsi/client" async></script>

// In AuthContext:
// 1. Initialize google.accounts.id with your CLIENT_ID
// 2. On sign-in callback, receive credential (id_token)
// 3. Store id_token in localStorage
// 4. Send it with every API call
// 5. Decode the JWT client-side to get user email (for display only)
// 6. First API call validates the token server-side and returns user data

// google.accounts.id.initialize({
//   client_id: GOOGLE_CLIENT_ID,
//   callback: handleCredentialResponse,
// });
//
// function handleCredentialResponse(response) {
//   const idToken = response.credential;
//   localStorage.setItem("id_token", idToken);
//   // Call API to verify + get user role
//   gasRequest("dashboard").then(data => {
//     if (data.error === "Unauthorized") { /* show error */ }
//     else { /* set user state */ }
//   });
// }
```

**IMPORTANT**: Google `id_token`s expire after ~1 hour. The frontend should handle 401 responses by triggering a silent re-authentication with `google.accounts.id.prompt()`.

### 4.4 API Service Layer

**`src/services/api.js`**:
```javascript
import { GAS_URL } from "../config";

export async function gasRequest(action, data = {}) {
  const token = localStorage.getItem("id_token");
  if (!token) throw new Error("Not authenticated");
  
  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ token, action, ...data }),
    });
    
    const result = await response.json();
    
    if (result.error === "Unauthorized") {
      // Token expired — trigger re-auth
      localStorage.removeItem("id_token");
      window.dispatchEvent(new Event("auth-expired"));
      throw new Error("Token expired");
    }
    
    return result;
  } catch (error) {
    console.error("API error:", error);
    throw error;
  }
}

// Convenience methods
export const api = {
  dashboard: () => gasRequest("dashboard"),
  bundles: () => gasRequest("bundles"),
  checks: (bundleId) => gasRequest("checks", { bundle_id: bundleId }),
  createBundle: (data) => gasRequest("create_bundle", { data }),
  deleteBundle: (bundleId) => gasRequest("delete_bundle", { bundle_id: bundleId }),
  advanceCheck: (checkId, recipientName) =>
    gasRequest("advance_check", { check_id: checkId, recipient_name: recipientName }),
  users: () => gasRequest("users"),
  addUser: (data) => gasRequest("add_user", { data }),
  removeUser: (userId) => gasRequest("remove_user", { user_id: userId }),
};
```

### 4.5 UI Specification

Refer to the full specification in this section. The prototype artifact created in our earlier conversation is the visual reference. Key specs:

#### Visual Design System
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#f5f0e8` | Page background |
| `--bg-gradient` | `linear-gradient(135deg, #f5f0e8, #ede7db)` | Body |
| `--card` | `#ffffff` | Card backgrounds |
| `--primary` | `#1a6b5a` | Buttons, active states, navbar |
| `--primary-light` | `#e8f5f0` | Hover/selected backgrounds |
| `--accent` | `#c4993c` | Gold highlights, warnings |
| `--accent-light` | `#fdf6e8` | Gold tinted backgrounds |
| `--text` | `#2c2c2c` | Primary text |
| `--text-muted` | `#7a7a7a` | Secondary text |
| `--border` | `#e8e2d8` | Card/table borders |
| `--danger` | `#dc4444` | Delete actions |
| `--george` | `#2563eb` | Family George badge |
| `--asaad` | `#7c3aed` | Family Asaad badge |
| `--status-pending` | `#94a3b8` | |
| `--status-received` | `#3b82f6` | |
| `--status-handed` | `#8b5cf6` | |
| `--status-deposited` | `#f59e0b` | |
| `--status-drawn` | `#f97316` | |
| `--status-delivered` | `#10b981` | |

#### Typography
- English: `'Palatino Linotype', 'Book Antiqua', Palatino, serif`
- Arabic: `'Noto Sans Arabic', 'Segoe UI', sans-serif` (load from Google Fonts)
- Hebrew: `'Noto Sans Hebrew', 'Segoe UI', sans-serif` (load from Google Fonts)
- Numbers/amounts: Always LTR even in RTL layouts

#### RTL Support
- All layouts flip via `direction: rtl` on root element
- Use CSS logical properties: `margin-inline-start` instead of `margin-left`
- Tab bar, navbar, table cells — all respect direction
- Status pipeline dots flow left-to-right always (visual convention)

#### Pages (see §2 of original PRD for full detail)
1. **LoginPage**: Google sign-in button, language toggle, app branding
2. **DashboardPage**: 4 stat cards + bundle list with progress bars
3. **BundlesPage**: Bundle list + "New Bundle" button (admin) → opens CreateBundleForm
4. **BundleDetailPage**: Bundle header + checks table with StatusPipeline + action buttons
5. **SettingsPage**: Language toggle + user management (admin only)

#### StatusPipeline Component
Visual representation of a check's flow progress:
```
  ◉ ——— ◉ ——— ○        (2 of 3 completed)
 recv  depo  drawn

- Filled colored circle = achieved status
- Gray circle = future status
- Colored connecting line between achieved steps
- Gray connecting line for future steps
- Status icon inside each circle: ◉ ✋ 🏦 💵 ✓
```

#### Mobile Considerations
- Stat cards: 2×2 grid on screens < 480px
- Checks table: horizontal scroll on mobile, sticky first column
- Touch targets: minimum 44×44px for all buttons
- Bottom padding to avoid phone gesture areas

### 4.6 Translations

Use the complete trilingual translation set with ~80 keys. See the prototype artifact for the full `T` object. All family names, status labels, action buttons, form labels, error messages, and empty states must be translated in all three languages.

### 4.7 GitHub Pages Deployment

**`vite.config.js`**:
```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/rent-check-tracker/",  // Must match GitHub repo name
  build: { outDir: "dist" },
});
```

**GitHub Action (`.github/workflows/deploy.yml`)**:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd frontend && npm ci && npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: frontend/dist }
      - uses: actions/deploy-pages@v4
```

---

## 5. Setup Instructions for the Developer

### Step-by-Step (Do This Before Coding)

#### A. Create the Google Sheet
1. Go to https://sheets.google.com → Create blank spreadsheet
2. Name it "Rent Check Tracker"
3. Note the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit`

#### B. Set Up Google Apps Script
1. In the Google Sheet → Extensions → Apps Script
2. This opens the script editor bound to your sheet
3. Delete the default `Code.gs` content
4. Create the files listed in §3.2 and paste the code from this PRD
5. Edit `initializeApp()` with your email/name
6. Run `initializeApp()` from the editor (Run → initializeApp)
7. Authorize when prompted (it will ask for Sheets permissions — this is expected)
8. Deploy: Deploy → New deployment → Type: Web app → Execute as: Me → Who has access: Anyone → Deploy
9. Copy the deployment URL

#### C. Get Google OAuth Client ID (Free)
1. Go to https://console.cloud.google.com
2. Create a new project (or use existing) — **free, no billing needed**
3. Go to APIs & Services → Credentials
4. Click "+ Create Credentials" → OAuth Client ID
5. Application type: Web application
6. Add Authorized JavaScript origins:
   - `http://localhost:5173` (for development)
   - `https://YOUR_USERNAME.github.io` (for production)
7. Copy the Client ID

#### D. Configure Frontend
1. Put the GAS deployment URL in `src/config.js` → `GAS_URL`
2. Put the OAuth Client ID in `src/config.js` → `GOOGLE_CLIENT_ID`

---

## 6. Implementation Order for Claude Code

Tell Claude Code to implement in this order:

### Phase 1: Google Apps Script Backend
```
1. Create all .gs files with the code from PRD sections 3.3–3.10
2. The code in the PRD is near-complete — adapt and fill gaps
3. Test by running initializeApp() and checking the Sheet
```

### Phase 2: Frontend Foundation
```
4. Scaffold Vite React project with: npm create vite@latest frontend -- --template react
5. Install dependencies: (none beyond React — keep it minimal)
6. Create config.js, theme.js, translations.js, global.css
7. Create AuthContext with Google Identity Services integration
8. Create LangContext with localStorage persistence
9. Create api.js service layer
```

### Phase 3: Frontend Pages
```
10. Build LoginPage (Google sign-in + language switcher)
11. Build App.jsx with routing (login vs main app)
12. Build Navbar + TabBar components
13. Build DashboardPage with StatCard components
14. Build BundlesPage with BundleCard components
15. Build CreateBundleForm (mode, family, ratio, amounts)
16. Build BundleDetailPage with CheckRow + StatusPipeline
17. Build SettingsPage with user management
18. Build ConfirmDialog (reusable)
```

### Phase 4: PWA + Deployment
```
19. Add manifest.json, service worker, PWA icons
20. Add GitHub Actions workflow for deployment
21. Test PWA install on Android and iOS
```

---

## 7. Edge Cases & Validation

1. `amounts` array length MUST equal `num_checks` — validate in both frontend and GAS
2. Cannot advance past terminal status — hide button in frontend, reject in GAS
3. Cascade delete: removing a bundle removes all its checks
4. Cannot remove yourself or the last admin
5. Month overflow: start_month=10 + 4 checks → Nov, Dec, Jan(+1yr), Feb(+1yr)
6. Currency: ₪ with comma separators. `draw_amount = Math.round(amount * split_ratio / 100)`
7. Split ratio: integer 1–99
8. Token expiry: handle 401 by re-triggering Google sign-in silently
9. GAS cold start: show loading spinner, ~1-2 second delay on first call
10. Concurrent edits: last-write-wins (acceptable for family use)
11. Empty states: friendly messages + CTA when no bundles exist

---

## 8. Glossary

| English | Arabic | Hebrew | Code Key |
|---------|--------|--------|----------|
| Bundle | دفعة | חבילה | bundle |
| Check | شيك | צ'ק | check |
| Deposit | إيداع | הפקדה | deposited |
| Draw | سحب | משיכה | drawn |
| Hand over | تسليم | מסירה | handed_over |
| Deliver | تسليم الحصة | מסירת חלק | delivered |
| Receive | استلام | קבלה | received |
| Pending | قيد الانتظار | ממתין | pending |
| Split ratio | نسبة التقسيم | יחס חלוקה | split_ratio |
| Admin | مدير | מנהל | admin |
| Member | عضو | חבר | member |

---

## 9. Future Enhancements (Not in V1)

- Upgradeable member permissions (allow members to mark handovers)
- Push notifications via web push or Telegram bot
- PDF export of bundle status reports
- Audit log (who changed what)
- Multi-property support
- Automatic deposit reminders
