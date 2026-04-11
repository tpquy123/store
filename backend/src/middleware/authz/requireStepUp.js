import { validateStepUpToken, isInGracePeriod } from "../../authz/stepUpService.js";
import { STEP_UP_REQUIRED_ACTIONS, getActionGroup } from "../../authz/actions.js";

/**
 * requireStepUp — Middleware kiểm tra step-up authentication.
 *
 * Xử lý theo thứ tự ưu tiên:
 * 1. Nếu action không cần step-up → next() ngay
 * 2. Nếu user là GLOBAL_ADMIN → next() (bypass step-up)
 * 3. Kiểm tra grace period → nếu còn valid → next()
 * 4. Kiểm tra X-Step-Up-Token header
 *    - Không có → 403 STEP_UP_REQUIRED (với sessionToken hint)
 *    - Có → validate → nếu valid → next()
 *    - Invalid/expired → 401 STEP_UP_TOKEN_INVALID
 *
 * @param {string|Function} actionOrResolver - Permission key hoặc function(req) → string
 * @param {object} [options]
 * @param {string} [options.actionGroup] - Override group key thay vì tự lookup
 * @param {boolean} [options.skipForGlobalAdmin=true] - Có bỏ qua cho GLOBAL_ADMIN không
 * @returns {Function} Express middleware
 */
export const requireStepUp = (actionOrResolver, options = {}) => {
  const { actionGroup: overrideGroup, skipForGlobalAdmin = true } = options;

  return async (req, res, next) => {
    try {
      // Resolve action key
      const action =
        typeof actionOrResolver === "function"
          ? actionOrResolver(req)
          : actionOrResolver;

      const normalizedAction = String(action || "").toLowerCase().trim();

      // 1. Không cần step-up cho action này → bypass
      if (!STEP_UP_REQUIRED_ACTIONS[normalizedAction]) {
        return next();
      }

      // 2. GLOBAL_ADMIN bypass (nếu option cho phép)
      if (skipForGlobalAdmin && req.authz?.isGlobalAdmin) {
        return next();
      }

      const userId = String(req.user?._id || "");
      const targetActionGroup =
        overrideGroup || getActionGroup(normalizedAction) || "";

      // 3. Kiểm tra grace period
      if (targetActionGroup) {
        const { inGracePeriod, expiresAt } = await isInGracePeriod({
          userId,
          actionGroup: targetActionGroup,
        });

        if (inGracePeriod) {
          req.stepUpGracePeriod = { active: true, expiresAt, actionGroup: targetActionGroup };
          return next();
        }
      }

      // 4. Kiểm tra X-Step-Up-Token header
      const stepUpTokenHeader = req.headers?.["x-step-up-token"];

      if (!stepUpTokenHeader) {
        // Không có token → trả về 403 yêu cầu step-up
        return res.status(403).json({
          success: false,
          code: "STEP_UP_REQUIRED",
          message: "This action requires additional verification (step-up)",
          data: {
            action: normalizedAction,
            actionGroup: targetActionGroup,
          },
        });
      }

      // Validate step-up token
      const validation = await validateStepUpToken(stepUpTokenHeader, normalizedAction);

      if (!validation.valid) {
        return res.status(401).json({
          success: false,
          code: "STEP_UP_TOKEN_INVALID",
          message: validation.reason || "Step-up token is invalid or expired",
        });
      }

      // Token hợp lệ — attach context và continue
      req.stepUpContext = {
        userId: validation.userId,
        action: validation.action,
        actionGroup: validation.actionGroup,
        verified: true,
      };

      return next();
    } catch (error) {
      console.error("[requireStepUp] Unexpected error:", error);
      return res.status(500).json({
        success: false,
        code: "STEP_UP_CHECK_ERROR",
        message: "Internal error during step-up verification",
      });
    }
  };
};

export default requireStepUp;
