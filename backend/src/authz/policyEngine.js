import { ROLE_PERMISSIONS } from "./actions.js";

const DENY = (code, message) => ({
  allowed: false,
  code,
  message,
});

const ALLOW = () => ({ allowed: true, code: "AUTHZ_ALLOWED" });

const normalizeRoleKey = (value) => String(value || "").trim().toUpperCase();
const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();
const normalizeScopeType = (value) => String(value || "").trim().toUpperCase();
const normalizeScopeId = (value) => String(value || "").trim();
const normalizeOperator = (value) => String(value || "").trim().toLowerCase();

const resolveRolePermissions = (role, rolePermissionMap = null) => {
  const normalizedRole = normalizeRoleKey(role);
  const mapped = rolePermissionMap?.get(normalizedRole);
  const mappedPermissions = Array.isArray(mapped?.permissions) ? mapped.permissions : [];

  if (mappedPermissions.length === 0) {
    return ROLE_PERMISSIONS[normalizedRole] || [];
  }

  if (
    normalizedRole === "GLOBAL_ADMIN" &&
    Array.isArray(ROLE_PERMISSIONS.GLOBAL_ADMIN) &&
    ROLE_PERMISSIONS.GLOBAL_ADMIN.includes("*") &&
    !mappedPermissions.some((permission) => normalizePermissionKey(permission?.key) === "*")
  ) {
    return [
      ...mappedPermissions,
      {
        key: "*",
        scopeType: "GLOBAL",
        scopeId: "",
      },
    ];
  }

  return mappedPermissions;
};

const inferScopeTypeFromPermission = (permission) => {
  const key = normalizePermissionKey(permission);
  if (key === "*") return "GLOBAL";
  if (key.endsWith(".global")) return "GLOBAL";
  if (key.endsWith(".personal")) return "SELF";
  if (key.endsWith(".self")) return "SELF";
  if (key.startsWith("task.")) return "SELF";
  return "BRANCH";
};

const createGrant = ({
  key,
  scopeType,
  scopeId = "",
  sourceType = "ROLE",
  source = "",
  isSensitive = false,
} = {}) => {
  const normalizedKey = normalizePermissionKey(key);
  if (!normalizedKey) return null;

  const normalizedScopeType = normalizeScopeType(scopeType || inferScopeTypeFromPermission(normalizedKey));
  const normalizedScopeId = normalizeScopeId(scopeId);

  return {
    key: normalizedKey,
    scopeType: normalizedScopeType,
    scopeId: normalizedScopeType === "GLOBAL" ? "" : normalizedScopeId,
    sourceType,
    source,
    isSensitive: Boolean(isSensitive),
  };
};

const dedupeGrants = (grants = []) => {
  const byKey = new Map();
  for (const grant of grants) {
    const normalized = createGrant(grant);
    if (!normalized?.key) continue;
    const dedupeKey = `${normalized.key}|${normalized.scopeType}|${normalized.scopeId}`;
    byKey.set(dedupeKey, normalized);
  }
  return Array.from(byKey.values());
};

const resolveResourceValue = (resource = {}, authz = {}, field = "") => {
  const normalizedField = String(field || "").trim();
  if (!normalizedField) return undefined;

  const segments = normalizedField.split(".").filter(Boolean);
  const roots = {
    resource,
    authz,
    user: {
      id: authz?.userId,
      branchId: authz?.activeBranchId,
    },
  };

  const [root, ...path] = segments;
  let current = Object.prototype.hasOwnProperty.call(roots, root)
    ? roots[root]
    : resource?.[root];

  for (const segment of path) {
    if (current == null) return undefined;
    current = current[segment];
  }

  return current;
};

const compareCondition = ({ actual, operator, expected }) => {
  const normalizedOperator = normalizeOperator(operator || "eq");

  switch (normalizedOperator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "includes":
      return Array.isArray(actual) && actual.includes(expected);
    default:
      return false;
  }
};

const evaluateGrantConditions = ({ grant, resource = {}, authz = {} } = {}) => {
  const conditions = Array.isArray(grant?.conditions) ? grant.conditions : [];
  if (!conditions.length) return true;

  return conditions.every((condition) =>
    compareCondition({
      actual: resolveResourceValue(resource, authz, condition?.field),
      operator: condition?.operator,
      expected: condition?.value,
    })
  );
};

export const buildPermissionGrantMap = (grants = []) => {
  const map = new Map();
  for (const grant of dedupeGrants(grants)) {
    if (!map.has(grant.key)) {
      map.set(grant.key, []);
    }
    map.get(grant.key).push(grant);
  }
  return map;
};

