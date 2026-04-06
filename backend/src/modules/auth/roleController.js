import Role from "./Role.js";
import Permission from "./Permission.js";
import { invalidateRolePermissionCache } from "../../authz/rolePermissionService.js";
import { clearPermissionCache } from "../../authz/effectivePermissionCache.js";

const normalizeRoleKey = (value) => String(value || "").trim().toUpperCase();
const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();

const invalidateAuthzCaches = () => {
  invalidateRolePermissionCache();
  clearPermissionCache();
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return Boolean(value);
};

const resolvePermissionDocs = async (permissionKeys = []) => {
  const normalizedKeys = Array.from(
    new Set(permissionKeys.map((key) => normalizePermissionKey(key)).filter(Boolean))
  );
  if (!normalizedKeys.length) {
    return [];
  }

  const permissions = await Permission.find({ key: { $in: normalizedKeys }, isActive: true })
    .select("_id key scopeType isSensitive isActive")
    .lean();

  const foundKeys = new Set(permissions.map((permission) => normalizePermissionKey(permission.key)));
  const missing = normalizedKeys.filter((key) => !foundKeys.has(key));

  if (missing.length) {
    const error = new Error(`Unknown permission keys: ${missing.join(", ")}`);
    error.code = "ROLE_PERMISSION_KEYS_INVALID";
    error.status = 400;
    throw error;
  }

  return permissions;
};

const buildRolePayload = (role) => ({
  id: String(role._id),
  key: normalizeRoleKey(role.key),
  name: role.name,
  description: role.description || "",
  scope: role.scopeType || "BRANCH",
  scopeType: role.scopeType || "BRANCH",
  isSystem: Boolean(role.isSystem),
  isActive: Boolean(role.isActive),
  metadata: role.metadata || {},
  permissions: (role.permissions || []).map(normalizePermissionKey),
});

export const listRoles = async (req, res) => {
  try {
    const includeInactive = toBoolean(req.query.includeInactive);
    const filter = includeInactive ? {} : { isActive: true };

    const roles = await Role.find(filter)
      .select("_id key name description scopeType isSystem isActive metadata permissions")
      .sort({ isSystem: -1, key: 1 })
      .lean();

    return res.json({
      success: true,
      data: { roles: roles.map(buildRolePayload) },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: "ROLE_LIST_FAILED",
      message: error.message,
    });
  }
};

export const getRole = async (req, res) => {
  try {
    const roleKey = normalizeRoleKey(req.params.key);
    const role = await Role.findOne({ key: roleKey }).lean();
    if (!role) {
      return res.status(404).json({
        success: false,
        code: "ROLE_NOT_FOUND",
        message: "Role not found",
      });
    }

    return res.json({
      success: true,
      data: {
        role: buildRolePayload(role),
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: "ROLE_LOAD_FAILED",
      message: error.message,
    });
  }
};

export const createRole = async (req, res) => {
  try {
    const { key, name, description, scope, scopeType, isActive, permissions } = req.body || {};
    const resolvedScope = String(scopeType || scope || "").trim().toUpperCase();
    if (!key || !name || !resolvedScope) {
      return res.status(400).json({
        success: false,
        code: "ROLE_PAYLOAD_INVALID",
        message: "key, name, and scope are required",
      });
    }

    const normalizedKey = normalizeRoleKey(key);
    const existing = await Role.findOne({ key: normalizedKey }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        code: "ROLE_KEY_EXISTS",
        message: "Role key already exists",
      });
    }

    await resolvePermissionDocs(permissions || []);

    const role = await Role.create({
      key: normalizedKey,
      name: String(name).trim(),
      description: String(description || "").trim(),
      scopeType: resolvedScope,
      isActive: isActive === undefined ? true : Boolean(isActive),
      isSystem: false,
      permissions: permissions || [],
      metadata: {
        source: "CUSTOM_ROLE",
      },
    });

    invalidateAuthzCaches();

    return res.status(201).json({
      success: true,
      data: {
        role: buildRolePayload(role),
      },
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      code: error.code || "ROLE_CREATE_FAILED",
      message: error.message,
    });
  }
};

export const updateRole = async (req, res) => {
  try {
    const { key, name, description, scope, scopeType, isActive, permissions } = req.body || {};
    const roleKey = normalizeRoleKey(req.params.key);
    const resolvedScope = String(scopeType || scope || "").trim().toUpperCase();

    if (!name || !resolvedScope) {
      return res.status(400).json({
        success: false,
        code: "ROLE_PAYLOAD_INVALID",
        message: "name and scope are required",
      });
    }

    if (key && normalizeRoleKey(key) !== roleKey) {
      return res.status(400).json({
        success: false,
        code: "ROLE_KEY_IMMUTABLE",
        message: "Role key cannot be changed",
      });
    }

    const role = await Role.findOne({ key: roleKey });
    if (!role) {
      return res.status(404).json({
        success: false,
        code: "ROLE_NOT_FOUND",
        message: "Role not found",
      });
    }

    await resolvePermissionDocs(permissions || []);

    role.name = String(name).trim();
    role.description = String(description || "").trim();
    role.scopeType = resolvedScope;
    role.permissions = permissions || [];
    if (isActive !== undefined) {
      role.isActive = Boolean(isActive);
    }

    await role.save();
    invalidateAuthzCaches();

    return res.json({
      success: true,
      data: {
        role: buildRolePayload(role),
      },
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      code: error.code || "ROLE_UPDATE_FAILED",
      message: error.message,
    });
  }
};

export const patchRole = async (req, res) => {
  try {
    const roleKey = normalizeRoleKey(req.params.key);
    const role = await Role.findOne({ key: roleKey });
    if (!role) {
      return res.status(404).json({
        success: false,
        code: "ROLE_NOT_FOUND",
        message: "Role not found",
      });
    }

    const payload = req.body || {};
    if (payload.key && normalizeRoleKey(payload.key) !== roleKey) {
      return res.status(400).json({
        success: false,
        code: "ROLE_KEY_IMMUTABLE",
        message: "Role key cannot be changed",
      });
    }

    if (payload.name !== undefined) {
      role.name = String(payload.name).trim();
    }
    if (payload.description !== undefined) {
      role.description = String(payload.description || "").trim();
    }
    if (payload.scope !== undefined || payload.scopeType !== undefined) {
      role.scopeType = String(payload.scopeType || payload.scope).trim().toUpperCase();
    }
    if (payload.permissions !== undefined) {
      await resolvePermissionDocs(payload.permissions || []);
      role.permissions = payload.permissions || [];
    }
    if (payload.isActive !== undefined) {
      role.isActive = Boolean(payload.isActive);
    }

    await role.save();
    invalidateAuthzCaches();

    return res.json({
      success: true,
      data: {
        role: buildRolePayload(role),
      },
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      code: error.code || "ROLE_PATCH_FAILED",
      message: error.message,
    });
  }
};
