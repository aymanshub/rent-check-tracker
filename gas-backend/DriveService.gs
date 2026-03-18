/**
 * DriveService.gs — Manages check image storage in Google Drive.
 *
 * Folder structure:
 *   My Drive/
 *     Rent Check Tracker/
 *       <bundle-label>/
 *         check_01_2025-03-15.jpg
 *         check_02_2025-05-15.jpg
 */

/**
 * Gets or creates the root "Rent Check Tracker" folder in the owner's Drive.
 */
function getRootFolder() {
  var folderName = CONFIG.DRIVE_ROOT_FOLDER;
  var folders = DriveApp.getFoldersByName(folderName);

  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(folderName);
}

/**
 * Gets or creates a subfolder for a specific bundle.
 */
function getBundleFolder(bundle) {
  var root = getRootFolder();
  var folderName = bundle.label || ("Bundle " + bundle.id.substring(0, 8));
  var folders = root.getFoldersByName(folderName);

  if (folders.hasNext()) {
    return folders.next();
  }

  return root.createFolder(folderName);
}

/**
 * Uploads a check image to Drive.
 *
 * @param {string} checkId — UUID of the check
 * @param {string} base64Data — Raw base64 image data (no data URL prefix)
 * @param {string} mimeType — e.g. "image/jpeg"
 * @param {string} fileName — Desired filename
 * @param {Object} bundle — Bundle record (for folder lookup)
 * @returns {{ fileId: string, fileUrl: string }} or { error: string }
 */
function uploadCheckImage(checkId, base64Data, mimeType, fileName, bundle) {
  try {
    var folder = getBundleFolder(bundle);
    var blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType,
      fileName
    );

    var file = folder.createFile(blob);

    // Make viewable by anyone with the link (so frontend can display it)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      fileId: file.getId(),
      fileUrl: "https://drive.google.com/file/d/" + file.getId() + "/view",
    };
  } catch (e) {
    Logger.log("Drive upload error: " + e.message);
    return { error: "Failed to upload image: " + e.message };
  }
}

/**
 * Generates a descriptive filename for a check image.
 */
function getCheckImageName(check, ext) {
  var order = String(check.order || 0).padStart(2, "0");
  if (check.deposit_date) {
    return "check_" + order + "_" + check.deposit_date + "." + ext;
  }
  return "check_" + order + "." + ext;
}

/**
 * Deletes all images for a bundle (used when deleting a bundle).
 * Trashes the entire bundle folder.
 */
function deleteBundleImages(bundle) {
  try {
    var root = getRootFolder();
    var folderName = bundle.label || ("Bundle " + bundle.id.substring(0, 8));
    var folders = root.getFoldersByName(folderName);

    if (folders.hasNext()) {
      folders.next().setTrashed(true);
    }
  } catch (e) {
    Logger.log("Drive cleanup error: " + e.message);
    // Non-fatal — don't block bundle deletion
  }
}
