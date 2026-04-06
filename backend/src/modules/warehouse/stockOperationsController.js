// ============================================
// FILE: backend/src/modules/warehouse/stockOperationsController.js
// Controllers cho xuất kho, chuyển kho, kiểm kê
// ============================================

import Inventory from "./Inventory.js";
import WarehouseLocation from "./WarehouseLocation.js";
import StockMovement from "./StockMovement.js";
import CycleCount from "./CycleCount.js";
import Order from "../order/Order.js";
import mongoose from "mongoose";
import {
  ensureWarehouseWriteBranchId,
  resolveWarehouseStore,
} from "./warehouseContext.js";
import {
  assignDevicesToOrderItem,
  resolveSerializedItemFlags,
} from "../device/deviceService.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import { hasPermission } from "../../authz/policyEngine.js";

const getActorName = (user) =>
  user?.fullName?.trim() || user?.name?.trim() || user?.email?.trim() || "Unknown";

const toPositiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

const normalizeSku = (value) => String(value || "").trim();
const requestHasPermission = (req, permission, mode = "branch") =>
  hasPermission(req?.authz, permission, { mode });

const sumQuantityBySku = (items = [], skuSelector) => {
  const result = new Map();

  for (const item of items) {
    const sku = normalizeSku(skuSelector(item));
    const quantity = Number(item?.quantity) || 0;
    if (!sku || quantity <= 0) continue;

    result.set(sku, (result.get(sku) || 0) + quantity);
  }

  return result;
};

const upsertPickedItems = (items = [], { sku, quantity, locationCode }) => {
  const normalizedSku = normalizeSku(sku);
  const normalizedLocationCode = String(locationCode || "").trim();
  const pickedQty = Number(quantity) || 0;
  const pickedItems = Array.isArray(items) ? [...items] : [];

  const existingIndex = pickedItems.findIndex(
    (item) =>
      normalizeSku(item?.sku) === normalizedSku &&
      String(item?.locationCode || "").trim() === normalizedLocationCode
  );

  if (existingIndex >= 0) {
    const currentQty = Number(pickedItems[existingIndex]?.quantity) || 0;
    pickedItems[existingIndex].quantity = currentQty + pickedQty;
    return pickedItems;
  }

  pickedItems.push({
    sku: normalizedSku,
    quantity: pickedQty,
    locationCode: normalizedLocationCode,
  });

  return pickedItems;
};

const isOrderPickCompleted = (orderItems = [], pickedItems = []) => {
  const requiredBySku = sumQuantityBySku(orderItems, (item) => item?.sku || item?.variantSku);
  if (requiredBySku.size === 0) return false;

  const pickedBySku = sumQuantityBySku(pickedItems, (item) => item?.sku);
  for (const [sku, requiredQty] of requiredBySku.entries()) {
    if ((pickedBySku.get(sku) || 0) < requiredQty) {
      return false;
    }
  }

  return true;
};

const appendStatusHistory = (order, status, updatedBy, note) => {
  if (!Array.isArray(order.statusHistory)) {
    order.statusHistory = [];
  }

  order.statusHistory.push({
    status,
    updatedBy,
    updatedAt: new Date(),
    note,
  });
};

// ============================================
// PHẦN 1: XUẤT KHO (PICK)
// ============================================

/**
 * Lấy danh sách pick cho đơn hàng
 * GET /api/warehouse/pick-list/:orderId
 */
export const getPickList = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    const pickList = [];
    const serializedFlags = await resolveSerializedItemFlags({
      items: order.items,
    });

    for (const item of order.items) {
      const sku = item.sku || item.variantSku;
      if (!sku) continue;
      const itemFlag = serializedFlags.get(String(item.productId || "")) || {};

      // Tìm các vị trí có hàng
      const inventoryItems = await Inventory.find({
        sku,
        quantity: { $gt: 0 },
        status: "GOOD",
      })
        .populate("locationId", "locationCode zoneName aisle shelf bin")
        .sort({ quantity: -1 });

      let remainingQty = item.quantity;
      const locations = [];

      for (const inv of inventoryItems) {
        if (remainingQty <= 0) break;

        const availableQty = Number.isFinite(inv.quantity) ? inv.quantity : 0;
        if (availableQty <= 0) continue;

        const resolvedLocationCode = inv.locationCode || inv.locationId?.locationCode || "";
        if (!resolvedLocationCode) continue;

        const pickQty = Math.min(availableQty, remainingQty);
        locations.push({
          locationCode: resolvedLocationCode,
          zoneName: inv.locationId?.zoneName || "",
          aisle: inv.locationId?.aisle || "",
          shelf: inv.locationId?.shelf || "",
          bin: inv.locationId?.bin || "",
          availableQty,
          pickQty,
        });

        remainingQty -= pickQty;
      }

      pickList.push({
        sku,
        productName: item.name || item.productName,
        requiredQty: item.quantity,
        serializedTrackingEnabled: Boolean(itemFlag.isSerialized),
        assignedDevicesCount: Array.isArray(item.deviceAssignments)
          ? item.deviceAssignments.length
          : 0,
        locations,
        fulfilled: remainingQty <= 0,
      });
    }

    res.json({
      success: true,
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderSource: order.orderSource,
      fulfillmentType: order.fulfillmentType,
      orderStatus: order.status,
      pickList,
    });
  } catch (error) {
    console.error("Error getting pick list:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách pick",
      error: error.message,
    });
  }
};

