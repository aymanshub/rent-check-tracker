/**
 * Main.gs — Request router for Google Apps Script Web App.
 *
 * All frontend requests go through doPost (to avoid CORS preflight).
 * Content-Type: text/plain avoids the OPTIONS request that GAS cannot handle.
 *
 * READ actions (any authenticated user):
 *   dashboard, bundles, checks
 *
 * WRITE actions (admin only):
 *   create_bundle, close_bundle, reopen_bundle, delete_bundle,
 *   scan_check, confirm_check_data, advance_check, delete_check,
 *   users, add_user, remove_user
 */

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var token = body.token;
  var user = authenticateRequest(token);

  if (!user) return jsonResponse({ error: "Unauthorized" });

  var action = body.action;

  // READ actions (no admin required)
  switch (action) {
    case "dashboard":  return jsonResponse(getDashboard());
    case "bundles":    return jsonResponse(getBundles());
    case "checks":     return jsonResponse(getChecks(body.bundle_id));
  }

  // WRITE actions (admin required)
  if (user.role !== CONFIG.ROLES.ADMIN) {
    return jsonResponse({ error: "Forbidden \u2014 admin only" });
  }

  switch (action) {
    case "create_bundle":      return jsonResponse(createBundle(body.data));
    case "close_bundle":       return jsonResponse(closeBundle(body.bundle_id));
    case "reopen_bundle":      return jsonResponse(reopenBundle(body.bundle_id));
    case "delete_bundle":      return jsonResponse(deleteBundleAndChecks(body.bundle_id));
    case "scan_check":         return jsonResponse(handleScanCheck(body));
    case "confirm_check_data": return jsonResponse(handleConfirmCheckData(body));
    case "advance_check":      return jsonResponse(advanceCheck(body.check_id, body.recipient_name));
    case "delete_check":       return jsonResponse(deleteCheck(body.check_id));
    case "users":              return jsonResponse(getUsers());
    case "add_user":           return jsonResponse(addUser(body.data));
    case "remove_user":        return jsonResponse(removeUser(body.user_id, user.id));
    default:                   return jsonResponse({ error: "Unknown action" });
  }
}

/**
 * doGet — Health check only. All real requests go through doPost.
 */
function doGet(e) {
  return jsonResponse({ status: "ok", message: "Rent Check Tracker API" });
}

/**
 * JSON response wrapper. GAS always returns HTTP 200; we embed status in body.
 */
function jsonResponse(data, status) {
  var output = ContentService.createTextOutput(
    JSON.stringify({ status: status || 200, ...data })
  );
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ═══════════════════════════════════════════
// Scan Handlers
// ═══════════════════════════════════════════

/**
 * Step 1: Receives scanned image, runs Gemini extraction, returns suggested data.
 * Does NOT save anything — waits for confirmation.
 *
 * Input: { bundle_id, image_data (base64), mime_type }
 * Returns: { extracted: { amount, deposit_date, check_number, bank_branch, account_number, payee_name } }
 */
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

/**
 * Step 2: Admin reviewed and confirmed. Create the check with all data.
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
  var fileName;
  if (data.deposit_date) {
    fileName = "check_" + String(nextOrder).padStart(2, "0") + "_" + data.deposit_date + "." + ext;
  } else {
    fileName = "check_" + String(nextOrder).padStart(2, "0") + "." + ext;
  }

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

// ═══════════════════════════════════════════
// Initialization — Run ONCE from script editor
// ═══════════════════════════════════════════

/**
 * Run this ONCE from the script editor (Run > initializeApp).
 * Creates sheet tabs with headers and adds the first admin user.
 */
function initializeApp() {
  // Ensure all sheets exist with headers
  Object.values(CONFIG.SHEET_NAMES).forEach(function(name) { getSheet(name); });

  // Add admin user
  var adminUser = {
    id: Utilities.getUuid(),
    email: "aymans.eng@gmail.com",
    name: "Ayman",
    role: CONFIG.ROLES.ADMIN,
    family: CONFIG.FAMILIES.GEORGE,
    created_at: new Date().toISOString().split("T")[0],
  };

  appendRow(CONFIG.SHEET_NAMES.USERS, adminUser);
  Logger.log("Admin user created: " + adminUser.email);
  Logger.log("App initialized successfully.");
}
