// ============================================
// FILE: frontend/src/pages/order-manager/OrderManagementPage.jsx
// Enhanced Order Management Page with improved UI and responsiveness
// ============================================

import React, { useState, useEffect } from "react";
import {
  Package,
  Search,
  Filter,
  Eye,
  Pencil,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  CreditCard,
  User,
  Phone,
  Calendar,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useAuthStore } from "@/features/auth";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { toast } from "sonner";
import { orderAPI } from "../api/orders.api";
import { storeAPI } from "@/features/stores";
import { getStatusColor, getStatusStage, getStatusText } from "@/shared/lib/utils";
import OrderDetailDialog from "../components/OrderDetailDialog";
import OrderStatusUpdateDialog from "../components/OrderStatusUpdateDialog";

const OrderManagementPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [statusDialogOrder, setStatusDialogOrder] = useState(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [stores, setStores] = useState([]);
  const [assigningOrderIds, setAssigningOrderIds] = useState({});
  
  const { authz } = useAuthStore();
  const isGlobalAdmin = Boolean(authz?.isGlobalAdmin);
  const limit = 20;

  useEffect(() => {
    fetchOrders();
    if (isGlobalAdmin) {
      fetchStores();
    }
  }, [page, stageFilter, isGlobalAdmin]);

  const resolveOrderStage = (order) => {
    return order?.statusStage || getStatusStage(order?.status) || "PENDING";
  };

  const getImageUrl = (path) => {
    if (!path) return "https://via.placeholder.com/100?text=No+Image";
    if (path.startsWith("http")) return path;
    const baseUrl = String(import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "");
    return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit,
        ...(stageFilter !== "ALL" && { statusStage: stageFilter }),
        ...(searchQuery && { search: searchQuery }),
      };

      const response = await orderAPI.getAll(params);

      setOrders(response.data.orders || []);
      setTotal(response.data.pagination?.total || 0);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("Không thể tải danh sách đơn hàng");
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await storeAPI.getAll({ status: "ACTIVE", limit: 100 });
      const fetchedStores = response.data.stores || response.data.data?.stores || [];
      console.log("Fetched stores for reassignment:", fetchedStores);
      setStores(fetchedStores);
    } catch (error) {
      console.error("Error fetching stores:", error);
    }
  };

  const patchOrderById = (orderId, updater) => {
    setOrders((prevOrders) =>
      prevOrders.map((order) => (order._id === orderId ? updater(order) : order)),
    );
    setSelectedOrder((prevOrder) =>
      prevOrder?._id === orderId ? updater(prevOrder) : prevOrder,
    );
    setStatusDialogOrder((prevOrder) =>
      prevOrder?._id === orderId ? updater(prevOrder) : prevOrder,
    );
  };

  const setOrderAssigningState = (orderId, isAssigning) => {
    setAssigningOrderIds((prev) => {
      const next = { ...prev };
      if (isAssigning) {
        next[orderId] = true;
      } else {
        delete next[orderId];
      }
      return next;
    });
  };

  const isOrderAssigning = (orderId) => Boolean(assigningOrderIds[orderId]);

  const handleReassignStore = async (orderId, storeId) => {
    if (!storeId) return;
    if (isOrderAssigning(orderId)) return;

    const normalizedStoreId = String(storeId);
    const currentOrder = orders.find((order) => order._id === orderId);
    const currentStoreId = currentOrder?.assignedStore?.storeId
      ? String(currentOrder.assignedStore.storeId)
      : "";

    if (currentStoreId === normalizedStoreId) return;

    const targetStore = stores.find((store) => String(store._id) === normalizedStoreId);
    const fallbackAssignedStore = targetStore
      ? {
          storeId: targetStore._id,
          storeName: targetStore.name,
          storeCode: targetStore.code,
          storePhone: targetStore.phone,
          assignedAt: new Date().toISOString(),
        }
      : null;

    try {
      setOrderAssigningState(orderId, true);
      const response = await orderAPI.assignStore(orderId, { storeId: normalizedStoreId });
      if (response.data.success) {
        const updatedOrder = response.data.order || response.data.data?.order || null;

        if (updatedOrder) {
          patchOrderById(orderId, (order) => ({ ...order, ...updatedOrder }));
        } else if (fallbackAssignedStore) {
          patchOrderById(orderId, (order) => ({
            ...order,
            assignedStore: {
              ...order.assignedStore,
              ...fallbackAssignedStore,
            },
          }));
        }

        toast.success(response.data.message || "Đã chuyển đơn hàng thành công");
      }
    } catch (error) {
      console.error("Reassign error:", error);
      toast.error(error.response?.data?.message || "Không thể chuyển đơn hàng");
    } finally {
      setOrderAssigningState(orderId, false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchOrders();
  };

  const openStatusDialog = (order) => {
    setStatusDialogOrder(order);
    setIsStatusDialogOpen(true);
  };

  const canUpdateOrderStatus = (order) => {
    const stage = resolveOrderStage(order);
    const nonEditableStages = ["CANCELLED", "RETURNED"];
    return !nonEditableStages.includes(stage);
  };

  const getStatusBadge = (statusStage) => {
    return (
      <Badge className={getStatusColor(statusStage)} variant="outline">
        {getStatusText(statusStage)}
      </Badge>
    );
  };

  const getPaymentBadge = (status) => {
    const config = {
      PENDING: {
        color: "bg-amber-50 text-amber-700 border-amber-200",
        label: "Chờ thanh toán",
        icon: Clock,
      },
      PAID: {
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        label: "Đã thanh toán",
        icon: CheckCircle,
      },
      FAILED: {
        color: "bg-red-50 text-red-700 border-red-200",
        label: "Thất bại",
        icon: XCircle,
      },
      REFUNDED: {
        color: "bg-slate-50 text-slate-700 border-slate-200",
        label: "Đã hoàn",
        icon: CheckCircle,
      },
    };

    const paymentConfig = config[status] || {
      color: "bg-gray-50 text-gray-700 border-gray-200",
      label: status,
      icon: CreditCard,
    };

    const Icon = paymentConfig.icon;

    return (
      <Badge className={`${paymentConfig.color} font-medium`} variant="outline">
        <Icon className="w-3 h-3 mr-1" />
        {paymentConfig.label}
      </Badge>
    );
  };

  const getFulfillmentLabel = (type) => {
    const map = {
      HOME_DELIVERY: "Giao tận nhà",
      CLICK_AND_COLLECT: "Nhận tại cửa hàng",
      IN_STORE: "Mua tại cửa hàng",
    };
    return map[type] || type || "N/A";
  };

  const getPaymentMethodLabel = (method) => {
    const map = {
      COD: "COD",
      VNPAY: "VNPay",
      CASH: "Tiền mặt",
      BANK_TRANSFER: "Chuyển khoản (SePay)",
      MOMO: "MoMo",
      CREDIT_CARD: "Thẻ",
    };
    return map[method] || method || "N/A";
  };

  const getOrderTotal = (order) => {
    const total = Number(order?.total);
    if (Number.isFinite(total) && total >= 0) return total;

    const subtotal = Number(order?.subtotal);
    if (Number.isFinite(subtotal) && subtotal >= 0) {
      return (
        subtotal +
        (Number(order?.shippingFee) || 0) -
        (Number(order?.discount) || 0)
      );
    }

    return (order?.items || []).reduce((sum, item) => {
      return sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0);
    }, 0);
  };

  const formatCurrency = (amount) => {
    const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(safeAmount);
  };

  const openOrderDetail = async (order) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);

    try {
      const response = await orderAPI.getById(order._id);
      const latestOrder = response?.data?.order || response?.data?.data?.order;
      if (latestOrder) {
        setSelectedOrder(latestOrder);
      }
    } catch (error) {
      console.error("Error fetching order details:", error);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStageStats = () => {
    return {
      pending: orders.filter((o) =>
        ["PENDING", "PENDING_PAYMENT", "CONFIRMED", "PICKING"].includes(
          resolveOrderStage(o),
        ),
      ).length,
      shipping: orders.filter((o) =>
        ["PICKUP_COMPLETED", "IN_TRANSIT"].includes(resolveOrderStage(o)),
      ).length,
      completed: orders.filter((o) => resolveOrderStage(o) === "DELIVERED").length,
      cancelled: orders.filter((o) => resolveOrderStage(o) === "CANCELLED").length,
    };
  };

  const stats = getStageStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {/* Header Section */}
        <div className="mb-8 lg:mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
                Quản Lý Đơn Hàng
              </h1>
              <p className="text-slate-600 text-sm sm:text-base mt-1">
                Theo dõi và xử lý đơn hàng hiệu quả
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 lg:mb-8">
          <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-100/40 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
            <CardContent className="p-4 sm:p-5 lg:p-6 relative">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-amber-700 mb-1 sm:mb-2">
                    Chờ xử lý
                  </p>
                  <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-amber-600 truncate">
                    {stats.pending}
                  </p>
                </div>
                <div className="p-2.5 sm:p-3 bg-amber-100 rounded-xl group-hover:scale-110 transition-transform duration-300 flex-shrink-0 ml-2">
                  <Clock className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-blue-50 to-cyan-50 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/40 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
            <CardContent className="p-4 sm:p-5 lg:p-6 relative">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-blue-700 mb-1 sm:mb-2">
                    Đang giao
                  </p>
                  <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-blue-600 truncate">
                    {stats.shipping}
                  </p>
                </div>
                <div className="p-2.5 sm:p-3 bg-blue-100 rounded-xl group-hover:scale-110 transition-transform duration-300 flex-shrink-0 ml-2">
                  <Truck className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/40 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
            <CardContent className="p-4 sm:p-5 lg:p-6 relative">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-emerald-700 mb-1 sm:mb-2">
                    Hoàn thành
                  </p>
                  <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-emerald-600 truncate">
                    {stats.completed}
                  </p>
                </div>
                <div className="p-2.5 sm:p-3 bg-emerald-100 rounded-xl group-hover:scale-110 transition-transform duration-300 flex-shrink-0 ml-2">
                  <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-red-50 to-rose-50 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-100/40 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
            <CardContent className="p-4 sm:p-5 lg:p-6 relative">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-red-700 mb-1 sm:mb-2">
                    Đã hủy
                  </p>
                  <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-red-600 truncate">
                    {stats.cancelled}
                  </p>
                </div>
                <div className="p-2.5 sm:p-3 bg-red-100 rounded-xl group-hover:scale-110 transition-transform duration-300 flex-shrink-0 ml-2">
                  <XCircle className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 lg:mb-8 border-0 shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardContent className="p-4 sm:p-5 lg:p-6">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400 pointer-events-none" />
                    <Input
                      placeholder="Tìm theo mã đơn, tên khách hàng, SĐT..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                      className="pl-10 sm:pl-11 h-11 sm:h-12 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl text-sm sm:text-base"
                    />
                  </div>
                </div>

                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-full sm:w-56 lg:w-64 h-11 sm:h-12 border-slate-200 rounded-xl text-sm sm:text-base">
                    <Filter className="w-4 h-4 mr-2 flex-shrink-0" />
                    <SelectValue placeholder="Lọc giai đoạn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả</SelectItem>
                    <SelectItem value="PENDING">Mới tạo</SelectItem>
                    <SelectItem value="PENDING_PAYMENT">Chờ thanh toán</SelectItem>
                    <SelectItem value="PAYMENT_FAILED">Thanh toán thất bại</SelectItem>
                    <SelectItem value="CONFIRMED">Đã xác nhận</SelectItem>
                    <SelectItem value="PICKING">Đang lấy hàng</SelectItem>
                    <SelectItem value="PICKUP_COMPLETED">Lấy hàng xong</SelectItem>
                    <SelectItem value="IN_TRANSIT">Đang vận chuyển</SelectItem>
                    <SelectItem value="DELIVERED">Đã giao</SelectItem>
                    <SelectItem value="CANCELLED">Đã hủy</SelectItem>
                    <SelectItem value="RETURNED">Đã trả</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  onClick={handleSearch}
                  className="h-11 sm:h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-300 rounded-xl font-medium px-6"
                >
                  <Search className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Tìm kiếm</span>
                  <span className="sm:hidden">Tìm</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders List */}
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-blue-50/50 p-4 sm:p-5 lg:p-6">
            <CardTitle className="text-lg sm:text-xl font-semibold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
              Danh Sách Đơn Hàng
              <span className="ml-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                {total}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-16 sm:py-20 lg:py-24">
                <div className="inline-block">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
                <p className="mt-4 sm:mt-6 text-slate-600 font-medium text-sm sm:text-base">Đang tải dữ liệu...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16 sm:py-20 lg:py-24">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-slate-100 rounded-full flex items-center justify-center">
                  <Package className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium text-sm sm:text-base">Không có đơn hàng nào</p>
                <p className="text-slate-500 text-xs sm:text-sm mt-2">Thử thay đổi bộ lọc hoặc tìm kiếm</p>
              </div>
            ) : (
              <>
                {/* DESKTOP VIEW - Enhanced Cards */}
                <div className="hidden lg:block p-4 lg:p-6">
                  <div className="space-y-4">
                    {orders.map((order, index) => (
                      <div
                        key={order._id}
                        className="group bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-xl hover:border-blue-300 transition-all duration-300"
                        style={{
                          animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`,
                        }}
                      >
                        {/* Order Header */}
                        <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="flex-shrink-0">
                              <div className="px-4 py-2 bg-blue-100 rounded-lg">
                                <p className="text-xs font-medium text-blue-700 mb-0.5">Mã đơn</p>
                                <p className="text-base font-bold text-blue-900 truncate">
                                  {order.orderNumber}
                                </p>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                                <Calendar className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{formatDate(order.createdAt)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(resolveOrderStage(order))}
                                {order.status && (
                                  <span className="text-xs text-slate-500 truncate">
                                    {getStatusText(order.status)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs font-medium text-slate-600 mb-1">Tổng tiền</p>
                              <p className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                                {formatCurrency(getOrderTotal(order))}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Order Body */}
                        <div className="p-6">
                          <div className="grid grid-cols-12 gap-6">
                            {/* Product Thumbnails - Enhanced */}
                            <div className="col-span-4">
                              <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl p-4 h-full">
                                <div className="flex items-center gap-2 mb-3">
                                  <ShoppingBag className="w-4 h-4 text-slate-600" />
                                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                                    Sản phẩm ({order.items?.length || 0})
                                  </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2.5">
                                  {order.items?.slice(0, 6).map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="group/item relative rounded-lg overflow-hidden bg-white border-2 border-slate-200 hover:border-blue-400 transition-all duration-300 hover:scale-105 hover:z-10 shadow-sm hover:shadow-lg"
                                      style={{ aspectRatio: '1/1' }}
                                      title={`${item.name} - ${item.quantity}x`}
                                    >
                                      <img
                                        className="w-full h-full object-contain p-2"
                                        src={getImageUrl(item.images?.[0] || item.image)}
                                        alt={item.name}
                                        onError={(e) => {
                                          e.target.src = "https://placehold.co/120x90/e2e8f0/64748b?text=No+Image";
                                        }}
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity duration-300">
                                        <div className="absolute bottom-1 left-1 right-1">
                                          <p className="text-white text-[10px] font-medium truncate">
                                            {item.name}
                                          </p>
                                          <p className="text-white/90 text-[9px]">
                                            SL: {item.quantity}
                                          </p>
                                        </div>
                                      </div>
                                      {item.quantity > 1 && (
                                        <div className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg">
                                          x{item.quantity}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                  {order.items?.length > 6 && (
                                    <div className="rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex flex-col items-center justify-center border-2 border-blue-300 shadow-sm" style={{ aspectRatio: '4/3' }}>
                                      <p className="text-blue-700 text-base font-bold">
                                        +{order.items.length - 6}
                                      </p>
                                      <p className="text-blue-600 text-[9px] font-medium">
                                        thêm
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Customer Info */}
                            <div className="col-span-3">
                              <div className="bg-slate-50 rounded-xl p-4 h-full">
                                <div className="flex items-center gap-2 mb-3">
                                  <User className="w-4 h-4 text-slate-600" />
                                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                                    Khách hàng
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-start gap-2">
                                    <User className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm font-semibold text-slate-900 break-words">
                                      {order.shippingAddress?.fullName || "N/A"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                    <p className="text-sm text-slate-700">
                                      {order.shippingAddress?.phoneNumber || "N/A"}
                                    </p>
                                  </div>
                                  {order.shippingAddress?.address && (
                                    <div className="flex items-start gap-2">
                                      <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                                      <p className="text-xs text-slate-600 line-clamp-2 break-words">
                                        {order.shippingAddress.address}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Fulfillment & Payment */}
                            <div className="col-span-3">
                              <div className="bg-slate-50 rounded-xl p-4 h-full">
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                      Kênh nhận hàng
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Truck className="w-4 h-4 text-blue-600" />
                                      <p className="text-sm font-medium text-slate-900">
                                        {getFulfillmentLabel(order.fulfillmentType)}
                                      </p>
                                    </div>
                                    {order.assignedStore?.storeName && (
                                      <p className="text-xs text-slate-600 mt-1 ml-6">
                                        {order.assignedStore.storeName}
                                      </p>
                                    )}
                                    {order.pickupInfo?.pickupCode && (
                                      <div className="mt-2 ml-6 inline-block px-2 py-1 bg-blue-100 rounded-md">
                                        <p className="text-xs text-blue-700 font-semibold">
                                          Mã: {order.pickupInfo.pickupCode}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                  <div className="pt-3 border-t border-slate-200">
                                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                      Thanh toán
                                    </p>
                                    <div className="flex flex-col gap-2">
                                      {getPaymentBadge(order.paymentStatus)}
                                      <div className="flex items-center gap-2">
                                        <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                                        <span className="text-xs text-slate-600">
                                          {getPaymentMethodLabel(order.paymentMethod)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="col-span-2">
                              <div className="flex flex-col gap-2 h-full justify-center">
                                {isGlobalAdmin && (
                                  <div className="flex flex-col gap-1.5 mb-2">
                                    <div className="flex items-center justify-between gap-2 ml-1">
                                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                        Chuyển chi nhánh
                                      </p>
                                      {isOrderAssigning(order._id) && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600">
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                          Đang chuyển
                                        </span>
                                      )}
                                    </div>
                                    <Select
                                      disabled={
                                        isOrderAssigning(order._id) ||
                                        !canUpdateOrderStatus(order) ||
                                        stores.length === 0
                                      }
                                      onValueChange={(value) => handleReassignStore(order._id, value)}
                                      value={order.assignedStore?.storeId ? String(order.assignedStore.storeId) : ""}
                                    >
                                      <SelectTrigger className="h-9 border-slate-200 bg-white hover:border-blue-400 transition-colors">
                                        <div className="flex items-center gap-2 truncate">
                                          <GitBranch className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                          <SelectValue placeholder={stores.length === 0 ? "Đang tải..." : "Chọn chi nhánh"} />
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
                                )}
                                <Button
                                  onClick={() => openStatusDialog(order)}
                                  disabled={!canUpdateOrderStatus(order)}
                                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed h-10"
                                >
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Cập nhật
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => openOrderDetail(order)}
                                  className="w-full border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-300 h-10"
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  Chi tiết
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* TABLET/MOBILE VIEW - Improved Cards */}
                <div className="lg:hidden p-4 sm:p-5">
                  <div className="space-y-4">
                    {orders.map((order, index) => (
                      <Card
                        key={order._id}
                        className="overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border-slate-200 hover:border-blue-300"
                        style={{
                          animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`,
                        }}
                      >
                        <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50/30 p-4 border-b border-slate-200">
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Package className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <CardTitle className="text-sm sm:text-base font-bold text-blue-900 truncate">
                                  {order.orderNumber}
                                </CardTitle>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-600">
                                <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate">{formatDate(order.createdAt)}</span>
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              {getStatusBadge(resolveOrderStage(order))}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="p-4 space-y-4">
                          {/* Product Thumbnails */}
                          <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-slate-600" />
                                <p className="text-xs font-semibold text-slate-700">
                                  Sản phẩm
                                </p>
                              </div>
                              <span className="text-xs font-medium text-slate-600 bg-white px-2 py-0.5 rounded-full">
                                {order.items?.length || 0} SP
                              </span>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                              {order.items?.slice(0, 4).map((item, idx) => (
                                <div
                                  key={idx}
                                  className="group/item relative rounded-lg overflow-hidden bg-white border-2 border-slate-200 hover:border-blue-400 transition-all duration-300 shadow-sm"
                                  style={{ aspectRatio: '4/3' }}
                                  title={`${item.name} - ${item.quantity}x`}
                                >
                                  <img
                                    className="w-full h-full object-cover"
                                    src={getImageUrl(item.images?.[0] || item.image)}
                                    alt={item.name}
                                    onError={(e) => {
                                      e.target.src = "https://placehold.co/80x60/e2e8f0/64748b?text=?";
                                    }}
                                  />
                                  {item.quantity > 1 && (
                                    <div className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md">
                                      x{item.quantity}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {order.items?.length > 4 && (
                                <div className="rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex flex-col items-center justify-center border-2 border-blue-300 shadow-sm" style={{ aspectRatio: '4/3' }}>
                                  <p className="text-blue-700 text-base font-bold">
                                    +{order.items.length - 4}
                                  </p>
                                  <p className="text-blue-600 text-[10px] font-medium">
                                    thêm
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Details Grid */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <User className="w-3.5 h-3.5 text-slate-600" />
                                <p className="text-xs font-semibold text-slate-700">Khách hàng</p>
                              </div>
                              <p className="text-sm font-medium text-slate-900 truncate mb-1">
                                {order.shippingAddress?.fullName || "N/A"}
                              </p>
                              <p className="text-xs text-slate-600 truncate">
                                {order.shippingAddress?.phoneNumber || "N/A"}
                              </p>
                            </div>

                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <CreditCard className="w-3.5 h-3.5 text-slate-600" />
                                <p className="text-xs font-semibold text-slate-700">Tổng tiền</p>
                              </div>
                              <p className="text-base sm:text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                                {formatCurrency(getOrderTotal(order))}
                              </p>
                            </div>

                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <CreditCard className="w-3.5 h-3.5 text-slate-600" />
                                <p className="text-xs font-semibold text-slate-700">Thanh toán</p>
                              </div>
                              <div className="space-y-1">
                                {getPaymentBadge(order.paymentStatus)}
                                <p className="text-xs text-slate-600">
                                  {getPaymentMethodLabel(order.paymentMethod)}
                                </p>
                              </div>
                            </div>

                            <div className="bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <Truck className="w-3.5 h-3.5 text-slate-600" />
                                <p className="text-xs font-semibold text-slate-700">Kênh nhận</p>
                              </div>
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {getFulfillmentLabel(order.fulfillmentType)}
                              </p>
                              {order.pickupInfo?.pickupCode && (
                                <p className="text-xs text-blue-700 font-semibold mt-1">
                                  Mã: {order.pickupInfo.pickupCode}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-3 pt-2">
                            {isGlobalAdmin && (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2 ml-1">
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                    Chuyển chi nhánh
                                  </p>
                                  {isOrderAssigning(order._id) && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      Đang chuyển
                                    </span>
                                  )}
                                </div>
                                <Select
                                  disabled={
                                    isOrderAssigning(order._id) ||
                                    !canUpdateOrderStatus(order) ||
                                    stores.length === 0
                                  }
                                  onValueChange={(value) => handleReassignStore(order._id, value)}
                                  value={order.assignedStore?.storeId ? String(order.assignedStore.storeId) : ""}
                                >
                                  <SelectTrigger className="h-10 border-slate-200 bg-white shadow-sm">
                                    <div className="flex items-center gap-2 truncate">
                                      <GitBranch className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                      <SelectValue placeholder={stores.length === 0 ? "Đang tải..." : "Chọn chi nhánh"} />
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
                            )}
                            <div className="flex gap-2">
                              <Button
                                className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-10 sm:h-11"
                                onClick={() => openStatusDialog(order)}
                                disabled={!canUpdateOrderStatus(order)}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Cập nhật
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1 border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-300 h-10 sm:h-11"
                                onClick={() => openOrderDetail(order)}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                Chi tiết
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Pagination */}
                {Math.ceil(total / limit) > 1 && (
                  <div className="flex justify-center items-center gap-3 sm:gap-4 p-4 sm:p-6 border-t border-slate-200">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      className="h-9 sm:h-10 px-3 sm:px-4 border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      <span className="hidden sm:inline">Trước</span>
                    </Button>

                    <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-100 rounded-lg">
                      <span className="text-xs sm:text-sm font-medium text-slate-900">
                        Trang <span className="font-bold text-blue-600">{page}</span> / {Math.ceil(total / limit)}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === Math.ceil(total / limit)}
                      onClick={() => setPage(page + 1)}
                      className="h-9 sm:h-10 px-3 sm:px-4 border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                    >
                      <span className="hidden sm:inline">Sau</span>
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <OrderDetailDialog
        order={selectedOrder}
        open={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />
      <OrderStatusUpdateDialog
        order={statusDialogOrder}
        open={isStatusDialogOpen}
        onClose={() => {
          setIsStatusDialogOpen(false);
          setStatusDialogOrder(null);
        }}
        onSuccess={fetchOrders}
      />

      {/* CSS Animation */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default OrderManagementPage;
