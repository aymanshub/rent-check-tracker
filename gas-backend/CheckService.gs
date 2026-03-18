/**
 * CheckService.gs — Check lifecycle, flow logic, and dashboard.
 */

/**
 * Get all checks for a bundle, sorted by deposit_date then order.
 */
function getChecks(bundleId) {
  if (!bundleId) return { error: "bundle_id required" };
  var checks = findByField(CONFIG.SHEET_NAMES.CHECKS, "bundle_id", bundleId);

  checks.sort(function(a, b) {
    if (a.deposit_date && b.deposit_date) {
      return a.deposit_date.localeCompare(b.deposit_date);
    }
    return Number(a.order) - Number(b.order);
  });

  return { checks: checks };
}

/**
 * Determine the lifecycle flow for a check based on its bundle's mode.
 */
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

/**
 * Advance a check to its next status in the lifecycle.
 */
function advanceCheck(checkId, recipientName) {
  var check = findById(CONFIG.SHEET_NAMES.CHECKS, checkId);
  if (!check) return { error: "Check not found" };

  var bundle = findById(CONFIG.SHEET_NAMES.BUNDLES, check.bundle_id);
  if (!bundle) return { error: "Bundle not found" };

  var flow = getCheckFlow(check, bundle);
  var currentIndex = flow.indexOf(check.status);

  if (currentIndex < 0 || currentIndex >= flow.length - 1) {
    return { error: "Check already at terminal status" };
  }

  var nextStatus = flow[currentIndex + 1];

  // Validate recipient_name requirement
  if ((nextStatus === CONFIG.STATUSES.HANDED || nextStatus === CONFIG.STATUSES.DELIVERED) && !recipientName) {
    return { error: "recipient_name required for this status" };
  }

  var today = new Date().toISOString().split("T")[0];
  var updates = { status: nextStatus };

  // Map status to its date column
  var dateColumnMap = {
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

/**
 * Delete an individual check and its Drive image.
 * Re-orders remaining checks in the bundle.
 */
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

/**
 * Dashboard data: aggregate stats across all bundles and checks.
 */
function getDashboard() {
  var bundles = readAll(CONFIG.SHEET_NAMES.BUNDLES);
  var checks = readAll(CONFIG.SHEET_NAMES.CHECKS);

  var total = checks.length;
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

  var awaitingAction = total - completed;

  return {
    total: total,
    awaiting_action: awaitingAction,
    completed: completed,
    bundles: bundles,
    checks: checks,
    settings: getSettings(),
  };
}
