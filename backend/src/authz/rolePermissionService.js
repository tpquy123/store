import mongoose from "mongoose";
import Role from "../modules/auth/Role.js";
import { ROLE_PERMISSIONS, SYSTEM_ROLES, TASK_ROLES } from "./actions.js";
import { getCatalogDefinitionByKey } from "./permissionCatalog.js";

const DEFAULT_TTL_MS = Number(process.env.AUTHZ_ROLE_CACHE_TTL_MS || 30_000);
const rolePermissionCache = new Map();

const now = () => Date.now();
const normalizeRoleKey = (value) => String(value || "").trim().toUpperCase();
const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();
const isMongoConnected = () => mongoose.connection?.readyState === 1;
const catalogDefinitionByKey = getCatalogDefinitionByKey();

const inferRoleScope = (roleKey) => {
  if (SYSTEM_ROLES.includes(roleKey)) return "GLOBAL";
  if (TASK_ROLES.includes(roleKey)) return "TASK";
  return "BRANCH";
};

const buildFallbackRolePermissionMap = () => {
  const roleMap = new Map();
  for (const [rawRoleKey, permissionKeys] of Object.entries(ROLE_PERMISSIONS || {})) {
    const roleKey = normalizeRoleKey(rawRoleKey);
    roleMap.set(roleKey, {
      key: roleKey,
      scope: inferRoleScope(roleKey),
      isSystem: SYSTEM_ROLES.includes(roleKey),
      isActive: true,
      permissions: (permissionKeys || []).map((permissionKey) => {
        const key = normalizePermissionKey(permissionKey);
        const definition = catalogDefinitionByKey.get(key);
        return {
          key,
          scopeType: definition?.scopeType || undefined,
          scopeId: "",
        };
      }),
    });
  }
  return roleMap;
};

const isExpired = (entry) => {
  if (!entry) return true;
  return entry.expiresAt <= now();
};

const getCachedValue = (key) => {
  const entry = rolePermissionCache.get(key);
  if (isExpired(entry)) {
    rolePermissionCache.delete(key);
    return null;
  }
  return entry.value;
};

const setCachedValue = (key, value, ttlMs = DEFAULT_TTL_MS) => {
  rolePermissionCache.set(key, {
    value,
    expiresAt: now() + Math.max(1_000, Number(ttlMs || DEFAULT_TTL_MS)),
  });
  return value;
};

const loadRolePermissions = async ({ includeInactive = false } = {}) => {
  if (!isMongoConnected()) {
    return buildFallbackRolePermissionMap();
  }

  const filter = includeInactive ? {} : { isActive: true };
  const roles = await Role.find(filter)
    .select("_id key scopeType isSystem isActive permissions")
    .lean();

  const roleMap = new Map();
  for (const role of roles) {
    const roleKey = normalizeRoleKey(role.key);
    roleMap.set(roleKey, {
      key: roleKey,
      scope: role.scopeType || "BRANCH",
      isSystem: Boolean(role.isSystem),
      isActive: Boolean(role.isActive),
      permissions: (role.permissions || []).map((permissionKey) => {
        const key = normalizePermissionKey(permissionKey);
        const definition = catalogDefinitionByKey.get(key);
        return {
          key,
          scopeType: definition?.scopeType || undefined,
          scopeId: "",
        };
      }),
    });
  }

  return roleMap;
};

export const loadRolePermissionMap = async ({ includeInactive = false } = {}) => {
  const cacheKey = includeInactive ? "roles:all" : "roles:active";
  const cached = getCachedValue(cacheKey);
  if (cached) return cached;

  const loaded = await loadRolePermissions({ includeInactive });
  return setCachedValue(cacheKey, loaded, DEFAULT_TTL_MS);
};

export const invalidateRolePermissionCache = () => {
  rolePermissionCache.clear();
};

export default {
  loadRolePermissionMap,
  invalidateRolePermissionCache,
};