export const buildRolePermissionGrants = (authz = {}, { rolePermissionMap = null } = {}) => {
  const grants = [];
  const activeBranchId = normalizeScopeId(authz?.activeBranchId);
  const userId = normalizeScopeId(authz?.userId);
  const roleAssignments = Array.isArray(authz?.roleAssignments) ? authz.roleAssignments : [];

  const appendRoleGrants = ({
    roleKey,
    assignmentScopeType = "",
    assignmentScopeId = "",
    sourceType = "ROLE_ASSIGNMENT",
  } = {}) => {
    for (const permission of resolveRolePermissions(roleKey, rolePermissionMap)) {
      const key = typeof permission === "string" ? permission : permission?.key;
      const inferredScopeType =
        typeof permission === "string"
          ? inferScopeTypeFromPermission(key)
          : normalizeScopeType(permission?.scopeType || inferScopeTypeFromPermission(key));
      const normalizedAssignmentScopeType = normalizeScopeType(assignmentScopeType);
      const normalizedAssignmentScopeId = normalizeScopeId(assignmentScopeId);
      const explicitScopeId = normalizeScopeId(permission?.scopeId);
      let scopeId = explicitScopeId;

      if (!scopeId) {
        if (inferredScopeType === "BRANCH" && normalizedAssignmentScopeType === "BRANCH") {
          scopeId = normalizedAssignmentScopeId;
        } else if (
          (inferredScopeType === "SELF" || inferredScopeType === "TASK") &&
          (normalizedAssignmentScopeType === "SELF" || normalizedAssignmentScopeType === "TASK")
        ) {
          scopeId = normalizedAssignmentScopeId || userId;
        } else if (inferredScopeType === "RESOURCE" && normalizedAssignmentScopeType === "RESOURCE") {
          scopeId = normalizedAssignmentScopeId;
        } else if (inferredScopeType === "SELF" || inferredScopeType === "TASK") {
          scopeId = userId;
        }
      }

      grants.push(
        createGrant({
          key,
          scopeType: key === "*" ? "GLOBAL" : inferredScopeType,
          scopeId,
          sourceType,
          source: roleKey,
        })
      );
    }
  };

  if (roleAssignments.length > 0) {
    for (const assignment of roleAssignments) {
      appendRoleGrants({
        roleKey: assignment?.roleKey || assignment?.role?.key,
        assignmentScopeType: assignment?.scopeType,
        assignmentScopeId: assignment?.scopeRef || assignment?.scopeId,
        sourceType: "ROLE_ASSIGNMENT",
      });
    }

    return dedupeGrants(grants);
  }

  for (const role of authz?.systemRoles || []) {
    appendRoleGrants({
      roleKey: role,
      assignmentScopeType: "GLOBAL",
      sourceType: "SYSTEM",
    });
  }

  for (const role of authz?.taskRoles || []) {
    appendRoleGrants({
      roleKey: role,
      assignmentScopeType: "TASK",
      assignmentScopeId: userId,
      sourceType: "TASK",
    });
  }

  if (activeBranchId) {
    const activeAssignment = (authz?.branchAssignments || []).find(
      (assignment) => normalizeScopeId(assignment?.storeId) === activeBranchId
    );
    if (activeAssignment) {
      for (const role of activeAssignment.roles || []) {
        appendRoleGrants({
          roleKey: role,
          assignmentScopeType: "BRANCH",
          assignmentScopeId: activeBranchId,
          sourceType: "BRANCH_ROLE",
        });
      }
    }
  }

  return dedupeGrants(grants);
};

export const buildPermissionSet = (authz) => {
  const permissions = new Set();
  const activeBranchId = normalizeScopeId(authz?.activeBranchId);
  const userId = normalizeScopeId(authz?.userId);
  const explicitMode = String(authz?.permissionMode || "").trim().toUpperCase() === "EXPLICIT";
  const rolePermissionMap = authz?.rolePermissionMap instanceof Map ? authz.rolePermissionMap : null;

  const grants =
    Array.isArray(authz?.permissionGrants)
      ? explicitMode || authz.permissionGrants.length > 0
        ? dedupeGrants(authz.permissionGrants)
        : buildRolePermissionGrants(authz)
      : buildRolePermissionGrants(authz, { rolePermissionMap });

  for (const grant of grants) {
    if (!grant) continue;
    if (grant.key === "*") {
      permissions.add("*");
      continue;
    }

    if (grant.scopeType === "GLOBAL") {
      permissions.add(grant.key);
      continue;
    }

    if (grant.scopeType === "BRANCH") {
      if (!grant.scopeId || (activeBranchId && grant.scopeId === activeBranchId)) {
        permissions.add(grant.key);
      }
      continue;
    }

    if (grant.scopeType === "SELF") {
      if (!grant.scopeId || (userId && grant.scopeId === userId)) {
        permissions.add(grant.key);
      }
      continue;
    }

    if (grant.scopeType === "TASK") {
      if (!grant.scopeId || (userId && grant.scopeId === userId)) {
        permissions.add(grant.key);
      }
      continue;
    }

    if (grant.scopeType === "RESOURCE") {
      if (!grant.scopeId) {
        permissions.add(grant.key);
      }
    }
  }

  return permissions;
};

