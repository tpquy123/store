import React, { useState, useCallback } from "react";
import { useAuthStore } from "../state/auth.store";
import StepUpModal from "./StepUpModal";

/**
 * SensitiveAction — Higher-order component bọc một button/action nhạy cảm.
 * Tự động kiểm tra grace period và trigger StepUpModal khi cần.
 *
 * @param {object} props
 * @param {string} props.action - Permission key (e.g. "product.delete")
 * @param {Function} props.onAction - Async function cần thực thi sau step-up
 * @param {React.ReactNode} props.children - Button content
 * @param {boolean} [props.disabled=false] - Disable thêm từ bên ngoài
 *
 * @example
 * <SensitiveAction action="product.delete" onAction={handleDelete}>
 *   <Button variant="destructive">Xóa sản phẩm</Button>
 * </SensitiveAction>
 */
const SensitiveAction = ({ action, onAction, children, disabled = false }) => {
  const { isInGracePeriod, requestStepUp, stepUpState } = useAuthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const handleClick = useCallback(async () => {
    if (disabled || isProcessing) return;

    // Tìm action group cho action hiện tại (client-side map)
    const actionGroup = ACTION_GROUP_MAP[String(action || "").toLowerCase().trim()];

    // Nếu đang trong grace period → thực thi ngay
    if (actionGroup && isInGracePeriod(actionGroup)) {
      setIsProcessing(true);
      try {
        await onAction?.();
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Cần step-up → request OTP rồi mở modal
    setIsProcessing(true);
    const result = await requestStepUp(action);
    setIsProcessing(false);

    if (result.success) {
      setPendingAction(() => onAction);
      setModalOpen(true);
    }
  }, [action, disabled, isProcessing, isInGracePeriod, requestStepUp, onAction]);

  const handleStepUpSuccess = useCallback(
    async (stepUpToken) => {
      setModalOpen(false);
      if (pendingAction) {
        setIsProcessing(true);
        try {
          await pendingAction(stepUpToken);
        } finally {
          setIsProcessing(false);
          setPendingAction(null);
        }
      }
    },
    [pendingAction]
  );

  const handleStepUpCancel = useCallback(() => {
    setModalOpen(false);
    setPendingAction(null);
  }, []);

  // Clone children và inject disabled + onClick
  const child = React.Children.only(children);
  const enhancedChild = React.cloneElement(child, {
    onClick: handleClick,
    disabled: disabled || isProcessing || child.props.disabled,
    style: {
      ...(child.props.style || {}),
      cursor: disabled || isProcessing ? "not-allowed" : "pointer",
    },
  });

  return (
    <>
      {enhancedChild}
      <StepUpModal
        isOpen={modalOpen}
        onSuccess={handleStepUpSuccess}
        onCancel={handleStepUpCancel}
      />
    </>
  );
};

// Client-side map: action key → group key (căn chỉnh theo backend)
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

export default SensitiveAction;
