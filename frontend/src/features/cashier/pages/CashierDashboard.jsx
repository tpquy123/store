// ============================================
// FILE: frontend/src/pages/cashier/CASHIERDashboard.jsx
// ✅ RESPONSIVE + Hiển thị ảnh sản phẩm
// ============================================

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { posAPI } from "@/features/pos";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  DollarSign,
  Clock,
  User,
  FileText,
  RefreshCw,
  Package,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatPrice, formatDate } from "@/shared/lib/utils";
import { getInterFontStylesheetTag, getPrimaryFontStack } from "@/shared/lib/typography";
import { EditInvoiceDialog } from "@/features/pos";

const getDeviceIdentifierText = (item = {}) => {
  const assignments = Array.isArray(item.deviceAssignments) ? item.deviceAssignments : [];
  const assignmentIdentifiers = assignments
    .map((entry) => entry?.imei || entry?.serialNumber || "")
    .filter(Boolean);
  if (assignmentIdentifiers.length > 0) {
    return assignmentIdentifiers.join(" / ");
  }
  return item.imei || item.serialNumber || "N/A";
};

const CASHIERDashboard = () => {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showVATDialog, setShowVATDialog] = useState(false);
  const [paymentReceived, setPaymentReceived] = useState("");
  const [vatForm, setVatForm] = useState({
    companyName: "",
    taxCode: "",
    companyAddress: "",
  });
  const [showEditInvoice, setShowEditInvoice] = useState(false);
  const [orderToPrint, setOrderToPrint] = useState(null);
  // Track which orders have expanded product list
  const [expandedOrders, setExpandedOrders] = useState({});
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    total: 0,
  });

  useEffect(() => {
    fetchPendingOrders(1);
    const interval = setInterval(() => fetchPendingOrders(1), 10000);
    return () => clearInterval(interval);
  }, []);

  const handlePageChange = (newPage) => {
    if (
      newPage >= 1 &&
      newPage <= pagination.totalPages &&
      newPage !== pagination.currentPage
    ) {
      fetchPendingOrders(newPage);
    }
  };

  const fetchPendingOrders = async (page = 1) => {
    try {
      setIsLoading(true);
      const response = await posAPI.getPendingOrders({ page, limit: 20 });
      const { orders = [], pagination: pag = {} } = response.data.data;
      setPendingOrders(orders);
      setPagination({
        currentPage: pag.currentPage || 1,
        totalPages: pag.totalPages || 1,
        total: pag.total || 0,
      });
    } catch (error) {
      console.error("Lỗi tải đơn:", error);
      toast.error("Không thể tải danh sách đơn chờ");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPayment = (order) => {
    setSelectedOrder(order);
    setPaymentReceived(order.totalAmount.toString());
    setShowPaymentDialog(true);
  };

  const handleNavigateToEditInvoice = () => {
    const received = parseFloat(paymentReceived);
    if (!received || received < selectedOrder.totalAmount) {
      toast.error("Số tiền thanh toán không đủ");
      return;
    }
    const orderWithPaymentInfo = {
      ...selectedOrder,
      posInfo: {
        ...selectedOrder.posInfo,
        paymentReceived: received,
        changeGiven: received - selectedOrder.totalAmount,
      },
      items: selectedOrder.items.map((item) => ({
        ...item,
        imei: item.imei || "",
        serialNumber: item.serialNumber || "",
        deviceAssignments: Array.isArray(item.deviceAssignments)
          ? item.deviceAssignments
          : [],
      })),
    };
    setOrderToPrint(orderWithPaymentInfo);
    setShowPaymentDialog(false);
    setShowEditInvoice(true);
  };

  const handleConfirmPaymentAndFinalize = async (editableData) => {
    setIsLoading(true);
    try {
      await posAPI.processPayment(selectedOrder._id, {
        paymentReceived: parseFloat(editableData.paymentReceived),
      });
      await posAPI.finalizeOrder(selectedOrder._id, {
        items: editableData.items,
        customerInfo: {
          name: editableData.customerName,
          phone: editableData.customerPhone,
          address: editableData.customerAddress,
        },
      });
      toast.success("Thanh toán và lưu đơn hàng thành công!");
      fetchPendingOrders(pagination.currentPage);
      const finalizedOrder = {
        ...orderToPrint,
        ...editableData,
        _id: selectedOrder._id,
        createdAt: new Date(),
      };
      setOrderToPrint(finalizedOrder);
      return true;
    } catch (error) {
      console.error("Lỗi xử lý thanh toán:", error);
      toast.error(error.response?.data?.message || "Xử lý thanh toán thất bại");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintInvoice = async (editableData) => {
    try {
      const primaryFontStack = getPrimaryFontStack();
      const invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Hóa đơn - ${editableData.orderNumber}</title>
        ${getInterFontStylesheetTag()}
        <style>
          @page { size: A4; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          :root { --font-primary: ${primaryFontStack}; }
          body { font-family: var(--font-primary); width: 210mm; margin: 0 auto; padding: 15mm 15mm; font-size: 11px; line-height: 1.3; }
          .flex { display: flex; } .justify-between { justify-content: space-between; }
          .items-start { align-items: flex-start; } .mb-3 { margin-bottom: 0.75rem; }
          .flex-1 { flex: 1; } .text-lg { font-size: 1.125rem; } .font-bold { font-weight: bold; }
          .mb-1 { margin-bottom: 0.25rem; } .text-xs { font-size: 0.75rem; }
          .leading-tight { line-height: 1.25; } .w-16 { width: 4rem; } .h-16 { height: 4rem; }
          .border { border-width: 1px; } .border-black { border-color: black; }
          .items-center { align-items: center; } .justify-center { justify-content: center; }
          .text-center { text-align: center; } .text-base { font-size: 1rem; }
          .font-semibold { font-weight: 600; } .w-full { width: 100%; }
          .border-b { border-bottom-width: 1px; } .border-r { border-right-width: 1px; }
          .p-1\.5 { padding: 0.375rem; } .text-left { text-align: left; }
          .text-right { text-align: right; } .w-32 { width: 8rem; } .w-24 { width: 6rem; }
          .text-gray-600 { color: #4b5563; } .p-2 { padding: 0.5rem; }
          .list-disc { list-style-type: disc; } .ml-4 { margin-left: 1rem; }
          .bg-yellow-50 { background-color: #fdfce5; } .my-2 { margin-top: 0.5rem; margin-bottom: 0.5rem; }
          .italic { font-style: italic; } .mb-12 { margin-bottom: 3rem; }
          .border-t { border-top-width: 1px; } .pt-2 { padding-top: 0.5rem; }
        </style>
      </head>
      <body>
        <div>
          <div class="flex justify-between items-start mb-3">
            <div class="flex-1">
              <h1 class="text-lg font-bold mb-1">Ninh Kiều iSTORE</h1>
              <p class="text-xs leading-tight">Số 58 Đường 3 Tháng 2 - Phường Xuân Khánh - Quận Ninh Kiều, Cần Thơ</p>
              <p class="text-xs">Hotline: 0917.755.765 - Khánh sửa: 0981.774.710</p>
            </div>
            <div class="w-16 h-16 border border-black flex items-center justify-center"></div>
          </div>
          <div class="text-center mb-3">
            <h2 class="text-base font-bold">HÓA ĐƠN BÁN HÀNG KIÊM PHIẾU BẢO HÀNH</h2>
            <p class="text-xs">Ngày lúc ${formatDate(editableData.createdAt)}</p>
          </div>
          <div class="mb-3 text-xs">
            <p><span class="font-semibold">Tên khách hàng:</span> ${editableData.customerName}</p>
            <p><span class="font-semibold">Địa chỉ:</span> ${editableData.customerAddress}</p>
            <p><span class="font-semibold">Số điện thoại:</span> ${editableData.customerPhone}</p>
          </div>
          <table class="w-full border border-black mb-3 text-xs">
            <thead>
              <tr class="border-b border-black">
                <th class="border-r border-black p-1.5 text-left font-bold">TÊN MÁY</th>
                <th class="border-r border-black p-1.5 text-center font-bold w-32">IMEI</th>
                <th class="p-1.5 text-right font-bold w-24">ĐƠN GIÁ</th>
              </tr>
            </thead>
            <tbody>
              ${editableData.items
                .map(
                  (item) => `
                <tr class="border-b border-black">
                  <td class="border-r border-black p-1.5">
                    <div>${item.productName}</div>
                    <div class="text-gray-600">${item.variantColor}${item.variantStorage ? ` - ${item.variantStorage}` : ""}</div>
                  </td>
                  <td class="border-r border-black p-1.5 text-center">${getDeviceIdentifierText(item)}</td>
                  <td class="p-1.5 text-right font-semibold">${formatPrice(item.price * item.quantity)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
          <div class="border border-black p-2 mb-3 text-xs">
            <p class="font-bold mb-1">GÓI BẢO HÀNH CƠ BẢN Ninh Kiều iSTORE Care</p>
            <p class="font-bold mb-1">LƯU Ý NHỮNG TRƯỜNG HỢP KHÔNG ĐƯỢC BẢO HÀNH</p>
            <ul class="list-disc ml-4 leading-tight">
              <li>Mất tem máy, rách tem</li>
              <li>Kiểm tra màn hình (trường hợp màn sọc mực, đen màn, lỗi màn hình khi ra khỏi shop sẽ không bảo hành)</li>
              <li>Máy bị phơi đơm theo giấy bảo hành KHÔNG có hữu trách nhiệm tài khoản icloud</li>
              <li>Máy rơi/va đụp, máy trả góp shop không bỏ trợ bảo an tiền</li>
            </ul>
          </div>
          <div class="border border-black text-xs mb-3">
            <div class="flex justify-between p-1.5 border-b border-black"><span class="font-bold">Tiền sản phẩm:</span><span class="font-bold">${formatPrice(editableData.totalAmount)}</span></div>
            <div class="flex justify-between p-1.5 border-b border-black"><span>Voucher:</span><span>0</span></div>
            <div class="flex justify-between p-1.5 border-b border-black bg-yellow-50"><span class="font-bold">Thành tiền:</span><span class="font-bold">${formatPrice(editableData.totalAmount)}</span></div>
            <div class="flex justify-between p-1.5 border-b border-black"><span class="font-bold">Tiền đã đưa:</span><span class="font-bold">${formatPrice(editableData.paymentReceived)}</span></div>
            <div class="flex justify-between p-1.5"><span>Khoản vay còn lại:</span><span>0</span></div>
          </div>
          <div class="text-center my-2">
            <p class="font-bold italic text-xs">CẢM ƠN QUÝ KHÁCH ĐÃ TIN TƯỞNG ỦNG HỘ Ninh Kiều iSTORE !!!</p>
          </div>
          <div class="flex justify-between mb-3">
            <div class="text-center text-xs"><p class="font-bold mb-12">NHÂN VIÊN</p><p>${editableData.staffName}</p></div>
            <div class="text-center text-xs"><p class="font-bold mb-12">KHÁCH HÀNG</p><p>${editableData.customerName}</p></div>
          </div>
          <div class="text-center text-xs border-t border-black pt-2">
            <p class="font-bold">BẢO HÀNH PHẦN CỨNG VÀ PHẦN MỀM TRONG 6 THÁNG (KHÔNG ĐỔI LỖI)</p>
            <p>Xem thêm các điều khoản bảo hành tại <span class="font-semibold">https://warranty-h1wg.onrender.com</span></p>
          </div>
        </div>
      </body>
      </html>`;

      const printWindow = window.open("", "", "width=800,height=1000");
      if (!printWindow) {
        toast.error("Không thể mở cửa sổ in. Vui lòng kiểm tra popup blocker.");
        return;
      }
      printWindow.document.write(invoiceHTML);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        setShowEditInvoice(false);
      }, 500);
    } catch (error) {
      console.error("Print Error:", error);
      toast.error("Lỗi khi mở cửa sổ in");
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!confirm("Bạn có chắc muốn hủy đơn này?")) return;
    const reason = prompt("Lý do hủy đơn:");
    if (!reason) return;
    try {
      await posAPI.cancelOrder(orderId, { reason });
      toast.success("Đã hủy đơn hàng");
      fetchPendingOrders(pagination.currentPage);
    } catch (error) {
      toast.error(error.response?.data?.message || "Hủy đơn thất bại");
    }
  };

  const handleOpenVAT = (order) => {
    setSelectedOrder(order);
    setVatForm({ companyName: "", taxCode: "", companyAddress: "" });
    setShowVATDialog(true);
  };

  const handleIssueVAT = async () => {
    if (!vatForm.companyName || !vatForm.taxCode) {
      toast.error("Vui lòng nhập đầy đủ thông tin công ty");
      return;
    }
    try {
      await posAPI.issueVAT(selectedOrder._id, vatForm);
      toast.success("Xuất hóa đơn VAT thành công!");
      setShowVATDialog(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Xuất hóa đơn thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  const getTodayOrdersCount = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return pendingOrders.filter((order) => {
      const d = new Date(order.createdAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    }).length;
  };

  const toggleExpand = (orderId) => {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">
            Xử lý thanh toán
          </h1>
          <p className="text-sm text-muted-foreground">
            Đơn hàng chờ thanh toán từ POS
          </p>
        </div>
        <Button
          onClick={() => fetchPendingOrders(pagination.currentPage)}
          variant="outline"
          size="sm"
          className="self-start sm:self-auto"
          disabled={isLoading}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
          />
          Làm mới
        </Button>
      </div>

      {/* ── Stats: full-width trên mobile, 3 cột trên md ── */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1 leading-tight">
                  Chờ xử lý
                </p>
                <h3 className="text-2xl sm:text-3xl font-bold">
                  {pagination.total}
                </h3>
              </div>
              <div className="w-9 h-9 sm:w-12 sm:h-12 shrink-0 rounded-full bg-orange-100 flex items-center justify-center ml-2">
                <Clock className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1 leading-tight">
                  Tổng giá trị
                </p>
                <h3 className="text-sm sm:text-2xl font-bold truncate">
                  {formatPrice(
                    pendingOrders.reduce((sum, o) => sum + o.totalAmount, 0),
                  )}
                </h3>
              </div>
              <div className="w-9 h-9 sm:w-12 sm:h-12 shrink-0 rounded-full bg-green-100 flex items-center justify-center ml-2">
                <DollarSign className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1 leading-tight">
                  Đơn hôm nay
                </p>
                <h3 className="text-2xl sm:text-3xl font-bold">
                  {getTodayOrdersCount()}
                </h3>
              </div>
              <div className="w-9 h-9 sm:w-12 sm:h-12 shrink-0 rounded-full bg-blue-100 flex items-center justify-center ml-2">
                <FileText className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Order List ── */}
      <Card>
        <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
            Đơn hàng chờ thanh toán
          </CardTitle>
        </CardHeader>

        <CardContent className="px-3 sm:px-6 pb-4">
          {pendingOrders.length === 0 ? (
            <div className="text-center py-10 sm:py-12">
              <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 text-green-600" />
              <p className="text-lg sm:text-xl font-semibold mb-1">
                Không có đơn chờ xử lý
              </p>
              <p className="text-sm text-muted-foreground">
                Tất cả đơn hàng đã được thanh toán
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingOrders.map((order) => {
                const isExpanded = expandedOrders[order._id];
                const visibleItems = isExpanded
                  ? order.items
                  : order.items.slice(0, 2);
                const hasMore = order.items.length > 2;

                return (
                  <Card
                    key={order._id}
                    className="border-2 border-orange-200 bg-orange-50/30 overflow-hidden"
                  >
                    <CardContent className="p-3 sm:p-4">
                      {/* ── Top: badges + mã đơn + thời gian ── */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <Badge className="bg-orange-500 text-white text-xs shrink-0">
                          CHỜ TT
                        </Badge>
                        <span className="font-bold text-sm sm:text-base">
                          {order.orderNumber}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDate(order.createdAt)}
                        </span>
                      </div>

                      {/* ── Info grid ── */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-3 text-xs sm:text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Nhân viên
                          </p>
                          <p className="font-medium flex items-center gap-1 truncate">
                            <User className="w-3 h-3 shrink-0" />
                            {order.posInfo.staffName}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Khách hàng
                          </p>
                          <p className="font-medium truncate">
                            {order.shippingAddress.fullName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.shippingAddress.phoneNumber}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Số lượng
                          </p>
                          <p className="font-medium">{order.items.length} SP</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Tổng tiền
                          </p>
                          <p className="text-base sm:text-xl font-bold text-primary">
                            {formatPrice(order.totalAmount)}
                          </p>
                        </div>
                      </div>

                      {/* ── Product list with images ── */}
                      <div className="border-t border-orange-200 pt-3 mb-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          Sản phẩm
                        </p>

                        <div className="space-y-2">
                          {visibleItems.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-3 bg-white rounded-lg border border-orange-100 p-2"
                            >
                              {/* Product image */}
                              <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
                                {item.images?.[0] ? (
                                  <img
                                    src={item.images[0]}
                                    alt={item.productName}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.target.style.display = "none";
                                      e.target.nextSibling.style.display =
                                        "flex";
                                    }}
                                  />
                                ) : null}
                                <div
                                  className="w-full h-full items-center justify-center text-gray-300"
                                  style={{
                                    display: item.images?.[0] ? "none" : "flex",
                                  }}
                                >
                                  <Package className="w-6 h-6" />
                                </div>
                              </div>

                              {/* Product info */}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-xs sm:text-sm leading-tight truncate">
                                  {item.productName}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {[
                                    item.variantColor,
                                    item.variantStorage,
                                    item.variantConnectivity,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                                {getDeviceIdentifierText(item) !== "N/A" && (
                                  <p className="text-xs text-blue-600 font-mono mt-0.5">
                                    ID: {getDeviceIdentifierText(item)}
                                  </p>
                                )}
                              </div>

                              {/* Price */}
                              <div className="text-right shrink-0">
                                <p className="font-bold text-xs sm:text-sm text-primary">
                                  {formatPrice(item.price * item.quantity)}
                                </p>
                                {item.quantity > 1 && (
                                  <p className="text-xs text-muted-foreground">
                                    x{item.quantity}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Expand/collapse */}
                        {hasMore && (
                          <button
                            onClick={() => toggleExpand(order._id)}
                            className="mt-2 w-full flex items-center justify-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium py-1 rounded-md hover:bg-orange-50 transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-3 h-3" />
                                Thu gọn
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3 h-3" />
                                Xem thêm {order.items.length - 2} sản phẩm
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* ── Action buttons: stack trên mobile, row trên sm+ ── */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          onClick={() => handleOpenPayment(order)}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-sm"
                          size="sm"
                        >
                          <DollarSign className="w-4 h-4 mr-1.5" />
                          Thanh toán
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 sm:flex-none text-sm border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => handleCancelOrder(order._id)}
                        >
                          <XCircle className="w-4 h-4 mr-1.5" />
                          Hủy đơn
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.currentPage === 1 || isLoading}
                onClick={() => handlePageChange(pagination.currentPage - 1)}
              >
                Trước
              </Button>
              <span className="text-xs sm:text-sm font-medium text-muted-foreground min-w-[100px] text-center">
                Trang {pagination.currentPage} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  pagination.currentPage === pagination.totalPages || isLoading
                }
                onClick={() => handlePageChange(pagination.currentPage + 1)}
              >
                Sau
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Payment Dialog ── */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              Xử lý thanh toán
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Đơn hàng: {selectedOrder?.orderNumber}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Tổng tiền</p>
                <p className="text-2xl sm:text-3xl font-bold text-primary">
                  {formatPrice(selectedOrder.totalAmount)}
                </p>
              </div>

              <div>
                <Label htmlFor="paymentReceived" className="text-sm">
                  Tiền khách đưa *
                </Label>
                <Input
                  id="paymentReceived"
                  type="number"
                  value={paymentReceived}
                  onChange={(e) => setPaymentReceived(e.target.value)}
                  placeholder="0"
                  className="text-lg font-bold mt-1"
                />
              </div>

              {paymentReceived && (
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">
                    Tiền thối lại
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatPrice(
                      Math.max(0, paymentReceived - selectedOrder.totalAmount),
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setShowPaymentDialog(false)}
            >
              Hủy
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleNavigateToEditInvoice}
              disabled={isLoading}
            >
              Chỉnh sửa hóa đơn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── VAT Dialog ── */}
      <Dialog open={showVATDialog} onOpenChange={setShowVATDialog}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              Xuất hóa đơn VAT
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Đơn hàng: {selectedOrder?.orderNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4">
            <div>
              <Label htmlFor="companyName" className="text-sm">
                Tên công ty *
              </Label>
              <Input
                id="companyName"
                placeholder="Công ty TNHH ABC"
                value={vatForm.companyName}
                onChange={(e) =>
                  setVatForm({ ...vatForm, companyName: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="taxCode" className="text-sm">
                Mã số thuế *
              </Label>
              <Input
                id="taxCode"
                placeholder="0123456789"
                value={vatForm.taxCode}
                onChange={(e) =>
                  setVatForm({ ...vatForm, taxCode: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="companyAddress" className="text-sm">
                Địa chỉ
              </Label>
              <Input
                id="companyAddress"
                placeholder="123 Đường ABC..."
                value={vatForm.companyAddress}
                onChange={(e) =>
                  setVatForm({ ...vatForm, companyAddress: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setShowVATDialog(false)}
            >
              Hủy
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleIssueVAT}
              disabled={isLoading}
            >
              {isLoading ? "Đang xuất..." : "Xuất hóa đơn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditInvoiceDialog
        open={showEditInvoice}
        onOpenChange={setShowEditInvoice}
        order={orderToPrint}
        onPrint={handlePrintInvoice}
        onConfirmPayment={handleConfirmPaymentAndFinalize}
        isLoading={isLoading}
      />
    </div>
  );
};

export default CASHIERDashboard;
