import Permission from "./Permission.js";
import { getCatalogDefinitionByKey } from "../../authz/permissionCatalog.js";
import { invalidateRolePermissionCache } from "../../authz/rolePermissionService.js";
import { clearPermissionCache } from "../../authz/effectivePermissionCache.js";

const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();

const isSystemCatalogPermission = (permission) => {
  const metadataSource = String(permission?.metadata?.source || "").toUpperCase();
  if (metadataSource === "SYSTEM_CATALOG") return true;

  const catalog = getCatalogDefinitionByKey();
  const key = normalizePermissionKey(permission?.key);
  return catalog.has(key);
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return Boolean(value);
};

const invalidateAuthzCaches = () => {
  invalidateRolePermissionCache();
  clearPermissionCache();
};

export const listPermissions = async (req, res) => {
  try {
    const includeInactive = toBoolean(req.query.includeInactive);
    const moduleFilter = String(req.query.module || "").trim();

    const filter = {};
    if (!includeInactive) {
      filter.isActive = true;
    }
    if (moduleFilter) {
      filter.module = moduleFilter;
    }

    const permissions = await Permission.find(filter)
      .select(
        "_id key module action scopeType defaultScope resourceType description isSensitive isActive metadata"
      )
      .sort({ module: 1, key: 1 })
      .lean();

    return res.json({
      success: true,
      data: { permissions },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: "PERMISSION_LIST_FAILED",
      message: error.message,
    });
  }
};

export const getPermission = async (req, res) => {
  try {
    const permission = await Permission.findById(req.params.id).lean();
    if (!permission) {
      return res.status(404).json({
        success: false,
        code: "PERMISSION_NOT_FOUND",
        message: "Permission not found",
      });
    }

    return res.json({
      success: true,
      data: { permission },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: "PERMISSION_LOAD_FAILED",
      message: error.message,
    });
  }
};

export const createPermission = async (req, res) => {
  try {
    const {
      key,
      module,
      action,
      scopeType,
      defaultScope,
      resourceType,
      description,
      isSensitive,
    } = req.body || {};
    if (!key || !module || !action || !scopeType) {
      return res.status(400).json({
        success: false,
        code: "PERMISSION_PAYLOAD_INVALID",
        message: "key, module, action, and scopeType are required",
      });
    }

    const normalizedKey = normalizePermissionKey(key);
    const existing = await Permission.findOne({ key: normalizedKey }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        code: "PERMISSION_KEY_EXISTS",
        message: "Permission key already exists",
      });
    }

    const permission = await Permission.create({
      key: normalizedKey,
      module: String(module).trim(),
      action: String(action).trim(),
      scopeType: String(scopeType).trim().toUpperCase(),
      defaultScope: String(defaultScope || scopeType).trim().toUpperCase(),
      resourceType: String(resourceType || module).trim(),
      description: String(description || "").trim(),
      isSensitive: Boolean(isSensitive),
      isActive: true,
      metadata: {
        source: "CUSTOM",
      },
    });

    invalidateAuthzCaches();

    return res.status(201).json({
      success: true,
      data: { permission },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: "PERMISSION_CREATE_FAILED",
      message: error.message,
    });
  }
};

export const updatePermission = async (req, res) => {
  try {
    const {
      key,
      module,
      action,
      scopeType,
      defaultScope,
      resourceType,
      description,
      isSensitive,
      isActive,
    } = req.body || {};
    if (!key || !module || !action || !scopeType) {
      return res.status(400).json({
        success: false,
        code: "PERMISSION_PAYLOAD_INVALID",
        message: "key, module, action, and scopeType are required",
      });
    }

    const permission = await Permission.findById(req.params.id);
    if (!permission) {
      return res.status(404).json({
        success: false,
        code: "PERMISSION_NOT_FOUND",
        message: "Permission not found",
      });
    }

    if (isSystemCatalogPermission(permission)) {
      return res.status(403).json({
        success: false,
        code: "PERMISSION_SYSTEM_LOCKED",
        message: "System catalog permissions cannot be edited",
      });
    }

    permission.key = normalizePermissionKey(key);
    permission.module = String(module).trim();
    permission.action = String(action).trim();
    permission.scopeType = String(scopeType).trim().toUpperCase();
    permission.defaultScope = String(defaultScope || scopeType).trim().toUpperCase();
    permission.resourceType = String(resourceType || module).trim();
    permission.description = String(description || "").trim();
    permission.isSensitive = Boolean(isSensitive);
    permission.isActive = typeof isActive === "boolean" ? isActive : permission.isActive;

    await permission.save();
    invalidateAuthzCaches();

    return res.json({
      success: true,
      data: { permission },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: "PERMISSION_UPDATE_FAILED",
      message: error.message,
    });
  }
};

export const patchPermission = async (req, res) => {
  try {
    const permission = await Permission.findById(req.params.id);
    if (!permission) {
      return res.status(404).json({
        success: false,
        code: "PERMISSION_NOT_FOUND",
        message: "Permission not found",
      });
    }

    if (isSystemCatalogPermission(permission)) {
      return res.status(403).json({
        success: false,
        code: "PERMISSION_SYSTEM_LOCKED",
        message: "System catalog permissions cannot be edited",
      });
    }

    const payload = req.body || {};
    if (payload.key !== undefined) {
      permission.key = normalizePermissionKey(payload.key);
    }
    if (payload.module !== undefined) {
      permission.module = String(payload.module).trim();
    }
    if (payload.action !== undefined) {
      permission.action = String(payload.action).trim();
    }
    if (payload.scopeType !== undefined) {
      permission.scopeType = String(payload.scopeType).trim().toUpperCase();
    }
    if (payload.defaultScope !== undefined) {
      permission.defaultScope = String(payload.defaultScope).trim().toUpperCase();
    }
    if (payload.resourceType !== undefined) {
      permission.resourceType = String(payload.resourceType || "").trim();
    }
    if (payload.description !== undefined) {
      permission.description = String(payload.description || "").trim();
    }
    if (payload.isSensitive !== undefined) {
      permission.isSensitive = Boolean(payload.isSensitive);
    }
    if (payload.isActive !== undefined) {
      permission.isActive = Boolean(payload.isActive);
    }

    await permission.save();
    invalidateAuthzCaches();

    return res.json({
      success: true,
      data: { permission },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: "PERMISSION_PATCH_FAILED",
      message: error.message,
    });
  }
};
