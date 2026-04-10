import { evaluatePolicy } from "./policyEngine.js";
import { resolvePermissionContext } from "./permissionResolver.js";
import User from "../modules/auth/User.js";

export const resolveEffectiveAccessContext = async ({
  user,
  normalizedAccess = null,
  activeBranchId = "",
} = {}) => {
  return resolvePermissionContext({
    user,
    normalizedAccess,
    activeBranchId,
  });
};

export const getUserPermissions = async (userId, { user = null, activeBranchId = "", resource = null } = {}) => {
  const targetUser =
    user || (userId ? await User.findById(userId) : null);
  if (!targetUser) {
    const error = new Error("User not found");
    error.status = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }
  const effective = await resolveEffectiveAccessContext({
    user: targetUser,
    activeBranchId,
  });

  return {
    userId: effective.userId,
    permissions: Array.from(effective.permissions || []).sort(),
    permissionGrants: Array.isArray(effective.permissionGrants) ? effective.permissionGrants : [],
    roleAssignments: Array.isArray(effective.roleAssignments) ? effective.roleAssignments : [],
    roleKeys: Array.isArray(effective.roleKeys) ? effective.roleKeys : [],
    activeBranchId: effective.activeBranchId || "",
    allowedBranchIds: effective.allowedBranchIds || [],
    resource,
  };
};

export const authorizePermission = ({
  authz,
  permission,
  mode = "branch",
  requireActiveBranch = false,
  resource = null,
} = {}) => {
  return evaluatePolicy({
    action: permission,
    authz,
    mode,
    requireActiveBranch,
    resource,
  });
};

export default {
  resolveEffectiveAccessContext,
  getUserPermissions,
  authorizePermission,
};
