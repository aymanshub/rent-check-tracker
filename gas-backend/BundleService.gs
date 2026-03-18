/**
 * BundleService.gs — Bundle CRUD operations.
 *
 * Bundles are open containers. Checks are added dynamically via scanning.
 * No checks are pre-generated at bundle creation.
 */

function getBundles() {
  return { bundles: readAll(CONFIG.SHEET_NAMES.BUNDLES) };
}

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

/**
 * Delete a bundle and all its checks + Drive images.
 */
function deleteBundleAndChecks(bundleId) {
  var bundle = findById(CONFIG.SHEET_NAMES.BUNDLES, bundleId);
  if (!bundle) return { error: "Bundle not found" };

  // Delete Drive images folder
  deleteBundleImages(bundle);

  // Delete all checks belonging to this bundle
  deleteByField(CONFIG.SHEET_NAMES.CHECKS, "bundle_id", bundleId);

  // Delete the bundle itself
  deleteById(CONFIG.SHEET_NAMES.BUNDLES, bundleId);

  return { success: true };
}