/**
 * Xác nhận lấy hàng
 * POST /api/warehouse/pick
 */
export const pickItem = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const activeStoreId = ensureWarehouseWriteBranchId(req);
    await resolveWarehouseStore(req, { branchId: activeStoreId, session });

    const { orderId, sku, locationCode, quantity, deviceIds = [] } = req.body;
    const pickQty = toPositiveInteger(quantity);
    const actorName = getActorName(req.user);
    const normalizedSku = normalizeSku(sku);
    const normalizedLocationCode = String(locationCode || "").trim();

    if (!normalizedSku || !normalizedLocationCode || !pickQty) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Dữ liệu lấy hàng không hợp lệ (sku, locationCode, quantity)",
      });
    }

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    const orderItem = order.items.find(
      (item) => normalizeSku(item?.sku || item?.variantSku) === normalizedSku
    );
    if (!orderItem) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `KhÃ´ng tÃ¬m tháº¥y SKU ${normalizedSku} trong Ä‘Æ¡n hÃ ng`,
      });
    }

    const isInStoreOrder =
      order.orderSource === "IN_STORE" || order.fulfillmentType === "IN_STORE";
    if (isInStoreOrder) {
      const assignedPickerId = order?.pickerInfo?.pickerId?.toString();
      const actorId = req.user?._id?.toString();

      if (!requestHasPermission(req, AUTHZ_ACTIONS.ORDER_PICK_COMPLETE_INSTORE, "branch")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Đơn IN_STORE chỉ cho Warehouse Manager thao tác xuất kho",
        });
      }

      if (assignedPickerId && actorId && assignedPickerId !== actorId) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Đơn này đã được gán cho Warehouse Manager khác",
        });
      }
    }

    // Tìm inventory
    const location = await WarehouseLocation.findOne({
      storeId: activeStoreId,
      locationCode: normalizedLocationCode,
    }).session(session);
    if (!location) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Không tìm thấy vị trí" });
    }

    const inventory = await Inventory.findOne({
      sku: normalizedSku,
      storeId: activeStoreId,
      locationId: location._id,
    }).session(session);

    const availableQty = Number.isFinite(inventory?.quantity) ? inventory.quantity : 0;

    if (!inventory || availableQty < pickQty) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Không đủ hàng tại ${normalizedLocationCode}. Tồn: ${availableQty}`,
      });
    }

    // Trừ tồn kho
    inventory.quantity = availableQty - pickQty;
    await inventory.save({ session });

    // Cập nhật location
    const currentLoad = Number.isFinite(location.currentLoad) ? location.currentLoad : 0;
    location.currentLoad = Math.max(0, currentLoad - pickQty);
    await location.save({ session });

    // Ghi log
    const movement = new StockMovement({
      storeId: activeStoreId,
      type: "OUTBOUND",
      sku: normalizedSku,
      productId: inventory.productId,
      productName: inventory.productName,
      fromLocationId: location._id,
      fromLocationCode: normalizedLocationCode,
      quantity: pickQty,
      referenceType: "ORDER",
      referenceId: orderId,
      performedBy: req.user._id,
      performedByName: actorName,
    });
    await movement.save({ session });

    const serializedFlags = await resolveSerializedItemFlags({
      items: [orderItem],
      session,
    });
    const serializedTrackingEnabled =
      serializedFlags.get(String(orderItem.productId || ""))?.isSerialized || false;

    if (serializedTrackingEnabled) {
      if (Array.isArray(deviceIds) && deviceIds.length > 0 && deviceIds.length !== pickQty) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Sá»‘ lÆ°á»£ng deviceIds pháº£i báº±ng ${pickQty} cho SKU serialized`,
        });
      }

      await assignDevicesToOrderItem({
        storeId: activeStoreId,
        order,
        orderItem,
        requestedDeviceIds: Array.isArray(deviceIds) ? deviceIds : [],
        requestedQuantity: pickQty,
        actor: req.user,
        session,
        locationId: location._id,
        mode: Array.isArray(deviceIds) && deviceIds.length > 0 ? "MANUAL" : "AUTO",
      });
    }

    const shippedNote = `Xuat kho ${pickQty} ${normalizedSku} tai ${normalizedLocationCode}`;
    const pickedItems = upsertPickedItems(order?.shippedByInfo?.items, {
      sku: normalizedSku,
      quantity: pickQty,
      locationCode: normalizedLocationCode,
    });
    const pickCompleted = isOrderPickCompleted(order.items, pickedItems);
    const now = new Date();

    order.shippedByInfo = {
      ...order.shippedByInfo,
      shippedBy: req.user._id,
      shippedByName: actorName,
      shippedAt: now,
      shippedNote: shippedNote,
      items: pickedItems,
    };

    let historyStatus = order.status;
    let historyNote = shippedNote;

    if (pickCompleted && ["CONFIRMED", "PROCESSING", "PREPARING"].includes(order.status)) {
      order.status = "PREPARING_SHIPMENT";
      historyStatus = "PREPARING_SHIPMENT";
      historyNote = "Xuat kho hoan tat, san sang ban giao";

      order.pickerInfo = {
        ...order.pickerInfo,
        pickerId: order.pickerInfo?.pickerId || req.user._id,
        pickerName: order.pickerInfo?.pickerName || actorName,
        pickedAt: order.pickerInfo?.pickedAt || now,
        note: order.pickerInfo?.note || "",
      };
    }

    appendStatusHistory(order, historyStatus, req.user._id, historyNote);
    await order.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: `Đã lấy ${pickQty} ${inventory.productName}`,
      remaining: inventory.quantity,
      serializedTrackingEnabled,
      assignedDevicesCount: Array.isArray(orderItem.deviceAssignments)
        ? orderItem.deviceAssignments.length
        : 0,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error picking item:", error);
    res.status(500).json({ success: false, message: "Lỗi khi lấy hàng", error: error.message });
  } finally {
    session.endSession();
  }
};

