import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { formatPrice, formatDate, getStatusColor, getStatusStage, getStatusText } from "@/shared/lib/utils";
import { MapPin, User, Phone, Truck, Clock, Package, GitBranch, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

const toTrimmedString = (value) => String(value || "").trim();

const getReturnReasonFromStatusHistory = (statusHistory) => {
  if (!Array.isArray(statusHistory)) return "";

  for (let i = statusHistory.length - 1; i >= 0; i -= 1) {
    const entry = statusHistory[i];
    const status = toTrimmedString(entry?.status).toUpperCase();
    const note = toTrimmedString(entry?.note);

    if (!note) continue;
    if (status === "RETURNED") return note;
  }

  return "";
};

const OrderDetailDialog = ({
  order,
  open,
  onClose,
  isGlobalAdmin = false,
  stores = [],
  onReassignStore = null,
  isAssigning = false,
}) => {
  if (!order) return null;
  const stage = order.statusStage || getStatusStage(order.status);
  const isReturnedOrder = toTrimmedString(order?.status).toUpperCase() === "RETURNED";
  const returnReasonFromHistory = getReturnReasonFromStatusHistory(order?.statusHistory);
  const shipperDeliveryNoteDisplay =
    toTrimmedString(order?.shipperInfo?.deliveryNote) ||
    returnReasonFromHistory ||
    (isReturnedOrder ? toTrimmedString(order?.note || order?.notes) : "");
  const shippedByDisplayName =
    order?.shippedByInfo?.shippedByName || order?.pickerInfo?.pickerName || "";
  const shippedAtDisplay =
    order?.shippedByInfo?.shippedAt || order?.pickerInfo?.pickedAt || null;
  const shippedNoteDisplay =
    order?.shippedByInfo?.shippedNote || order?.pickerInfo?.note || "";
  const shippedItems = Array.isArray(order?.shippedByInfo?.items)
    ? order.shippedByInfo.items
    : [];
  const hasShippedByInfo = Boolean(
    shippedByDisplayName || shippedAtDisplay || shippedNoteDisplay || shippedItems.length > 0
  );

  const getImageUrl = (path) => {
    if (!path) return "https://via.placeholder.com/100?text=No+Image";
    if (path.startsWith("http")) return path;
    const baseUrl = String(import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "");
    return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  };

  const canUpdateOrderStatus = (order) => {
    const nonEditableStages = ["CANCELLED", "RETURNED", "DELIVERED"];
    return !nonEditableStages.includes(stage);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Chi tiết đơn hàng #{order.orderNumber}</DialogTitle>
            {isGlobalAdmin && canUpdateOrderStatus(order) && (
              <div className="flex items-center gap-2">
                <div className="w-48">
                  <Select
                    disabled={isAssigning || stores.length === 0}
                    onValueChange={(value) => onReassignStore?.(order._id, value)}
                    value={
                      order.assignedStore?.storeId
                        ? String(order.assignedStore.storeId)
                        : ""
                    }
                  >
                    <SelectTrigger className="h-9 border-blue-200 bg-blue-50/50 hover:bg-blue-50 transition-colors">
                      <div className="flex items-center gap-2 truncate">
                        <GitBranch className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <SelectValue
                          placeholder={
                            stores.length === 0 ? "Đang tải..." : "Chuyển chi nhánh"
                          }
                        />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isAssigning && <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <Badge className={getStatusColor(stage)}>
              {getStatusText(stage)}
            </Badge>
            {order.status && stage !== order.status && (
              <Badge variant="outline">
                Trạng thái chi tiết: {getStatusText(order.status)}
              </Badge>
            )}
            {order.paymentMethod === "VNPAY" && order.paymentInfo?.vnpayVerified && (
              <Badge className="bg-green-100 text-green-800">
                Đã thanh toán VNPay
              </Badge>
            )}
          </div>

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 text-sm space-y-1">
            <p>
              <strong>Hình thức nhận:</strong>{" "}
              {getStatusText(order.fulfillmentType || "HOME_DELIVERY")}
            </p>
            {order.assignedStore?.storeName && (
              <p>
                <strong>Cửa hàng xử lý:</strong> {order.assignedStore.storeName}
              </p>
            )}
            {order.pickupInfo?.pickupCode && (
              <p>
                <strong>Mã nhận hàng:</strong> {order.pickupInfo.pickupCode}
              </p>
            )}
          </div>

          {/* Products */}
          <div>
            <h3 className="font-semibold mb-3">Sản phẩm trong đơn</h3>
            <div className="space-y-3">
              {order.items?.map((item, idx) => (
                <div key={idx} className="flex gap-4 p-4 border rounded-lg">
                  <img
                    src={getImageUrl(item.images?.[0])}
                    alt={item.productName}
                    className="w-20 h-20 object-cover rounded"
                    onError={(e) => {
                      e.target.src = "/placeholder.png";
                    }}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        item.variantColor,
                        item.variantStorage,
                        item.variantConnectivity,
                        item.variantName,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                    <p className="text-sm">
                      SL: {item.quantity} × {formatPrice(item.price)}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping/Pickup Info */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {order.fulfillmentType === "CLICK_AND_COLLECT"
                ? "Thông tin nhận tại cửa hàng"
                : "Địa chỉ giao hàng"}
            </h3>
            {order.fulfillmentType === "CLICK_AND_COLLECT" ? (
              <>
                <p>
                  {order.assignedStore?.storeName || "Chưa gán cửa hàng"} -{" "}
                  {order.assignedStore?.storePhone || "N/A"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {order.assignedStore?.storeAddress || "N/A"}
                </p>
              </>
            ) : (
              <>
                <p>
                  {order.shippingAddress?.fullName} - {order.shippingAddress?.phoneNumber}
                </p>
                <p className="text-sm text-muted-foreground">
                  {order.shippingAddress?.detailAddress}, {order.shippingAddress?.ward}, {order.shippingAddress?.province}
                </p>
              </>
            )}
          </div>

          {/* ✅ NEW: Shipper Info */}
          {order.shipperInfo && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold mb-2 flex items-center gap-2 text-blue-800">
                <Truck className="w-4 h-4" />
                Thông tin người giao hàng
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span><strong>Shipper:</strong> {order.shipperInfo.shipperName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span><strong>SĐT:</strong> {order.shipperInfo.shipperPhone}</span>
                </div>
                {order.shipperInfo.pickupAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span><strong>Nhận hàng:</strong> {formatDate(order.shipperInfo.pickupAt)}</span>
                  </div>
                )}
                {order.shipperInfo.deliveredAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span><strong>Giao hàng:</strong> {formatDate(order.shipperInfo.deliveredAt)}</span>
                  </div>
                )}
                {shipperDeliveryNoteDisplay && (
                  <p className="mt-2 p-2 bg-white rounded border">
                    <strong>Ghi chú:</strong> {shipperDeliveryNoteDisplay}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ✅ NEW: Warehouse Picker Info */}
          {hasShippedByInfo && (
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <h3 className="font-semibold mb-2 flex items-center gap-2 text-amber-800">
                <Package className="w-4 h-4" />
                Thông tin người xuất kho
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>
                    <strong>Người xuất kho:</strong>{" "}
                    {shippedByDisplayName || "N/A"}
                  </span>
                </div>
                {shippedAtDisplay && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>
                      <strong>Thời gian xuất:</strong>{" "}
                      {formatDate(shippedAtDisplay)}
                    </span>
                  </div>
                )}
                {shippedNoteDisplay && (
                  <p className="mt-2 p-2 bg-white rounded border">
                    <strong>Ghi chú xuất kho:</strong> {shippedNoteDisplay}
                  </p>
                )}
                {shippedItems.length > 0 && (
                    <div className="mt-3">
                      <p className="font-medium text-amber-900 mb-2">
                        Danh sách sản phẩm đã xuất
                      </p>
                      <div className="space-y-1">
                        {shippedItems.map((item, idx) => (
                          <div
                            key={`${item?.sku || "sku"}-${item?.locationCode || "loc"}-${idx}`}
                            className="grid grid-cols-12 gap-2 p-2 bg-white rounded border text-xs sm:text-sm"
                          >
                            <span className="col-span-5 truncate">
                              <strong>SKU:</strong> {item?.sku || "N/A"}
                            </span>
                            <span className="col-span-3">
                              <strong>SL:</strong> {item?.quantity || 0}
                            </span>
                            <span className="col-span-4 truncate">
                              <strong>Vị trí:</strong> {item?.locationCode || "N/A"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* VNPay Payment Info */}
          {order.paymentMethod === "VNPAY" && order.paymentInfo?.vnpayTransactionNo && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h3 className="font-semibold mb-2 text-green-800">
                Thông tin thanh toán VNPay
              </h3>
              <div className="space-y-1 text-sm">
                <p><strong>Mã giao dịch:</strong> {order.paymentInfo.vnpayTransactionNo}</p>
                <p><strong>Ngân hàng:</strong> {order.paymentInfo.vnpayBankCode || "Không rõ"}</p>
                <p><strong>Thời gian thanh toán:</strong> {formatDate(order.paymentInfo.vnpayPaidAt)}</p>
                <p><strong>Trạng thái:</strong> <span className="text-green-700 font-medium">Đã xác nhận</span></p>
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between">
              <span>Tạm tính:</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Phí vận chuyển:</span>
              <span>{formatPrice(order.shippingFee)}</span>
            </div>
            {order.promotionDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Giảm giá:</span>
                <span>-{formatPrice(order.promotionDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Tổng:</span>
              <span className="text-primary">
                {formatPrice(order.totalAmount)}
              </span>
            </div>
          </div>

          {/* POS Info */}
          {order.posInfo && (
            <div className="p-4 bg-blue-50 rounded-lg text-sm">
              <p><strong>Nhân viên tạo:</strong> {order.posInfo.staffName}</p>
              {order.posInfo.cashierName && (
                <p><strong>Thu ngân:</strong> {order.posInfo.cashierName}</p>
              )}
              {order.posInfo.paymentReceived && (
                <>
                  <p><strong>Tiền khách đưa:</strong> {formatPrice(order.posInfo.paymentReceived)}</p>
                  <p><strong>Tiền thối:</strong> {formatPrice(order.posInfo.changeGiven || 0)}</p>
                </>
              )}
              {order.posInfo.receiptNumber && (
                <p><strong>Số phiếu:</strong> {order.posInfo.receiptNumber}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailDialog;
