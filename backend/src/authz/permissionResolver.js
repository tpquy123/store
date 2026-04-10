import User from "../modules/auth/User.js";
import {
  buildPermissionGrantMap,
  buildPermissionSet,
  buildRolePermissionGrants,
} from "./policyEngine.js";
import { getOrLoadEffectiveContext } from "./effectivePermissionCache.js";
import {
  buildLegacyAuthzMirror,
  loadActiveUserRoleAssignments,
} from "./roleAssignmentService.js";
import { loadRolePermissionMap } from "./rolePermissionService.js";
import { normalizeUserAccess } from "./userAccessResolver.js";
import { loadActiveUserPermissionGrants } from "./userPermissionService.js";

const normalizeScopeType = (value) => String(value || "").trim().toUpperCase();
const normalizeScopeId = (value) => String(value || "").trim();
const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();
const normalizeRoleKey = (value) => String(value || "").trim().toUpperCase();

const toUniqueStrings = (items = []) =>
  Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));

const dedupePermissionGrants = (grants = []) => {
  const byKey = new Map();

  for (const grant of grants) {
    const key = normalizePermissionKey(grant?.key);
    if (!key) continue;

    const scopeType = normalizeScopeType(grant?.scopeType || "GLOBAL");
    const scopeId = normalizeScopeId(grant?.scopeId || grant?.scopeRef);
    const dedupeKey = `${key}|${scopeType}|${scopeId}`;

    byKey.set(dedupeKey, {
      ...grant,
      key,
      scopeType,
      scopeId,
    });
  }

  return Array.from(byKey.values());
};

const collectBranchScopeIdsFromAssignments = (assignments = []) =>
  toUniqueStrings(
    assignments
      .filter((assignment) => normalizeScopeType(assignment?.scopeType) === "BRANCH")
      .map((assignment) => normalizeScopeId(assignment?.scopeRef)),
  );

const collectRoleKeys = (assignments = []) =>
  toUniqueStrings(assignments.map((assignment) => normalizeRoleKey(assignment?.roleKey)));

export const resolvePermissionContext = async ({
  user,
  userId = "",
  normalizedAccess = null,
  activeBranchId = "",
} = {}) => {
  const targetUser = user || (userId ? await User.findById(userId) : null);
  if (!targetUser) {
    const error = new Error("User not found");
    error.status = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const normalized = normalizedAccess || normalizeUserAccess(targetUser);
  const normalizedUserId = normalizeScopeId(normalized.userId || targetUser?._id);
  const effectiveActiveBranchId = normalizeScopeId(
    activeBranchId || normalized.defaultBranchId,
  );
  const permissionsVersion = Number(
    normalized.permissionsVersion || targetUser?.permissionsVersion || 1,
  );

  const cacheKey = `${normalizedUserId}:${permissionsVersion}:${effectiveActiveBranchId || "_"}:effective`;

  return getOrLoadEffectiveContext(cacheKey, async () => {
    const [rolePermissionMap, roleAssignments, directPermissionGrants] = await Promise.all([
      loadRolePermissionMap(),
      loadActiveUserRoleAssignments({ userId: normalizedUserId }),
      loadActiveUserPermissionGrants({
        userId: normalizedUserId,
        permissionsVersion,
      }),
    ]);

    const roleGrants = buildRolePermissionGrants(
      {
        ...normalized,
        userId: normalizedUserId,
        activeBranchId: effectiveActiveBranchId,
        roleAssignments,
      },
      { rolePermissionMap },
    );

    const permissionGrants = dedupePermissionGrants([
      ...roleGrants,
      ...directPermissionGrants,
    ]);

    const mirror = buildLegacyAuthzMirror({
      assignments: roleAssignments,
      fallbackRole: normalized.role || targetUser?.role || "USER",
      primaryBranchId: effectiveActiveBranchId || normalized.defaultBranchId || "",
    });

    const allowedBranchIds = collectBranchScopeIdsFromAssignments(roleAssignments);
    const roleKeys = collectRoleKeys(roleAssignments);

    const authzSnapshot = {
      ...normalized,
      role: mirror.legacyRole || normalized.role,
      roles: mirror.roles?.length ? mirror.roles : Array.isArray(targetUser?.roles) ? targetUser.roles.map(String) : [],
      roleKeys,
      roleAssignments,
      systemRoles: mirror.systemRoles || normalized.systemRoles || [],
      taskRoles: mirror.taskRoles || normalized.taskRoles || [],
      branchAssignments: mirror.branchAssignments || normalized.branchAssignments || [],
      allowedBranchIds,
      defaultBranchId:
        mirror.primaryBranchId || effectiveActiveBranchId || normalized.defaultBranchId || "",
      activeBranchId: effectiveActiveBranchId,
      permissionMode: "ROLE_FALLBACK",
      permissionGrants,
      directPermissionGrants,
      rolePermissionMap,
      requiresBranchAssignment:
        Boolean(normalized.requiresBranchAssignment) || allowedBranchIds.length > 0,
    };

    authzSnapshot.permissions = buildPermissionSet(authzSnapshot);
    authzSnapshot.permissionGrantMap = buildPermissionGrantMap(permissionGrants);
    authzSnapshot.isGlobalAdmin =
      authzSnapshot.permissions.has("*") ||
      Array.isArray(authzSnapshot.systemRoles) &&
        authzSnapshot.systemRoles.includes("GLOBAL_ADMIN");

    return authzSnapshot;
  });
};

export const resolveUserPermissions = async (
  userId,
  { user = null, normalizedAccess = null, activeBranchId = "" } = {},
) => {
  const context = await resolvePermissionContext({
    user,
    userId,
    normalizedAccess,
    activeBranchId,
  });

  return context.permissions instanceof Set ? context.permissions : new Set();
};

export default {
  resolvePermissionContext,
  resolveUserPermissions,
};