export const hasPermission = (authz, action, { mode = "branch", resource = null } = {}) => {
  if (!action) return false;
  const normalizedAction = normalizePermissionKey(action);
  const permissions = authz?.permissions;

  if (!(permissions instanceof Set)) {
    return false;
  }

  if (!permissions.has("*") && !permissions.has(normalizedAction)) {
    return false;
  }

  const permissionGrantMap =
    authz?.permissionGrantMap instanceof Map
      ? authz.permissionGrantMap
      : Array.isArray(authz?.permissionGrants)
        ? buildPermissionGrantMap(authz.permissionGrants)
        : null;

  if (!permissionGrantMap) {
    return true;
  }

  const grants = permissionGrantMap.get(normalizedAction) || [];
  if (!grants.length) {
    return true;
  }

  const targetBranchId = normalizeScopeId(resource?.branchId || authz?.activeBranchId);
  const targetAssigneeId = normalizeScopeId(
    resource?.assigneeId || resource?.userId || authz?.userId
  );
  const targetResourceId = normalizeScopeId(
    resource?.resourceId || resource?._id || resource?.id
  );

  for (const rawGrant of grants) {
    const grant = createGrant(rawGrant);
    if (!grant) continue;

    if (grant.key === "*") {
      if (evaluateGrantConditions({ grant: rawGrant, resource, authz })) return true;
    }

    if (grant.scopeType === "GLOBAL") {
      if (evaluateGrantConditions({ grant: rawGrant, resource, authz })) return true;
    }

    if (grant.scopeType === "BRANCH") {
      if (!grant.scopeId) {
        if (evaluateGrantConditions({ grant: rawGrant, resource, authz })) return true;
      }
      if (targetBranchId && grant.scopeId === targetBranchId) {
        if (evaluateGrantConditions({ grant: rawGrant, resource, authz })) return true;
      }
    }

    if (grant.scopeType === "SELF") {
      if (!grant.scopeId) {
        if (evaluateGrantConditions({ grant: rawGrant, resource, authz })) return true;
      }
      if (targetAssigneeId && grant.scopeId === targetAssigneeId) {
        if (evaluateGrantConditions({ grant: rawGrant, resource, authz })) return true;
      }
    }

    if (grant.scopeType === "TASK") {
      if (!grant.scopeId) {
        if (evaluateGrantConditions({ grant: rawGrant, resource, authz })) return true;
      }
      if (targetAssigneeId && grant.scopeId === targetAssigneeId) {
        if (evaluateGrantConditions({ grant: rawGrant, resource, authz })) return true;
      }
    }

    if (grant.scopeType === "RESOURCE") {
      if (!grant.scopeId || (targetResourceId && grant.scopeId === targetResourceId)) {
        if (evaluateGrantConditions({ grant: rawGrant, resource, authz })) return true;
      }
    }
  }

  if (mode === "global") {
    return false;
  }

  return false;
};

export const evaluatePolicy = ({
  action,
  authz,
  mode = "branch",
  requireActiveBranch = false,
  resource = null,
} = {}) => {
  if (!authz) {
    return DENY("AUTHZ_CONTEXT_MISSING", "Authorization context is required");
  }

  if (!action) {
    return DENY("AUTHZ_ACTION_MISSING", "Action is required");
  }

  if (!hasPermission(authz, action, { mode, resource })) {
    return DENY("AUTHZ_ACTION_DENIED", "Action is not granted");
  }

  const isGlobalAdmin = Boolean(authz.isGlobalAdmin || authz.systemRoles?.includes("GLOBAL_ADMIN"));
  const activeBranchId = authz.activeBranchId ? String(authz.activeBranchId) : "";
  const allowedBranchIds = Array.isArray(authz.allowedBranchIds)
    ? authz.allowedBranchIds.map((id) => String(id))
    : [];

  if (mode === "global" && !isGlobalAdmin) {
    return DENY("AUTHZ_GLOBAL_SCOPE_DENIED", "Global scope is not allowed");
  }

  if (requireActiveBranch && mode === "branch" && !activeBranchId && !isGlobalAdmin) {
    return DENY("AUTHZ_ACTIVE_BRANCH_REQUIRED", "Active branch context is required");
  }

  if (mode === "assigned" && !isGlobalAdmin && allowedBranchIds.length === 0) {
    return DENY("AUTHZ_NO_BRANCH_ASSIGNED", "No branch assignment is available");
  }

  if (!resource) {
    return ALLOW();
  }

  const resourceBranchId = resource.branchId ? String(resource.branchId) : "";
  if (resourceBranchId && !isGlobalAdmin) {
    if (mode === "assigned") {
      if (!allowedBranchIds.includes(resourceBranchId)) {
        return DENY("AUTHZ_BRANCH_FORBIDDEN", "Resource branch is outside assigned branches");
      }
    } else if (mode === "branch") {
      if (!activeBranchId || activeBranchId !== resourceBranchId) {
        return DENY("AUTHZ_BRANCH_FORBIDDEN", "Resource branch is outside active branch");
      }
    }
  }

  const resourceAssigneeId = resource.assigneeId ? String(resource.assigneeId) : "";
  if (resourceAssigneeId && !isGlobalAdmin && authz.taskRoles?.includes("SHIPPER")) {
    if (String(authz.userId) !== resourceAssigneeId) {
      return DENY("AUTHZ_TASK_NOT_ASSIGNED", "Task is not assigned to current actor");
    }
  }

  return ALLOW();
};