// ============================================
// PHẦN 2: CHUYỂN KHO
// ============================================

/**
 * Chuyển hàng giữa các vị trí
 * POST /api/warehouse/transfer
 */
export const transferStock = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const activeStoreId = ensureWarehouseWriteBranchId(req);
    await resolveWarehouseStore(req, { branchId: activeStoreId, session });

    const { sku, fromLocationCode, toLocationCode, quantity, reason, notes } = req.body;
    const transferQty = toPositiveInteger(quantity);
    const actorName = getActorName(req.user);

    if (!sku?.trim() || !fromLocationCode?.trim() || !toLocationCode?.trim() || !transferQty) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message:
          "Dữ liệu chuyển kho không hợp lệ (sku, fromLocationCode, toLocationCode, quantity)",
      });
    }

    // Validate locations
    const fromLocation = await WarehouseLocation.findOne({
      storeId: activeStoreId,
      locationCode: fromLocationCode,
    }).session(session);
    const toLocation = await WarehouseLocation.findOne({
      storeId: activeStoreId,
      locationCode: toLocationCode,
    }).session(session);

    if (!fromLocation || !toLocation) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Không tìm thấy vị trí kho" });
    }

    // Check source inventory
    const fromInventory = await Inventory.findOne({
      storeId: activeStoreId,
      sku,
      locationId: fromLocation._id,
    }).session(session);
    const sourceAvailableQty = Number.isFinite(fromInventory?.quantity) ? fromInventory.quantity : 0;
    if (!fromInventory || sourceAvailableQty < transferQty) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Không đủ hàng tại ${fromLocationCode}. Tồn: ${sourceAvailableQty}`,
      });
    }

    // Check destination capacity
    if (!toLocation.canAccommodate(transferQty)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Vị trí đích không đủ chỗ" });
    }

    // Trừ source
    fromInventory.quantity = sourceAvailableQty - transferQty;
    await fromInventory.save({ session });
    const fromCurrentLoad = Number.isFinite(fromLocation.currentLoad) ? fromLocation.currentLoad : 0;
    fromLocation.currentLoad = Math.max(0, fromCurrentLoad - transferQty);
    await fromLocation.save({ session });

    // Cộng destination
    let toInventory = await Inventory.findOne({
      storeId: activeStoreId,
      sku,
      locationId: toLocation._id,
    }).session(session);
    if (toInventory) {
      const destinationQty = Number.isFinite(toInventory.quantity) ? toInventory.quantity : 0;
      toInventory.quantity = destinationQty + transferQty;
      await toInventory.save({ session });
    } else {
      toInventory = new Inventory({
        storeId: activeStoreId,
        sku,
        productId: fromInventory.productId,
        productName: fromInventory.productName,
        locationId: toLocation._id,
        locationCode: toLocationCode,
        quantity: transferQty,
        status: fromInventory.status,
      });
      await toInventory.save({ session });
    }
    const toCurrentLoad = Number.isFinite(toLocation.currentLoad) ? toLocation.currentLoad : 0;
    toLocation.currentLoad = toCurrentLoad + transferQty;
    await toLocation.save({ session });

    // Ghi log
    const movement = new StockMovement({
      storeId: activeStoreId,
      type: "TRANSFER",
      sku,
      productId: fromInventory.productId,
      productName: fromInventory.productName,
      fromLocationId: fromLocation._id,
      fromLocationCode,
      toLocationId: toLocation._id,
      toLocationCode,
      quantity: transferQty,
      referenceType: "TRANSFER",
      referenceId: `TF-${Date.now()}`,
      performedBy: req.user._id,
      performedByName: actorName,
      notes: `${reason || ""} ${notes || ""}`.trim(),
    });
    await movement.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: `Đã chuyển ${transferQty} từ ${fromLocationCode} đến ${toLocationCode}`,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error transferring stock:", error);
    res.status(500).json({ success: false, message: "Lỗi khi chuyển kho", error: error.message });
  } finally {
    session.endSession();
  }
};

// ============================================
// PHẦN 3: KIỂM KÊ (CYCLE COUNT)
// ============================================

/**
 * Tạo phiếu kiểm kê
 * POST /api/warehouse/cycle-count
 */
export const createCycleCount = async (req, res) => {
  try {
    const activeStoreId = ensureWarehouseWriteBranchId(req);
    const activeStore = await resolveWarehouseStore(req, { branchId: activeStoreId });
    const { scope, zones, aisles, notes } = req.body;

    const count = await CycleCount.countDocuments();
    const countNumber = `CC-${activeStore.code}-${new Date().getFullYear()}-${String(
      count + 1
    ).padStart(4, "0")}`;

    // Lấy danh sách items cần kiểm
    const filter = { status: "ACTIVE" };
    if (zones?.length) filter.zone = { $in: zones };
    if (aisles?.length) filter.aisle = { $in: aisles };

    const locations = await WarehouseLocation.find(filter);
    const items = [];

    for (const loc of locations) {
      const inventoryItems = await Inventory.find({ locationId: loc._id });
      for (const inv of inventoryItems) {
        items.push({
          sku: inv.sku,
          productId: inv.productId,
          productName: inv.productName,
          locationId: loc._id,
          locationCode: loc.locationCode,
          systemQuantity: inv.quantity,
          countedQuantity: null,
          variance: null,
          status: "PENDING",
        });
      }
    }

    const cycleCount = new CycleCount({
      storeId: activeStoreId,
      countNumber,
      scope:
        typeof scope === "object" && scope
          ? {
              warehouse: scope.warehouse || activeStore.code,
              zone: scope.zone || null,
              aisle: scope.aisle || null,
            }
          : {
              warehouse: activeStore.code,
              zone: zones?.[0] || null,
              aisle: aisles?.[0] || null,
            },
      countDate: new Date(),
      assignedTo: [
        {
          userId: req.user._id,
          userName: getActorName(req.user),
        },
      ],
      items,
      status: "IN_PROGRESS",
      createdBy: req.user._id,
      createdByName: getActorName(req.user),
      notes,
    });

    await cycleCount.save();

    res.status(201).json({
      success: true,
      message: `Đã tạo phiếu kiểm kê ${countNumber} với ${items.length} mục`,
      cycleCount,
    });
  } catch (error) {
    console.error("Error creating cycle count:", error);
    res.status(500).json({ success: false, message: "Lỗi khi tạo phiếu kiểm kê", error: error.message });
  }
};

/**
 * Lấy danh sách phiếu kiểm kê
 * GET /api/warehouse/cycle-count
 */
export const getCycleCounts = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const [cycleCounts, total] = await Promise.all([
      CycleCount.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      CycleCount.countDocuments(filter),
    ]);

    res.json({
      success: true,
      cycleCounts,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error getting cycle counts:", error);
    res.status(500).json({ success: false, message: "Lỗi khi lấy danh sách kiểm kê", error: error.message });
  }
};

/**
 * Cập nhật kết quả kiểm kê cho 1 item
 * PUT /api/warehouse/cycle-count/:id/update-item
 */
export const updateCycleCountItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { sku, locationCode, countedQuantity } = req.body;

    const cycleCount = await CycleCount.findById(id);
    if (!cycleCount) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiếu kiểm kê" });
    }

    const item = cycleCount.items.find((i) => i.sku === sku && i.locationCode === locationCode);
    if (!item) {
      return res.status(404).json({ success: false, message: "Không tìm thấy mục kiểm kê" });
    }

    item.countedQuantity = countedQuantity;
    item.variance = countedQuantity - item.systemQuantity;
    item.status = item.variance === 0 ? "MATCHED" : "VARIANCE";
    item.countedAt = new Date();
    item.countedBy = req.user._id;

    await cycleCount.save();

    res.json({ success: true, message: "Đã cập nhật", item });
  } catch (error) {
    console.error("Error updating cycle count item:", error);
    res.status(500).json({ success: false, message: "Lỗi khi cập nhật kiểm kê", error: error.message });
  }
};

/**
 * Hoàn thành kiểm kê
 * PUT /api/warehouse/cycle-count/:id/complete
 */
export const completeCycleCount = async (req, res) => {
  try {
    const cycleCount = await CycleCount.findById(req.params.id);
    if (!cycleCount) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiếu kiểm kê" });
    }

    // Tính summary
    const totalLocations = cycleCount.items.length;
    const matchedLocations = cycleCount.items.filter((item) => item.variance === 0).length;
    const varianceLocations = cycleCount.items.filter(
      (item) => item.variance !== 0 && item.countedQuantity !== null
    ).length;
    const totalVariance = cycleCount.items.reduce(
      (sum, item) => sum + (Number(item.variance) || 0),
      0
    );

    cycleCount.summary = {
      totalLocations,
      matchedLocations,
      varianceLocations,
      totalVariance,
    };
    cycleCount.status = "COMPLETED";
    cycleCount.completedAt = new Date();

    await cycleCount.save();

    res.json({ success: true, message: "Đã hoàn thành kiểm kê", cycleCount });
  } catch (error) {
    console.error("Error completing cycle count:", error);
    res.status(500).json({ success: false, message: "Lỗi khi hoàn thành kiểm kê", error: error.message });
  }
};

/**
 * Duyệt kiểm kê và điều chỉnh tồn kho
 * PUT /api/warehouse/cycle-count/:id/approve
 */
export const approveCycleCount = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const activeStoreId = ensureWarehouseWriteBranchId(req);
    await resolveWarehouseStore(req, { branchId: activeStoreId, session });

    const cycleCount = await CycleCount.findById(req.params.id).session(session);
    if (!cycleCount) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Không tìm thấy phiếu kiểm kê" });
    }

    if (cycleCount.status !== "COMPLETED") {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Phiếu chưa hoàn thành" });
    }

    // Điều chỉnh tồn kho cho các mục có chênh lệch
    for (const item of cycleCount.items) {
      if (item.variance && item.variance !== 0) {
        const inventory = await Inventory.findOne({
          storeId: activeStoreId,
          sku: item.sku,
          locationId: item.locationId,
        }).session(session);

        if (inventory) {
          inventory.quantity = item.countedQuantity;
          await inventory.save({ session });

          // Ghi log adjustment
          const movement = new StockMovement({
            storeId: activeStoreId,
            type: "ADJUSTMENT",
            sku: item.sku,
            productId: item.productId,
            productName: item.productName,
            toLocationId: item.locationId,
            toLocationCode: item.locationCode,
            quantity: Math.abs(item.variance),
            referenceType: "CYCLE_COUNT",
            referenceId: cycleCount.countNumber,
            performedBy: req.user._id,
            performedByName: getActorName(req.user),
            notes: `Điều chỉnh kiểm kê: ${item.variance > 0 ? "+" : ""}${item.variance}`,
          });
          await movement.save({ session });
        }
      }
    }

    cycleCount.status = "APPROVED";
    cycleCount.approvedBy = req.user._id;
    cycleCount.approvedByName = getActorName(req.user);
    cycleCount.approvedAt = new Date();
    await cycleCount.save({ session });

    await session.commitTransaction();

    res.json({ success: true, message: "Đã duyệt và điều chỉnh tồn kho", cycleCount });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error approving cycle count:", error);
    res.status(500).json({ success: false, message: "Lỗi khi duyệt kiểm kê", error: error.message });
  } finally {
    session.endSession();
  }
};

export default {
  getPickList,
  pickItem,
  transferStock,
  createCycleCount,
  getCycleCounts,
  updateCycleCountItem,
  completeCycleCount,
  approveCycleCount,
};


