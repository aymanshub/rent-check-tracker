/**
 * NotificationService.gs — Sends deposit date reminders via email.
 * Triggered daily by a time-driven trigger.
 */

/**
 * Main function — called by the daily trigger.
 * Finds checks due today and emails the admin.
 */
function checkAndNotify() {
  var today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  var checks = readAll(CONFIG.SHEET_NAMES.CHECKS);
  var bundles = readAll(CONFIG.SHEET_NAMES.BUNDLES);
  var users = readAll(CONFIG.SHEET_NAMES.USERS);

  // Find checks due today that haven't been deposited yet
  var dueChecks = checks.filter(function(c) {
    return c.deposit_date === today && c.status === CONFIG.STATUSES.RECEIVED;
  });

  if (dueChecks.length === 0) return; // Nothing due today

  // Get admin email
  var admin = users.find(function(u) { return u.role === CONFIG.ROLES.ADMIN; });
  if (!admin || !admin.email) {
    Logger.log("No admin email found for notification");
    return;
  }

  // Build email content
  var subject = dueChecks.length + " check" + (dueChecks.length > 1 ? "s" : "") + " due for deposit today";

  var lines = [];
  lines.push("<h2 style='color: #1a6b5a;'>Checks Due for Deposit Today</h2>");
  lines.push("<p>The following checks have a deposit date of <strong>" + formatDateHuman(today) + "</strong>:</p>");
  lines.push("<table style='border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;'>");
  lines.push("<tr style='background: #1a6b5a; color: white;'>");
  lines.push("<th style='padding: 8px 12px; text-align: left;'>Bundle</th>");
  lines.push("<th style='padding: 8px 12px; text-align: left;'>Amount</th>");
  lines.push("<th style='padding: 8px 12px; text-align: left;'>Issued To</th>");
  lines.push("<th style='padding: 8px 12px; text-align: left;'>Check #</th>");
  lines.push("<th style='padding: 8px 12px; text-align: left;'>Bank</th>");
  lines.push("</tr>");

  var totalAmount = 0;

  dueChecks.forEach(function(check, i) {
    var bundle = bundles.find(function(b) { return b.id === check.bundle_id; });
    var bundleLabel = bundle ? bundle.label : "Unknown";
    var familyName = check.issued_to === "george" ? "\u062F\u0627\u0631 \u0639\u0645\u064A \u062C\u0648\u0631\u062C" : "\u062F\u0627\u0631 \u0639\u0645\u064A \u0623\u0633\u0639\u062F";
    var bgColor = i % 2 === 0 ? "#ffffff" : "#f8f6f2";
    var amount = Number(check.amount) || 0;
    totalAmount += amount;

    lines.push("<tr style='background: " + bgColor + ";'>");
    lines.push("<td style='padding: 8px 12px;'>" + bundleLabel + "</td>");
    lines.push("<td style='padding: 8px 12px; font-weight: bold;'>\u20AA" + amount.toLocaleString() + "</td>");
    lines.push("<td style='padding: 8px 12px;'>" + familyName + "</td>");
    lines.push("<td style='padding: 8px 12px;'>" + (check.check_number || "\u2014") + "</td>");
    lines.push("<td style='padding: 8px 12px;'>" + (check.bank_branch || "\u2014") + "</td>");
    lines.push("</tr>");
  });

  lines.push("</table>");
  lines.push("<p style='margin-top: 16px; font-size: 16px;'><strong>Total due today: \u20AA" + totalAmount.toLocaleString() + "</strong></p>");

  // Add action reminder for single-mode bundles
  var singleModeChecks = dueChecks.filter(function(c) {
    var b = bundles.find(function(b2) { return b2.id === c.bundle_id; });
    return b && b.mode === "single";
  });

  if (singleModeChecks.length > 0) {
    lines.push("<p style='color: #c4993c; margin-top: 12px;'>Remember: After depositing single-name checks, withdraw the other party's share and deliver it.</p>");
  }

  lines.push("<hr style='margin-top: 24px; border: none; border-top: 1px solid #e8e2d8;'>");
  lines.push("<p style='color: #7a7a7a; font-size: 12px;'>Rent Check Tracker \u2014 Automated reminder</p>");

  var htmlBody = lines.join("\n");

  // Send email
  MailApp.sendEmail({
    to: admin.email,
    subject: subject,
    htmlBody: htmlBody,
  });

  Logger.log("Notification sent to " + admin.email + " for " + dueChecks.length + " checks");
}

/**
 * Formats YYYY-MM-DD as a human-readable date.
 */
function formatDateHuman(dateStr) {
  if (!dateStr) return "";
  var parts = dateStr.split("-");
  var months = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
  return months[parseInt(parts[1]) - 1] + " " + parseInt(parts[2]) + ", " + parts[0];
}

/**
 * Sets up the daily trigger. Run this ONCE from the script editor.
 */
function setupNotificationTrigger() {
  // Remove any existing triggers for this function (prevent duplicates)
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "checkAndNotify") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new daily trigger at 7 AM
  ScriptApp.newTrigger("checkAndNotify")
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();

  Logger.log("Daily notification trigger set for 7:00 AM");
}
