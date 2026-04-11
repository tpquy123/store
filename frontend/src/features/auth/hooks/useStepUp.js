import { useCallback } from "react";
import { useAuthStore } from "../state/auth.store";
import { authAPI } from "../api/auth.api";

/**
 * useStepUp — Hook quản lý toàn bộ step-up authentication flow.
 *
 * @returns {object} Step-up state và actions
 */
export const useStepUp = () => {
  const {
    stepUpState,
    requestStepUp,
    verifyStepUp,
    clearStepUp,
    setGracePeriod,
    isInGracePeriod,
  } = useAuthStore();

  /**
   * withStepUp — Wrapper tự động xử lý step-up flow cho một async function.
   * Nếu user đang trong grace period → gọi fn trực tiếp.
   * Nếu không → trigger step-up modal và đợi user verify.
   *
   * @param {string} action - Permission key (e.g. "product.delete")
   * @param {Function} fn - Async function cần thực thi sau khi step-up xong
   * @returns {Promise<any>}
   */
  const withStepUp = useCallback(
    async (action, fn) => {
      // Kiểm tra grace period trước
      const actionGroup = getActionGroupForAction(action);
      if (actionGroup && isInGracePeriod(actionGroup)) {
        return fn();
      }

      // Cần step-up → trigger qua requestStepUp
      const result = await requestStepUp(action);
      if (!result.success) {
        throw new Error(result.message || "Failed to request step-up");
      }

      // fn sẽ được gọi bởi StepUpModal.onSuccess callback
      // Return promise để caller có thể await trên event
      return new Promise((resolve, reject) => {
        // Lưu fn vào một custom event để StepUpModal trigger
        window.dispatchEvent(
          new CustomEvent("stepup:pending", {
            detail: {
              action,
              onSuccess: async (stepUpToken) => {
                try {
                  const res = await fn(stepUpToken);
                  resolve(res);
                } catch (err) {
                  reject(err);
                }
              },
              onCancel: () =>
                reject(new Error("STEP_UP_CANCELLED")),
            },
          })
        );
      });
    },
    [requestStepUp, isInGracePeriod]
  );

  /**
   * checkGracePeriodRemote — Kiểm tra grace period trên server (fresh check).
   * Dùng khi muốn đảm bảo chính xác (không dùng client-side cache).
   */
  const checkGracePeriodRemote = useCallback(async (action) => {
    try {
      const response = await authAPI.getStepUpStatus(action);
      const { inGracePeriod, gracePeriodExpiresAt, actionGroup } = response.data.data;

      if (inGracePeriod && actionGroup && gracePeriodExpiresAt) {
        setGracePeriod(actionGroup, gracePeriodExpiresAt);
      }

      return { inGracePeriod, gracePeriodExpiresAt, actionGroup };
    } catch {
      return { inGracePeriod: false, gracePeriodExpiresAt: null, actionGroup: null };
    }
  }, [setGracePeriod]);

  return {
    stepUpState,
    requestStepUp,
    verifyStepUp,
    clearStepUp,
    isInGracePeriod,
    withStepUp,
    checkGracePeriodRemote,
    isPending: stepUpState.pending,
    sessionToken: stepUpState.sessionToken,
    targetAction: stepUpState.targetAction,
    maskedContact: stepUpState.maskedContact,
    expiresAt: stepUpState.expiresAt,
  };
};

// Helper: map action → actionGroup (mirror của backend logic)
// Cập nhật đây khi thêm action group mới trong actions.js
const ACTION_GROUP_MAP = {
  "product.delete": "PRODUCT_BULK_SENSITIVE",
  "product.create": "PRODUCT_BULK_SENSITIVE",
  "analytics.read.global": "FINANCIAL_EXPORT",
  "analytics.manage.global": "FINANCIAL_EXPORT",
  "users.manage.global": "USER_ADMIN",
  "warehouse.write": "INVENTORY_ADJUST",
  "inventory.write": "INVENTORY_ADJUST",
  "order.status.manage": "ORDER_BULK_SENSITIVE",
  "promotion.manage": "PROMOTION_ADMIN",
};

const getActionGroupForAction = (action) =>
  ACTION_GROUP_MAP[String(action || "").toLowerCase().trim()] || null;

export default useStepUp;
