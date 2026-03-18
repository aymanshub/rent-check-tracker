# PRD Addendum: Deposit Date Email Notifications
## Applies to: All PRD documents

---

## Overview

On the morning of a check's deposit date, the admin receives an email reminder to deposit the check. This runs as a daily time-driven trigger in Google Apps Script — zero cost, zero external services.

---

## 1. How It Works

```
Every day at 7:00 AM (admin's timezone):
  GAS trigger fires → checkAndNotify()
    → Reads all checks from sheet
    → Finds checks where:
        deposit_date == today
        AND status == "received" (not yet deposited)
    → Sends ONE summary email to admin with all due checks
```

**Key decisions:**
- Only the **admin** receives notifications (as requested)
- Only checks in **"received" status** are notified — already deposited/handed checks are skipped
- **One email per day** with all due checks — not one email per check (avoids spam)
- Runs at **7:00 AM** in the admin's timezone
- If no checks are due today, no email is sent

---

## 2. Google Apps Script — NotificationService.gs

```javascript
/**
 * NotificationService — sends deposit date reminders via email.
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
  var subject = "🏠 " + dueChecks.length + " check" + (dueChecks.length > 1 ? "s" : "") + " due for deposit today";
  
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
    var familyName = check.issued_to === "george" ? "دار عمي جورج" : "دار عمي أسعد";
    var bgColor = i % 2 === 0 ? "#ffffff" : "#f8f6f2";
    var amount = Number(check.amount) || 0;
    totalAmount += amount;
    
    lines.push("<tr style='background: " + bgColor + ";'>");
    lines.push("<td style='padding: 8px 12px;'>" + bundleLabel + "</td>");
    lines.push("<td style='padding: 8px 12px; font-weight: bold;'>₪" + amount.toLocaleString() + "</td>");
    lines.push("<td style='padding: 8px 12px;'>" + familyName + "</td>");
    lines.push("<td style='padding: 8px 12px;'>" + (check.check_number || "—") + "</td>");
    lines.push("<td style='padding: 8px 12px;'>" + (check.bank_branch || "—") + "</td>");
    lines.push("</tr>");
  });
  
  lines.push("</table>");
  lines.push("<p style='margin-top: 16px; font-size: 16px;'><strong>Total due today: ₪" + totalAmount.toLocaleString() + "</strong></p>");
  
  // Add action reminder for single-mode bundles
  var singleModeChecks = dueChecks.filter(function(c) {
    var b = bundles.find(function(b) { return b.id === c.bundle_id; });
    return b && b.mode === "single";
  });
  
  if (singleModeChecks.length > 0) {
    lines.push("<p style='color: #c4993c; margin-top: 12px;'>⚠ Remember: After depositing single-name checks, withdraw the other party's share and deliver it.</p>");
  }
  
  lines.push("<hr style='margin-top: 24px; border: none; border-top: 1px solid #e8e2d8;'>");
  lines.push("<p style='color: #7a7a7a; font-size: 12px;'>Rent Check Tracker — Automated reminder</p>");
  
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
 * Creates a time-driven trigger that runs checkAndNotify() every day at 7 AM.
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
```

---

## 3. Setup

Add one step to the setup instructions:

#### F. Enable Deposit Notifications
1. In the Apps Script editor, open NotificationService.gs
2. Run `setupNotificationTrigger()` (Run → setupNotificationTrigger)
3. Authorize when prompted (it will ask for Gmail send permission — this is expected)
4. Done — the trigger runs automatically every day at 7 AM

The trigger persists forever. No maintenance needed.

---

## 4. Email Example

The admin receives something like this at 7 AM:

```
Subject: 🏠 2 checks due for deposit today

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Checks Due for Deposit Today

  The following checks have a deposit date of March 15, 2025:

  ┌──────────────────┬─────────┬──────────────┬─────────┬─────────────┐
  │ Bundle           │ Amount  │ Issued To    │ Check # │ Bank        │
  ├──────────────────┼─────────┼──────────────┼─────────┼─────────────┤
  │ 2025 Church Rent │ ₪3,500  │ دار عمي جورج │ 1234567 │ Hapoalim 42 │
  │ 2025 Church Rent │ ₪3,000  │ دار عمي أسعد │ 1234568 │ Hapoalim 42 │
  └──────────────────┴─────────┴──────────────┴─────────┴─────────────┘

  Total due today: ₪6,500

  ⚠ Remember: After depositing single-name checks,
    withdraw the other party's share and deliver it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Rent Check Tracker — Automated reminder
```

---

## 5. Edge Cases

1. **No checks due today**: No email sent. Silent.
2. **Check already deposited**: Skipped — only `status === "received"` checks are included.
3. **No deposit_date on check**: Skipped — can't notify without a date.
4. **Admin email missing**: Logged as error, no crash.
5. **GAS email quota**: Free accounts get 100 emails/day. Sending 1 per day uses 1. No concern.
6. **Timezone**: The trigger runs in the script owner's Google account timezone. Set correctly in Apps Script: Project Settings → Timezone.
7. **Multiple admins**: Current implementation emails the first admin found. If needed later, can email all admins by filtering `role === "admin"`.

---

## 6. Future: PWA Push Notifications (Phase 2)

When ready to add push notifications alongside email, the approach would be:

1. Generate VAPID keys (one-time setup)
2. Frontend: request notification permission + subscribe to push
3. Store push subscription in a new `subscriptions` sheet tab
4. GAS: use `UrlFetchApp` to call the web push endpoint with VAPID signing
5. Alternatively: use a free push service like ntfy.sh (simpler — just a POST request from GAS)

This is explicitly deferred to a future version. The email notification covers the need for V1.

---

## 7. Implementation Order

Add to Phase 1 (GAS Backend):
```
After all other GAS files:
  → Create NotificationService.gs
  → Run setupNotificationTrigger() once from editor
  → Test by temporarily changing atHour(7) to current hour, or call checkAndNotify() manually
```

No frontend changes needed — this is entirely server-side.
