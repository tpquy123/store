// ============================================
// FILE: frontend/src/pages/cashier/VATInvoicesPage.jsx
// ✅ RESPONSIVE: Full mobile/tablet/desktop support
// ============================================

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { toast } from "sonner";
import {
  Receipt,
  Search,
  Eye,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  FileText,
  Download,
  X,
} from "lucide-react";
import { formatPrice, formatDate } from "@/shared/lib/utils";
import { getInterFontStylesheetTag, getPrimaryFontStack } from "@/shared/lib/typography";
import { usePermission } from "@/features/auth";
import { posAPI } from "@/features/pos";

const VATInvoicesPage = () => {
  const canViewCrossStaffSales = usePermission(
    ["users.manage.branch", "users.manage.global", "analytics.read.branch", "analytics.read.global"],
    { mode: "any" },
  );

  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({ search: "" });

  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    totalVATInvoices: 0,
  });

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    total: 0,
  });

  useEffect(() => {
    fetchOrders(1);
  }, [filters]);

  const fetchOrders = async (page = 1) => {
    setIsLoading(true);
    try {
      const response = await posAPI.getHistory({
        search: filters.search || undefined,
        page,
        limit: 20,
      });

      const { orders = [], pagination: pag = {} } = response.data.data;

      setOrders(orders);
      setPagination({
        currentPage: pag.currentPage || 1,
        totalPages: pag.totalPages || 1,
        total: pag.total || 0,
      });

      const totalOrdersInPage = orders.length;
      const revenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
      const vatCount = orders.filter((o) => o.vatInvoice?.invoiceNumber).length;

      setStats({
        totalOrders: pag.total || 0,
        totalRevenue: revenue,
        avgOrderValue: totalOrdersInPage > 0 ? revenue / totalOrdersInPage : 0,
        totalVATInvoices: vatCount,
      });
    } catch (error) {
      console.error("Lỗi tải đơn hàng:", error);
      toast.error("Không thể tải lịch sử đơn hàng");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    setFilters({ search: searchInput });
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setFilters({ search: "" });
  };

  const handlePageChange = (newPage) => {
    if (
      newPage >= 1 &&
      newPage <= pagination.totalPages &&
      newPage !== pagination.currentPage
    ) {
      fetchOrders(newPage);
    }
  };

  const handleViewDetail = async (orderId) => {
    try {
      const response = await posAPI.getOrderById(orderId);
      setSelectedOrder(response.data.data.order);
      setShowDetailDialog(true);
    } catch (error) {
      console.error("Lỗi tải chi tiết:", error);
      toast.error("Không thể tải thông tin đơn hàng");
    }
  };

  const handleReprintReceipt = (order) => {
    const editableData = {
      customerName: order.shippingAddress?.fullName || "",
      customerPhone: order.shippingAddress?.phoneNumber || "",
      customerAddress: `${order.shippingAddress?.detailAddress || ""}, ${
        order.shippingAddress?.ward || ""
      }, ${order.shippingAddress?.province || ""}`.trim(),
      items: order.items,
      totalAmount: order.totalAmount,
      paymentReceived: order.posInfo?.paymentReceived || order.totalAmount,
      changeGiven: order.posInfo?.changeGiven || 0,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      staffName: order.posInfo?.staffName || "N/A",
      cashierName: order.posInfo?.cashierName || "Thu ngân",
    };

    const printWindow = window.open("", "", "width=800,height=1000");
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
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .items-start { align-items: flex-start; }
          .mb-3 { margin-bottom: 0.75rem; }
          .flex-1 { flex: 1; }
          .text-lg { font-size: 1.125rem; }
          .font-bold { font-weight: bold; }
          .mb-1 { margin-bottom: 0.25rem; }
          .text-xs { font-size: 0.75rem; }
          .leading-tight { line-height: 1.25; }
          .w-16 { width: 4rem; }
          .h-16 { height: 4rem; }
          .border { border-width: 1px; }
          .border-black { border-color: black; }
          .items-center { align-items: center; }
          .justify-center { justify-content: center; }
          .text-center { text-align: center; }
          .text-base { font-size: 1rem; }
          .space-y-0.5 > * + * { margin-top: 0.125rem; }
          .font-semibold { font-weight: 600; }
          .w-full { width: 100%; }
          .border-b { border-bottom-width: 1px; }
          .border-r { border-right-width: 1px; }
          .p-1.5 { padding: 0.375rem; }
          .text-left { text-align: left; }
          .text-right { text-align: right; }
          .w-32 { width: 8rem; }
          .w-24 { width: 6rem; }
          .text-gray-600 { color: #4b5563; }
          .p-2 { padding: 0.5rem; }
          .list-disc { list-style-type: disc; }
          .ml-4 { margin-left: 1rem; }
          .bg-yellow-50 { background-color: #fdfce5; }
          .my-2 { margin-top: 0.5rem; margin-bottom: 0.5rem; }
          .italic { font-style: italic; }
          .mb-12 { margin-bottom: 3rem; }
          .border-t { border-top-width: 1px; }
          .pt-2 { padding-top: 0.5rem; }
        </style>
      </head>
      <body>
        <div class="bg-white mx-auto">
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
          <div class="mb-3 space-y-0.5 text-xs">
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
                  <td class="border-r border-black p-1.5 text-center">${item.imei || "N/A"}</td>
                  <td class="p-1.5 text-right font-semibold">${formatPrice(item.price * item.quantity)}</td>
                </tr>
              `
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
            <div class="flex justify-between p-1.5 border-b border-black">
              <span class="font-bold">Tiền sản phẩm:</span>
              <span class="font-bold">${formatPrice(editableData.totalAmount)}</span>
            </div>
            <div class="flex justify-between p-1.5 border-b border-black">
              <span>Voucher:</span><span>0</span>
            </div>
            <div class="flex justify-between p-1.5 border-b border-black bg-yellow-50">
              <span class="font-bold">Thành tiền:</span>
              <span class="font-bold">${formatPrice(editableData.totalAmount)}</span>
            </div>
            <div class="flex justify-between p-1.5 border-b border-black">
              <span class="font-bold">Tiền đã đưa:</span>
              <span class="font-bold">${formatPrice(editableData.paymentReceived)}</span>
            </div>
            <div class="flex justify-between p-1.5">
              <span>Khoản vay còn lại:</span><span>0</span>
            </div>
          </div>
          <div class="text-center my-2">
            <p class="font-bold italic text-xs">CẢM ƠN QUÝ KHÁCH ĐÃ TIN TƯỞNG ỦNG HỘ Ninh Kiều iSTORE !!!</p>
          </div>
          <div class="flex justify-between mb-3">
            <div class="text-center text-xs">
              <p class="font-bold mb-12">NHÂN VIÊN</p>
              <p>${editableData.staffName}</p>
            </div>
            <div class="text-center text-xs">
              <p class="font-bold mb-12">KHÁCH HÀNG</p>
              <p>${editableData.customerName}</p>
            </div>
          </div>
          <div class="text-center border-t border-black pt-2">
            <p class="font-bold text-xs">BẢO HÀNH PHẦN CỨNG VÀ PHẦN MỀM TRONG 6 THÁNG (KHÔNG ĐỔI LỖI)</p>
            <p class="text-xs">Xem thêm các điều khoản bảo hành tại <span class="font-semibold">https://ninhkieu-istore-ct.onrender.com</span></p>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">
            Lịch sử bán hàng
          </h1>
          <p className="text-sm text-muted-foreground">
            {canViewCrossStaffSales
              ? "Xem tất cả đơn hàng trong hệ thống"
              : "Xem các đơn hàng đã xử lý"}
          </p>
        </div>

        {/* Search bar */}
        <div className="flex w-full sm:w-auto sm:max-w-sm items-center gap-2">
          <Input
            type="text"
            placeholder="Tìm mã đơn, phiếu, SĐT..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            className="flex-1 text-sm"
          />
          <Button onClick={handleSearch} size="icon" aria-label="Tìm kiếm">
            <Search className="w-4 h-4" />
          </Button>
          {filters.search && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearSearch}
              aria-label="Xóa tìm kiếm"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Stats Cards: 2 cột trên mobile, 4 cột trên md+ ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1 truncate">
                  Tổng đơn hàng
                </p>
                <h3 className="text-xl sm:text-2xl font-bold">
                  {stats.totalOrders}
                </h3>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full bg-blue-100 flex items-center justify-center ml-2">
                <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1 truncate">
                  Tổng doanh thu
                </p>
                <h3 className="text-base sm:text-xl font-bold truncate">
                  {formatPrice(stats.totalRevenue)}
                </h3>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full bg-green-100 flex items-center justify-center ml-2">
                <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1 truncate">
                  Giá trị TB/đơn
                </p>
                <h3 className="text-base sm:text-xl font-bold truncate">
                  {formatPrice(stats.avgOrderValue)}
                </h3>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full bg-purple-100 flex items-center justify-center ml-2">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1 truncate">
                  Hóa đơn VAT
                </p>
                <h3 className="text-xl sm:text-2xl font-bold">
                  {stats.totalVATInvoices}
                </h3>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full bg-orange-100 flex items-center justify-center ml-2">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Order List ── */}
      <Card>
        <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Receipt className="w-4 h-4 sm:w-5 sm:h-5" />
            Danh sách đơn hàng ({orders.length})
          </CardTitle>
        </CardHeader>

        <CardContent className="px-3 sm:px-6 pb-4">
          {isLoading ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground text-sm">Đang tải...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10">
              <Receipt className="w-14 h-14 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                {filters.search
                  ? "Không tìm thấy đơn hàng"
                  : "Không có đơn hàng nào"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order._id}
                  className="border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow"
                >
                  {/* Row 1: mã đơn + badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <div>
                      <p className="font-bold text-sm sm:text-base">
                        #{order.orderNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Phiếu: {order.posInfo?.receiptNumber || "N/A"}
                      </p>
                    </div>

                    {order.vatInvoice?.invoiceNumber && (
                      <Badge className="bg-green-100 text-green-800 text-xs">
                        <FileText className="w-3 h-3 mr-1" />
                        VAT
                      </Badge>
                    )}
                    <Badge
                      className={`text-xs ${
                        order.paymentStatus === "PAID"
                          ? "bg-green-100 text-green-800"
                          : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      {order.paymentStatus === "PAID"
                        ? "Đã thanh toán"
                        : "Chưa thanh toán"}
                    </Badge>
                  </div>

                  {/* Row 2: info grid */}
                  <div
                    className={`grid gap-x-3 gap-y-1 text-xs sm:text-sm mb-3 ${
                      canViewCrossStaffSales
                        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
                        : "grid-cols-2 sm:grid-cols-4"
                    }`}
                  >
                    {canViewCrossStaffSales && (
                      <div>
                        <p className="text-muted-foreground text-xs">
                          NV bán:
                        </p>
                        <p className="font-medium truncate">
                          {order.posInfo?.staffName || "N/A"}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Khách hàng:
                      </p>
                      <p className="font-medium truncate">
                        {order.shippingAddress?.fullName || "Khách lẻ"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Thời gian:
                      </p>
                      <p className="font-medium">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Số lượng:
                      </p>
                      <p className="font-medium">{order.items.length} SP</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Tổng tiền:
                      </p>
                      <p className="font-bold text-primary">
                        {formatPrice(order.totalAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Row 3: action buttons — full width trên mobile */}
                  <div className="flex flex-col xs:flex-row gap-2 sm:flex-row">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none text-xs sm:text-sm"
                      onClick={() => handleViewDetail(order._id)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      Chi tiết
                    </Button>
                    {order.paymentStatus === "PAID" && (
                      <Button
                        size="sm"
                        className="flex-1 sm:flex-none text-xs sm:text-sm"
                        onClick={() => handleReprintReceipt(order)}
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        In lại
                      </Button>
                    )}
                  </div>
                </div>
              ))}
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
              <span className="text-xs sm:text-sm font-medium min-w-[100px] text-center">
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

      {/* ── Detail Dialog ── */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-base sm:text-lg">
              Chi tiết đơn hàng
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {selectedOrder?.orderNumber}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-5">
              {/* Order info + Customer info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 sm:p-4 bg-muted/50 rounded-lg text-sm">
                <div>
                  <h3 className="font-semibold mb-2 text-sm">
                    Thông tin đơn hàng
                  </h3>
                  <div className="space-y-1 text-xs sm:text-sm">
                    <p>
                      <strong>Mã đơn:</strong> #{selectedOrder.orderNumber}
                    </p>
                    <p>
                      <strong>Số phiếu:</strong>{" "}
                      {selectedOrder.posInfo?.receiptNumber || "N/A"}
                    </p>
                    <p>
                      <strong>Thời gian:</strong>{" "}
                      {formatDate(selectedOrder.createdAt)}
                    </p>
                    {canViewCrossStaffSales && (
                      <p>
                        <strong>NV bán:</strong>{" "}
                        {selectedOrder.posInfo?.staffName || "N/A"}
                      </p>
                    )}
                    <p>
                      <strong>Thu ngân:</strong>{" "}
                      {selectedOrder.posInfo?.cashierName || "N/A"}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-sm">
                    Thông tin khách hàng
                  </h3>
                  <div className="space-y-1 text-xs sm:text-sm">
                    <p>
                      <strong>Họ tên:</strong>{" "}
                      {selectedOrder.shippingAddress?.fullName || "Khách lẻ"}
                    </p>
                    <p>
                      <strong>SĐT:</strong>{" "}
                      {selectedOrder.shippingAddress?.phoneNumber || "N/A"}
                    </p>
                    {selectedOrder.vatInvoice?.invoiceNumber && (
                      <Badge className="bg-green-100 text-green-800 mt-2 text-xs">
                        Đã xuất VAT: {selectedOrder.vatInvoice.invoiceNumber}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Products */}
              <div>
                <h3 className="font-semibold mb-2 text-sm">Sản phẩm</h3>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex gap-3 p-3 border rounded-lg"
                    >
                      <img
                        src={item.images?.[0] || "/placeholder.png"}
                        alt={item.productName}
                        className="w-14 h-14 sm:w-20 sm:h-20 object-cover rounded shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.productName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[
                            item.variantColor,
                            item.variantStorage,
                            item.variantConnectivity,
                            item.variantName,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                        <p className="text-xs mt-1">
                          SL: {item.quantity} × {formatPrice(item.price)}
                        </p>
                      </div>
                      <p className="font-bold text-sm shrink-0">
                        {formatPrice(item.total)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment summary */}
              <div className="border-t pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Tổng tiền:</span>
                  <span className="font-bold">
                    {formatPrice(selectedOrder.totalAmount)}
                  </span>
                </div>
                {selectedOrder.paymentStatus === "PAID" && (
                  <>
                    <div className="flex justify-between">
                      <span>Tiền khách đưa:</span>
                      <span>
                        {formatPrice(
                          selectedOrder.posInfo.paymentReceived ||
                            selectedOrder.totalAmount
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>Tiền thối lại:</span>
                      <span className="font-bold">
                        {formatPrice(selectedOrder.posInfo.changeGiven || 0)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              {selectedOrder.paymentStatus === "PAID" && (
                <Button
                  className="w-full"
                  onClick={() => handleReprintReceipt(selectedOrder)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  In lại phiếu thu
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VATInvoicesPage;
