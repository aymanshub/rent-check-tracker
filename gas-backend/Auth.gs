/**
 * Auth.gs — Verifies Google id_tokens and maps to user records.
 *
 * Strategy:
 * 1. Frontend uses Google Identity Services to get an id_token (JWT).
 * 2. Frontend sends id_token with every request.
 * 3. GAS verifies the token via Google's tokeninfo endpoint.
 * 4. GAS checks the email against the users sheet.
 */

/**
 * Verifies a Google id_token and returns the user record if authorized.
 * Returns null if invalid or user not in the users sheet.
 */
function authenticateRequest(idToken) {
  if (!idToken) return null;

  try {
    // Verify token with Google
    var response = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken
    );
    var payload = JSON.parse(response.getContentText());

    if (!payload.email) return null;

    // Check if user exists in our users sheet
    var users = readAll(CONFIG.SHEET_NAMES.USERS);
    var user = users.find(function(u) {
      return u.email.toLowerCase() === payload.email.toLowerCase();
    });

    return user || null;
  } catch (e) {
    Logger.log("Auth error: " + e.message);
    return null;
  }
}
