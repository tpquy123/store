import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const formatPrice = (price) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(price);
};

export const formatDate = (date) => {
  return new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
};

export const getStatusColor = (status) => {
  const map = {
    PENDING: "bg-yellow-100 text-yellow-800",
    PENDING_PAYMENT: "bg-orange-100 text-orange-800",
    PAYMENT_CONFIRMED: "bg-emerald-100 text-emerald-800",
    PAYMENT_VERIFIED: "bg-emerald-100 text-emerald-800",
    PAYMENT_FAILED: "bg-red-100 text-red-800",
    CONFIRMED: "bg-blue-100 text-blue-800",
    PROCESSING: "bg-indigo-100 text-indigo-800",
    PREPARING: "bg-purple-100 text-purple-800",
    READY_FOR_PICKUP: "bg-cyan-100 text-cyan-800",
    PREPARING_SHIPMENT: "bg-violet-100 text-violet-800",
    SHIPPING: "bg-indigo-100 text-indigo-800",
    OUT_FOR_DELIVERY: "bg-blue-100 text-blue-800",
    DELIVERED: "bg-green-100 text-green-800",
    PICKED_UP: "bg-green-100 text-green-800",
    COMPLETED: "bg-teal-100 text-teal-800",
    DELIVERY_FAILED: "bg-red-100 text-red-800",
    RETURN_REQUESTED: "bg-yellow-100 text-yellow-800",
    RETURNED: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-100 text-gray-800",
    PICKING: "bg-indigo-100 text-indigo-800",
    PICKUP_COMPLETED: "bg-violet-100 text-violet-800",
    IN_TRANSIT: "bg-sky-100 text-sky-800",
    PAID: "bg-green-100 text-green-800",
    UNPAID: "bg-red-100 text-red-800",
    ACTIVE: "bg-emerald-100 text-emerald-800",
    LOCKED: "bg-red-100 text-red-800",
  };
  return map[status] || "bg-gray-100 text-gray-800";
};

export const getStatusText = (status) => {
  const map = {
    PENDING: "Chờ xử lý",
    PENDING_PAYMENT: "Chờ thanh toán",
    PAYMENT_CONFIRMED: "Đã thanh toán",
    PAYMENT_VERIFIED: "Đã thanh toán online",
    PAYMENT_FAILED: "Thanh toán thất bại",
    CONFIRMED: "Đã xác nhận",
    PROCESSING: "Đang xử lý",
    PREPARING: "Đang chuẩn bị",
    READY_FOR_PICKUP: "Sẵn sàng lấy hàng",
    PREPARING_SHIPMENT: "Đã hoàn tất lấy hàng",
    SHIPPING: "Đang giao hàng",
    OUT_FOR_DELIVERY: "Đang giao đến khách",
    DELIVERED: "Đã giao hàng",
    PICKED_UP: "Đã nhận tại cửa hàng",
    COMPLETED: "Hoàn tất",
    DELIVERY_FAILED: "Giao hàng thất bại",
    RETURN_REQUESTED: "Yêu cầu trả hàng",
    RETURNED: "Đã trả hàng",
    CANCELLED: "Đã hủy",
    PICKING: "Đang lấy hàng",
    PICKUP_COMPLETED: "Đã hoàn tất lấy hàng",
    IN_TRANSIT: "Đang vận chuyển",
    PAID: "Đã thanh toán",
    UNPAID: "Chưa thanh toán",
    COD: "Thanh toán khi nhận hàng",
    BANK_TRANSFER: "Chuyển khoản (SePay)",
    VNPAY: "Thanh toán VNPay",
    CASH: "Tiền mặt",
    CARD: "Thẻ",
    HOME_DELIVERY: "Giao tận nhà",
    CLICK_AND_COLLECT: "Nhận tại cửa hàng",
    IN_STORE: "Mua tại cửa hàng",
    ACTIVE: "Hoạt động",
    LOCKED: "Đã khóa",
  };
  return map[status] || status;
};

export const getStatusStage = (status) => {
  if (!status) return null;

  const normalized = String(status).trim().toUpperCase();
  const map = {
    PENDING: "PENDING",
    PENDING_PAYMENT: "PENDING_PAYMENT",
    PAYMENT_CONFIRMED: "PENDING",
    PAYMENT_VERIFIED: "PENDING",
    PAYMENT_FAILED: "PAYMENT_FAILED",
    CONFIRMED: "CONFIRMED",
    PROCESSING: "PICKING",
    PREPARING: "PICKING",
    PICKING: "PICKING",
    PREPARING_SHIPMENT: "PICKUP_COMPLETED",
    READY_FOR_PICKUP: "PICKUP_COMPLETED",
    PICKUP_COMPLETED: "PICKUP_COMPLETED",
    SHIPPING: "IN_TRANSIT",
    OUT_FOR_DELIVERY: "IN_TRANSIT",
    IN_TRANSIT: "IN_TRANSIT",
    DELIVERED: "DELIVERED",
    PICKED_UP: "DELIVERED",
    COMPLETED: "DELIVERED",
    DELIVERY_FAILED: "CANCELLED",
    CANCELLED: "CANCELLED",
    RETURN_REQUESTED: "RETURNED",
    RETURNED: "RETURNED",
  };

  return map[normalized] || normalized;
};

export const getNameInitials = (fullName) => {
  if (!fullName) return "U";

  const words = fullName.trim().split(/\s+/);

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  const lastTwo = words.slice(-2);
  return lastTwo.map((word) => word.charAt(0).toUpperCase()).join("");
};
