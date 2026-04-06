import mongoose from "mongoose";
import Order from "./Order.js";
import UniversalProduct, { UniversalVariant } from "../product/UniversalProduct.js";
import { ORDER_AUDIT_ACTIONS } from "./orderAuditActions.js";
import { buildOrderAuditPayload } from "./orderAuditAdapter.js";
import { safeWriteAuditEntry } from "../audit/auditService.js";
import { recalculateProductAvailability } from "../product/productPricingService.js";

const getModelsByType = () => {
  return { Product: UniversalProduct, Variant: UniversalVariant };
};

const buildJobMetadata = () => {
  return {
    jobName: "cancelExpiredPendingPaymentOrders",
    trigger: "interval_5_minutes",
  };
};

const getSepayPaymentTtlMinutes = () => {
  const ttl = Number(process.env.SEPAY_PAYMENT_TTL_MINUTES);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return 15;
  }
  return Math.floor(ttl);
};

export const cancelExpiredVNPayOrders = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let activeOrderContext = null;

  try {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const sepayTtlMinutes = getSepayPaymentTtlMinutes();
    const sepayThreshold = new Date(now.getTime() - sepayTtlMinutes * 60 * 1000);

    const expiredOrders = await Order.find({
      status: "PENDING_PAYMENT",
      $or: [
        {
          paymentMethod: "VNPAY",
          createdAt: { $lte: fifteenMinutesAgo },
        },
        {
          paymentMethod: "BANK_TRANSFER",
          "paymentInfo.sepayOrderCode": { $exists: true, $ne: "" },
          $or: [
            { "paymentInfo.sepayExpiresAt": { $lte: now } },
            { createdAt: { $lte: sepayThreshold } },
          ],
        },
      ],
    }).session(session);

    if (expiredOrders.length === 0) {
      await session.commitTransaction();
      return { success: true, cancelled: 0 };
    }

    console.log(`Found ${expiredOrders.length} expired pending-payment orders to cancel`);
    const affectedProductIds = new Set();

    for (const order of expiredOrders) {
      const beforeOrder = order.toObject ? order.toObject() : { ...order };
      activeOrderContext = {
        orderId: String(order._id),
        beforeOrder,
      };

      const orderOwnerId = order.customerId || order.userId;
      if (!Array.isArray(order.statusHistory)) {
        order.statusHistory = [];
      }

      for (const item of order.items) {
        const models = getModelsByType(item.productType);
        if (!models) {
          continue;
        }

        const variant = await models.Variant.findById(item.variantId).session(session);
        if (variant) {
          variant.stock += item.quantity;
          variant.salesCount = Math.max(0, (variant.salesCount || 0) - item.quantity);
          await variant.save({ session });
          if (variant.productId) {
            affectedProductIds.add(String(variant.productId));
          }
        }

        const product = await models.Product.findById(item.productId).session(session);
        if (product) {
          product.salesCount = Math.max(0, (product.salesCount || 0) - item.quantity);
          await product.save({ session });
          affectedProductIds.add(String(product._id));
        }
      }

      if (order.pointsUsed > 0) {
        const user = await mongoose.model("User").findById(orderOwnerId).session(session);
        if (user && typeof user.rewardPoints === "number") {
          user.rewardPoints += order.pointsUsed;
          await user.save({ session });
        }
      }

      order.status = "CANCELLED";
      order.cancelledAt = new Date();
      const isSepayOrder = order.paymentMethod === "BANK_TRANSFER";
      const expiredReason = isSepayOrder
        ? `SePay bank transfer payment expired after ${sepayTtlMinutes} minutes`
        : "VNPay payment expired after 15 minutes";
      const historyNote = isSepayOrder
        ? "Auto-cancelled because SePay payment window expired"
        : "Auto-cancelled because payment window expired";

      order.cancelReason = expiredReason;
      order.statusHistory.push({
        status: "CANCELLED",
        updatedBy: orderOwnerId,
        updatedAt: new Date(),
        note: historyNote,
      });

      await order.save({ session });

      const successPayload = buildOrderAuditPayload({
        actionType: ORDER_AUDIT_ACTIONS.AUTO_CANCEL_EXPIRED_ORDER,
        outcome: "SUCCESS",
        source: "SCHEDULER_JOB",
        orderId: String(order._id),
        beforeOrder,
        afterOrder: order.toObject ? order.toObject() : { ...order },
        statusCode: 200,
        resBody: {
          message: isSepayOrder
            ? "Order auto-cancelled due to expired SePay payment window"
            : "Order auto-cancelled due to expired VNPay payment window",
        },
        metadata: buildJobMetadata(),
      });

      await safeWriteAuditEntry(successPayload, {
        actionType: ORDER_AUDIT_ACTIONS.AUTO_CANCEL_EXPIRED_ORDER,
        orderId: String(order._id),
      });

      activeOrderContext = null;
      console.log(`Auto-cancelled order: ${order.orderNumber}`);
    }

    for (const productId of affectedProductIds) {
      await recalculateProductAvailability({ productId, session });
    }

    await session.commitTransaction();
    console.log(`Successfully cancelled ${expiredOrders.length} expired orders`);
    return { success: true, cancelled: expiredOrders.length };
  } catch (error) {
    await session.abortTransaction();

    if (activeOrderContext?.orderId) {
      const failedPayload = buildOrderAuditPayload({
        actionType: ORDER_AUDIT_ACTIONS.AUTO_CANCEL_EXPIRED_ORDER,
        outcome: "FAILED",
        source: "SCHEDULER_JOB",
        orderId: activeOrderContext.orderId,
        beforeOrder: activeOrderContext.beforeOrder,
        afterOrder: activeOrderContext.beforeOrder,
        statusCode: 500,
        resBody: {
          code: "SCHEDULER_JOB_FAILED",
          message: error.message,
        },
        metadata: buildJobMetadata(),
      });

      await safeWriteAuditEntry(failedPayload, {
        actionType: ORDER_AUDIT_ACTIONS.AUTO_CANCEL_EXPIRED_ORDER,
        orderId: activeOrderContext.orderId,
      });
    }

    console.error("Auto-cancel error:", error);
    return { success: false, error: error.message };
  } finally {
    session.endSession();
  }
};

export default {
  cancelExpiredVNPayOrders,
};
