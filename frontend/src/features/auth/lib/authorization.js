const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();
const normalizeRoleKey = (value) => String(value || "").trim().toUpperCase();

export const getAuthorizationSnapshot = ({ authz, authorization } = {}) =>
  authorization || authz || null;

export const getPermissionKeys = (snapshot) =>
  (Array.isArray(snapshot?.permissions) ? snapshot.permissions : [])
    .map(normalizePermissionKey)
    .filter(Boolean);

export const getPermissionSet = (snapshot) =>
  new Set(getPermissionKeys(snapshot));

export const getRoleKeys = ({ user, authz, authorization } = {}) => {
  const snapshot = getAuthorizationSnapshot({ authz, authorization });
  const roleKeys = Array.isArray(snapshot?.roleKeys)
    ? snapshot.roleKeys
    : Array.isArray(snapshot?.roleAssignments)
      ? snapshot.roleAssignments.map((assignment) => assignment?.roleKey)
      : [];
  const normalized = roleKeys.map(normalizeRoleKey).filter(Boolean);
  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }
  return [];
};

export const getPrimaryRoleKey = (args = {}) => getRoleKeys(args)[0] || "";

export const hasPermissionSnapshot = (snapshot, required, options = {}) => {
  const permissionSet = getPermissionSet(snapshot);
  const requiredKeys = (Array.isArray(required) ? required : required ? [required] : [])
    .map(normalizePermissionKey)
    .filter(Boolean);

  if (requiredKeys.length === 0) return true;
  if (permissionSet.has("*")) return true;

  const mode = options.mode === "all" ? "all" : "any";
  return mode === "all"
    ? requiredKeys.every((key) => permissionSet.has(key))
    : requiredKeys.some((key) => permissionSet.has(key));
};

export const isGlobalAdminAuthorization = ({ user, authz, authorization } = {}) => {
  const snapshot = getAuthorizationSnapshot({ authz, authorization });
  return Boolean(snapshot?.isGlobalAdmin || getPermissionSet(snapshot).has("*"));
};

export const resolveHomeRoute = ({ user, authz, authorization } = {}) => {
  const snapshot = getAuthorizationSnapshot({ authz, authorization });
  if (snapshot?.homeRoute) return snapshot.homeRoute;

  if (isGlobalAdminAuthorization({ user, authz, authorization })) {
    return "/admin";
  }

  const permissionSet = getPermissionSet(snapshot);
  const hasAnyPermission = (keys = []) =>
    keys.some((key) => permissionSet.has(normalizePermissionKey(key)));

  // Specific functional dashboards first
  if (hasAnyPermission(["product.create", "product.update", "product.delete", "product.read"])) {
    return "/warehouse/products";
  }
  if (
    hasAnyPermission([
      "warehouse.read",
      "warehouse.write",
      "inventory.read",
      "inventory.write",
      "transfer.read",
      "transfer.create",
      "transfer.approve",
      "transfer.ship",
      "transfer.receive",
      "order.status.manage.warehouse",
    ])
  ) {
    return "/warehouse-staff";
  }
  if (
    hasAnyPermission([
      "orders.read",
      "orders.write",
      "order.status.manage",
      "order.assign.carrier",
      "order.assign.store",
      "order.audit.read",
    ])
  ) {
    return "/order-manager/orders";
  }
  if (
    hasAnyPermission([
      "pos.payment.process",
      "pos.order.finalize",
      "pos.vat.issue",
      "pos.order.read.branch",
    ])
  ) {
    return "/CASHIER/dashboard";
  }
  if (hasAnyPermission(["pos.order.create", "pos.order.read.self", "order.status.manage.pos"])) {
    return "/pos/dashboard";
  }
  if (hasAnyPermission(["task.read", "task.update", "order.view.assigned", "order.status.manage.task"])) {
    return "/shipper/dashboard";
  }

  // Admin dashboard as fallback for admin roles
  if (
    hasAnyPermission([
      "users.manage.global",
      "users.manage.branch",
      "analytics.read.global",
      "analytics.read.branch",
      "analytics.read.assigned",
      "store.manage",
      "promotion.manage",
      "content.manage",
      "brand.manage",
      "product_type.manage",
      "order.audit.read",
    ])
  ) {
    return "/admin";
  }
  if (
    hasAnyPermission([
      "cart.manage.self",
      "account.profile.update.self",
      "account.address.manage.self",
      "order.view.self",
      "promotion.apply.self",
      "review.create.self",
    ])
  ) {
    return "/profile";
  }
  return "/";
};

// ────────────────────────────────────────────────────────────────
//  Step-up Authentication helpers
// ────────────────────────────────────────────────────────────────

/**
 * SENSITIVE_ACTIONS — Danh sách các action cần step-up (mirror của backend).
 * Cập nhật đây khi thêm action mới vào STEP_UP_REQUIRED_ACTIONS.
 */
export const SENSITIVE_ACTIONS = new Set([
  "product.delete",
  "analytics.read.global",
  "analytics.manage.global",
  "users.manage.global",
  "promotion.manage",
  "warehouse.write",
  "order.status.manage",
]);

/**
 * isActionSensitive — Kiểm tra xem action có cần step-up không (client-side check).
 * Dùng để hiện badge 🔐 trên UI mà không cần API call.
 *
 * @param {string} action - Permission key
 * @returns {boolean}
 */
export const isActionSensitive = (action) => {
  const normalized = normalizePermissionKey(action);
  return SENSITIVE_ACTIONS.has(normalized);
};

/**
 * getGracePeriodExpiry — Lấy thời điểm hết hạn grace period cho một action group.
 *
 * @param {string} actionGroup - Group key (e.g. "PRODUCT_BULK_SENSITIVE")
 * @param {object} stepUpState - stepUpState từ auth.store
 * @returns {Date|null}
 */
export const getGracePeriodExpiry = (actionGroup, stepUpState) => {
  if (!actionGroup || !stepUpState?.gracePeriods) return null;
  const expiry = stepUpState.gracePeriods[actionGroup];
  if (!expiry) return null;
  const expiryDate = new Date(expiry);
  return expiryDate > new Date() ? expiryDate : null;
};

export { normalizePermissionKey, normalizeRoleKey };
