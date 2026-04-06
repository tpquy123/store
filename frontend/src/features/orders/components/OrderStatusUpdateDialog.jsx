// ============================================
// FILE: frontend/src/components/order/OrderStatusUpdateDialog.jsx
// Component để Order Manager cập nhật trạng thái và chọn Shipper
// ============================================

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { toast } from "sonner";
import { orderAPI } from "../api/orders.api";
import { userAPI } from "@/features/account";
import { getStatusColor, getStatusStage, getStatusText } from "@/shared/lib/utils";
import { AlertCircle } from "lucide-react";
import { usePermission } from "@/features/auth";

const OrderStatusUpdateDialog = ({ order, open, onClose, onSuccess }) => {
  const canManageCoordinatorWorkflow = usePermission("order.status.manage");
  const canManageWarehouseWorkflow = usePermission("order.status.manage.warehouse");
  const canManageTaskWorkflow = usePermission("order.status.manage.task");
  const canManagePosWorkflow = usePermission("order.status.manage.pos");
  const canCompleteInStorePick = usePermission("order.pick.complete.instore");
  const [newStatus, setNewStatus] = useState("");
  const [note, setNote] = useState("");
  const [shippers, setShippers] = useState([]);


  const [selectedShipper, setSelectedShipper] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingShippers, setIsFetchingShippers] = useState(false);
  const currentStage = order?.statusStage || getStatusStage(order?.status);
  const isInStoreOrder =
    order?.orderSource === "IN_STORE" || order?.fulfillmentType === "IN_STORE";
  const requiresCarrierSelection = newStatus === "SHIPPING";
  const requiresPickerSelection =
    newStatus === "PROCESSING" || newStatus === "PREPARING";

  const [pickers, setPickers] = useState([]);
  const [selectedPicker, setSelectedPicker] = useState("");
  const [isFetchingPickers, setIsFetchingPickers] = useState(false);

  // Fetch danh sách Shipper khi cần chuyển sang IN_TRANSIT
  useEffect(() => {
    if (open && order && requiresCarrierSelection) {
      fetchShippers();
    }
  }, [open, order, requiresCarrierSelection]);

  // Fetch danh sách Warehouse Manager khi cần giao xử lý lấy hàng
  useEffect(() => {
    if (open && order && requiresPickerSelection) {
      fetchPickers();
    }
  }, [open, order, requiresPickerSelection]);

  // Reset form khi mở dialog
  useEffect(() => {
    if (open) {
      setNewStatus("");
      setNote("");
      setSelectedShipper("");
      setShippers([]);
      setSelectedPicker("");
      setPickers([]);
    }
  }, [open]);

  const fetchShippers = async () => {
    setIsFetchingShippers(true);
    try {
      const response = await userAPI.getAllShippers();
      setShippers(response.data.data.shippers || []);
    } catch (error) {
      console.error("Lỗi tải danh sách Shipper:", error);
      toast.error("Không thể tải danh sách Shipper");
      setShippers([]);
    } finally {
      setIsFetchingShippers(false);
    }
  };

  const fetchPickers = async () => {
    setIsFetchingPickers(true);
    try {
      const pickerRole = isInStoreOrder
        ? "WAREHOUSE_MANAGER"
        : "WAREHOUSE_STAFF,WAREHOUSE_MANAGER";
      const response = await userAPI.getAllEmployees({ role: pickerRole });
      setPickers(response.data.data.employees || []);
    } catch (error) {
      console.error("Lỗi tải danh sách Warehouse Manager:", error);
      toast.error("Không thể tải danh sách Warehouse Manager");
      setPickers([]);
    } finally {
      setIsFetchingPickers(false);
    }
  };

  const getValidTransitions = (orderData) => {
    const filterByPermission = (transitions) => {
      if (canManageCoordinatorWorkflow) {
        return transitions;
      }

      return transitions.filter((item) => {
        if (canManageWarehouseWorkflow || canCompleteInStorePick) {
          return [
            "PROCESSING",
            "PREPARING",
            "PREPARING_SHIPMENT",
            "SHIPPING",
            "PENDING_PAYMENT",
            "CANCELLED",
            "CANCEL_REFUND_PENDING",
            "INCIDENT_REFUND_PROCESSING",
          ].includes(item.value);
        }

        if (canManageTaskWorkflow) {
          return ["SHIPPING", "DELIVERED", "RETURNED"].includes(item.value);
        }

        if (canManagePosWorkflow) {
          return ["CONFIRMED", "PENDING_PAYMENT", "DELIVERED", "CANCELLED"].includes(item.value);
        }

        return false;
      });
    };

    const currentOrderStage = orderData?.statusStage || getStatusStage(orderData?.status);
    const isInStoreOrder =
      orderData?.orderSource === "IN_STORE" ||
      orderData?.fulfillmentType === "IN_STORE";

    if (isInStoreOrder) {
      const inStoreTransitionsByStage = {
        PENDING: [
          { value: "CONFIRMED", label: "Xác nhận đơn" },
          { value: "PROCESSING", label: "Giao Warehouse Manager xử lý" },
          { value: "CANCELLED", label: "Hủy đơn" },
        ],
        PENDING_ORDER_MANAGEMENT: [
          { value: "PROCESSING", label: "Giao Warehouse Manager xử lý" },
          { value: "CONFIRMED", label: "Xác nhận đơn (Bỏ qua kho)" }, // Optional shortcut
          { value: "CANCELLED", label: "Hủy đơn" },
        ],
        CONFIRMED: [
          { value: "PROCESSING", label: "Giao Warehouse Manager xử lý" },
          { value: "CANCELLED", label: "Hủy đơn" },
        ],
        PROCESSING: [
          { value: "CANCELLED", label: "Hủy đơn" },
        ],
        PICKING: [
          { value: "CANCELLED", label: "Hủy đơn" },
        ],
        PICKUP_COMPLETED: [
          { value: "CANCELLED", label: "Hủy đơn" },
        ],
        PENDING_PAYMENT: [
          { value: "CANCELLED", label: "Hủy đơn" },
        ],
        DELIVERED: [{ value: "RETURNED", label: "Trả hàng" }],
        RETURNED: [],
        CANCELLED: [],
      };
      return filterByPermission(inStoreTransitionsByStage[currentOrderStage] || []);
    }

    const onlineTransitionsByStage = {
      PENDING: [
        { value: "CONFIRMED", label: "Đã xác nhận" },
        { value: "CANCELLED", label: "Hủy đơn" },
      ],
      PENDING_PAYMENT: [
        { value: "PENDING", label: "Chờ xử lý" },
        { value: "PAYMENT_FAILED", label: "Thanh toán thất bại" },
        { value: "CANCELLED", label: "Hủy đơn" },
      ],
      PAYMENT_FAILED: [
        { value: "PENDING", label: "Mở lại xử lý đơn" },
        { value: "CANCELLED", label: "Hủy đơn" },
      ],
      CONFIRMED: [
        { value: "PROCESSING", label: "Bắt đầu lấy hàng" },
        { value: "CANCELLED", label: "Hủy đơn" },
      ],
      PROCESSING: [
        { value: "CANCELLED", label: "Hủy đơn" },
      ],
      PICKUP_COMPLETED: [
        { value: "SHIPPING", label: "Đang giao hàng" },
        { value: "CANCELLED", label: "Hủy đơn" },
      ],
      IN_TRANSIT: [
        { value: "DELIVERED", label: "Đã giao hàng" },
        { value: "RETURNED", label: "Trả hàng" },
        { value: "CANCELLED", label: "Hủy đơn" },
      ],
      DELIVERED: [{ value: "RETURNED", label: "Trả hàng" }],
      RETURNED: [],
      CANCELLED: [],
    };

    return filterByPermission(onlineTransitionsByStage[currentOrderStage] || []);
  };

  const handleSubmit = async () => {
    if (!newStatus) {
      toast.error("Vui lòng chọn trạng thái mới");
      return;
    }

    // ✅ Kiểm tra nếu chuyển sang SHIPPING phải chọn Shipper
    if (requiresCarrierSelection && !selectedShipper) {
      toast.error("Vui lòng chọn Shipper để giao hàng");
      return;
    }

    // ✅ Đơn IN_STORE cần chỉ định Warehouse Manager
    if (requiresPickerSelection && !selectedPicker) {
      toast.error(
        isInStoreOrder
          ? "Vui lòng chọn Warehouse Manager"
          : "Vui lòng chọn nhân viên kho"
      );
      return;
    }

    setIsLoading(true);
    try {
      if (requiresCarrierSelection && selectedShipper) {
        await orderAPI.assignCarrier(order._id, {
          shipperId: selectedShipper,
          note: note.trim() || "Carrier assigned from manager UI",
        });
      }

      const updateData = {
          status: newStatus,
          note: note.trim() || undefined,
      };

      if (requiresPickerSelection && selectedPicker) {
          updateData.pickerId = selectedPicker;
      }

      await orderAPI.updateStatus(order._id, updateData);

      toast.success("Cập nhật trạng thái thành công");
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("❌ Lỗi cập nhật trạng thái:", error);
      toast.error(error.response?.data?.message || "Cập nhật thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  if (!order) return null;

  const validTransitions = getValidTransitions(order);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cập nhật trạng thái đơn hàng</DialogTitle>
          <DialogDescription>Đơn hàng #{order.orderNumber}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Trạng thái hiện tại */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">
              Giai đoạn hiện tại
            </p>
            <Badge className={getStatusColor(currentStage)}>
              {getStatusText(currentStage)}
            </Badge>
            {order.status && (
              <p className="text-xs text-muted-foreground mt-2">
                Chi tiết: {getStatusText(order.status)}
              </p>
            )}
          </div>

          {/* Chọn trạng thái mới */}
          <div className="space-y-2">
            <Label htmlFor="status">Trạng thái mới *</Label>
            <select
              id="status"
              value={newStatus}
              onChange={(e) => {
                setNewStatus(e.target.value);
                setSelectedShipper(""); // Reset shipper khi đổi trạng thái
                setSelectedPicker(""); // Reset picker
              }}
              className="w-full px-3 py-2 border rounded-md"
              disabled={validTransitions.length === 0}
            >
              <option value="">-- Chọn trạng thái --</option>
              {validTransitions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ Dropdown chọn Shipper (chỉ hiện khi chuyển sang IN_TRANSIT) */}
          {requiresCarrierSelection && (
            <div className="space-y-2">
              <Label htmlFor="shipper">Chọn Shipper *</Label>
              {isFetchingShippers ? (
                <div className="flex items-center justify-center p-3 border rounded-md">
                  <AlertCircle className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">
                    Đang tải danh sách Shipper...
                  </span>
                </div>
              ) : (
                <>
                  <select
                    id="shipper"
                    value={selectedShipper}
                    onChange={(e) => setSelectedShipper(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">-- Chọn Shipper --</option>
                    {shippers.map((shipper) => (
                      <option key={shipper._id} value={shipper._id}>
                        {shipper.fullName} - {shipper.phoneNumber}
                      </option>
                    ))}
                  </select>
                  {shippers.length === 0 && (
                    <p className="text-sm text-yellow-600 flex items-center gap-2 mt-1">
                      <AlertCircle className="w-4 h-4" />
                      Không có Shipper nào khả dụng
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ✅ Dropdown chọn người phụ trách lấy hàng */}
          {requiresPickerSelection && (
            <div className="space-y-2">
              <Label htmlFor="picker">
                {isInStoreOrder ? "Chọn Warehouse Manager *" : "Chọn nhân viên kho *"}
              </Label>
              {isFetchingPickers ? (
                <div className="flex items-center justify-center p-3 border rounded-md">
                  <AlertCircle className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">
                    {isInStoreOrder
                      ? "Đang tải danh sách Warehouse Manager..."
                      : "Đang tải danh sách nhân viên kho..."}
                  </span>
                </div>
              ) : (
                <>
                  <select
                    id="picker"
                    value={selectedPicker}
                    onChange={(e) => setSelectedPicker(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">
                      {isInStoreOrder
                        ? "-- Chọn Warehouse Manager --"
                        : "-- Chọn nhân viên kho --"}
                    </option>
                    {pickers.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.fullName} - {p.email}
                      </option>
                    ))}
                  </select>
                  {pickers.length === 0 && (
                    <p className="text-sm text-yellow-600 flex items-center gap-2 mt-1">
                      <AlertCircle className="w-4 h-4" />
                      {isInStoreOrder
                        ? "Không có Warehouse Manager khả dụng"
                        : "Không có nhân viên kho khả dụng"}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Ghi chú */}
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú (tùy chọn)</Label>
            <Input
              id="note"
              placeholder="Nhập ghi chú nếu cần..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Cảnh báo không thể chuyển trạng thái */}
          {validTransitions.length === 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Không thể thay đổi giai đoạn từ{" "}
                <strong>{getStatusText(currentStage)}</strong>
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !newStatus || validTransitions.length === 0}
          >
            {isLoading ? "Đang xử lý..." : "Cập nhật"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderStatusUpdateDialog;
