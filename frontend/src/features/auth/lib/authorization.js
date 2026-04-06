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

  const permissionSet = getPermissionSet(snapshot);
  const hasAnyPermission = (keys = []) =>
    keys.some((key) => permissionSet.has(normalizePermissionKey(key)));

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

export { normalizePermissionKey, normalizeRoleKey };
