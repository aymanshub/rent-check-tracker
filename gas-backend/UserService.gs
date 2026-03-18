/**
 * UserService.gs — User management (admin only).
 */

function getUsers() {
  return { users: readAll(CONFIG.SHEET_NAMES.USERS) };
}

function addUser(data) {
  if (!data.email || !data.name || !data.family) {
    return { error: "email, name, and family are required" };
  }

  // Check for duplicate email
  var existing = readAll(CONFIG.SHEET_NAMES.USERS);
  if (existing.find(function(u) { return u.email.toLowerCase() === data.email.toLowerCase(); })) {
    return { error: "User with this email already exists" };
  }

  var user = {
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

  var user = findById(CONFIG.SHEET_NAMES.USERS, userId);
  if (!user) return { error: "User not found" };

  // Don't allow removing the last admin
  var admins = readAll(CONFIG.SHEET_NAMES.USERS).filter(function(u) {
    return u.role === CONFIG.ROLES.ADMIN;
  });
  if (user.role === CONFIG.ROLES.ADMIN && admins.length <= 1) {
    return { error: "Cannot remove the last admin" };
  }

  deleteById(CONFIG.SHEET_NAMES.USERS, userId);
  return { success: true };
}
