import { evaluatePolicy } from "../../authz/policyEngine.js";
import { logAuthzDecision } from "../../authz/auditLogger.js";

const resolveValue = (valueOrResolver, req, fallback) => {
  if (typeof valueOrResolver === "function") {
    return valueOrResolver(req);
  }
  if (valueOrResolver === undefined || valueOrResolver === null) {
    return fallback;
  }
  return valueOrResolver;
};

const resolveRequiredPermissions = (actionOrResolver, options, req) => {
  const explicitAnyOf = resolveValue(options.anyOf, req, []);
  const explicitAllOf = resolveValue(options.allOf, req, []);
  const action = resolveValue(actionOrResolver, req, "");

  const anyOf = Array.isArray(explicitAnyOf) ? explicitAnyOf.filter(Boolean) : [];
  const allOf = Array.isArray(explicitAllOf) ? explicitAllOf.filter(Boolean) : [];

  if (allOf.length > 0) {
    return { mode: "all", permissions: allOf };
  }
  if (anyOf.length > 0) {
    return { mode: "any", permissions: anyOf };
  }
  return { mode: "all", permissions: action ? [action] : [] };
};

const defaultMessageByCode = Object.freeze({
  AUTHZ_ACTION_DENIED: "You do not have permission to perform this action",
  AUTHZ_GLOBAL_SCOPE_DENIED: "Global scope is not allowed for this account",
  AUTHZ_ACTIVE_BRANCH_REQUIRED: "Active branch context is required",
  AUTHZ_NO_BRANCH_ASSIGNED: "No branch is assigned to this account",
  AUTHZ_BRANCH_FORBIDDEN: "You cannot access data outside your branch scope",
  AUTHZ_TASK_NOT_ASSIGNED: "This task is not assigned to the current actor",
});

export const authorize = (actionOrResolver, options = {}) => async (req, res, next) => {
  if (!req.authz) {
    return res.status(401).json({
      success: false,
      code: "AUTHZ_CONTEXT_MISSING",
      message: "Authorization context is missing",
    });
  }

  const { mode: permissionMode, permissions: requiredPermissions } =
    resolveRequiredPermissions(actionOrResolver, options, req);
  const scopeMode = resolveValue(options.scopeMode, req, "branch");
  const requireActiveBranch = Boolean(
    options.requireActiveBranch ||
      (Array.isArray(options.requireActiveBranchFor) &&
        options.requireActiveBranchFor.includes(scopeMode))
  );
  const resource = resolveValue(options.resource, req, null);
  const decisions = requiredPermissions.map((permission) => ({
    permission,
    decision: evaluatePolicy({
      action: permission,
      authz: req.authz,
      mode: scopeMode,
      requireActiveBranch,
      resource,
    }),
  }));
  const matchedDecision =
    permissionMode === "any"
      ? decisions.find((entry) => entry.decision.allowed)
      : decisions.find((entry) => !entry.decision.allowed);
  const decision =
    permissionMode === "any"
      ? matchedDecision?.decision || decisions[0]?.decision || { allowed: true, code: "AUTHZ_ALLOWED" }
      : matchedDecision?.decision || decisions[0]?.decision || { allowed: true, code: "AUTHZ_ALLOWED" };
  const allowed =
    requiredPermissions.length === 0
      ? true
      : permissionMode === "any"
        ? decisions.some((entry) => entry.decision.allowed)
        : decisions.every((entry) => entry.decision.allowed);

  const resolvedConditions = resolveValue(options.conditionsResolver, req, null);
  const conditionOutcome =
    typeof resolvedConditions === "function" ? resolvedConditions(req) : resolvedConditions;
  const conditionDenied =
    conditionOutcome &&
    ((typeof conditionOutcome === "object" && conditionOutcome.allowed === false) ||
      conditionOutcome === false);

  if (!allowed || conditionDenied) {
    const denyDecision = conditionDenied
      ? {
          allowed: false,
          code: conditionOutcome.code || "AUTHZ_CONDITION_DENIED",
          message: conditionOutcome.message || "Additional authorization conditions failed",
        }
      : decision;
    await logAuthzDecision({
      req,
      action: requiredPermissions.join(" || "),
      decision: "DENY",
      reasonCode: denyDecision.code,
      scopeMode,
      resourceType: options.resourceType || "",
      resourceId: resource?.id || resource?._id || resource?.resourceId || "",
      metadata: {
        message: denyDecision.message,
      },
    });

    return res.status(403).json({
      success: false,
      code: denyDecision.code,
      message: defaultMessageByCode[denyDecision.code] || denyDecision.message,
    });
  }

  req.authz = {
    ...req.authz,
    authorizedAction: matchedDecision?.permission || requiredPermissions[0] || "",
    authorizedActions: requiredPermissions,
    scopeMode,
    authorizedResource: resource || null,
  };

  if (options.audit !== false) {
    await logAuthzDecision({
      req,
      action: requiredPermissions.join(permissionMode === "any" ? " || " : " && "),
      decision: "ALLOW",
      reasonCode: decision.code,
      scopeMode,
      resourceType: options.resourceType || "",
      resourceId: resource?.id || resource?._id || resource?.resourceId || "",
    });
  }

  return next();
};

export default authorize;
