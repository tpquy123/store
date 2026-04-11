// ============================================
// FILE: src/pages/customer/CheckoutPage.jsx
// ĐÃ SỬA: Lưu giá final sau khi áp mã giảm giá vào DB
// ============================================

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog";
import { useCartStore } from "@/features/cart";
import { orderAPI } from "@/features/orders";
import { promotionAPI } from "@/features/promotions";
import { userAPI } from "@/features/account";
import { vnpayAPI, sepayAPI } from "@/features/checkout";
import { cartAPI } from "@/features/cart";
import { monitoringAPI } from "@/features/inventory";
import { formatPrice } from "@/shared/lib/utils";
import { toast } from "sonner";
import { useAuthStore } from "@/features/auth";
import { Plus, MapPin, ChevronRight, ArrowLeft, Copy, RefreshCw } from "lucide-react";
import { AddressFormDialog } from "@/features/account";
import { StoreSelector } from "@/features/stores";

const VNPAY_PENDING_KEY = "pending_vnpay_order";
const SEPAY_PENDING_KEY = "pending_sepay_order";

const isTruthyEnvValue = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase()
  );
};

const CheckoutPage = () => {
  const navigate = useNavigate();
  const { cart, getCart, selectedForCheckout, setSelectedForCheckout } =
    useCartStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { user, getCurrentUser } = useAuthStore();
  const isLocalOmnichannelFlagEnabled = isTruthyEnvValue(
    import.meta.env.VITE_FEATURE_OMNICHANNEL_CHECKOUT,
    true
  );
  const [rolloutDecision, setRolloutDecision] = useState({
    loading: isLocalOmnichannelFlagEnabled,
    enabled: !isLocalOmnichannelFlagEnabled ? false : import.meta.env.DEV,
    mode: "off",
    percent: 0,
    reason: isLocalOmnichannelFlagEnabled ? "initial" : "frontend_flag_off",
    bucket: null,
    isInternal: false,
  });
  const isOmnichannelCheckoutEnabled =
    isLocalOmnichannelFlagEnabled && rolloutDecision.enabled;

  // Form data
  const [formData, setFormData] = useState({
    paymentMethod: "COD",
    fulfillmentType: "HOME_DELIVERY",
    note: "",
  });
  const [selectedPickupStore, setSelectedPickupStore] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showSelectAddressDialog, setShowSelectAddressDialog] = useState(false);

  // Promotion states
  const [promotionCode, setPromotionCode] = useState("");
  const [appliedPromotion, setAppliedPromotion] = useState(null);
  const [promotionError, setPromotionError] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [isSubmittingAddress, setIsSubmittingAddress] = useState(false);
  const [isRedirectingToPayment, setIsRedirectingToPayment] = useState(false);
  const [showSepayDialog, setShowSepayDialog] = useState(false);
  const [sepaySession, setSepaySession] = useState(null);
  const [sepayTimeLeft, setSepayTimeLeft] = useState("");
  const skipEmptySelectionGuardRef = useRef(false);
  const sepayPollingRef = useRef(null);
  const effectiveFulfillmentType = isOmnichannelCheckoutEnabled
    ? formData.fulfillmentType
    : "HOME_DELIVERY";

  useEffect(() => {
    if (user?.addresses?.length > 0) {
      const defaultAddr = user.addresses.find((a) => a.isDefault);
      setSelectedAddressId(defaultAddr?._id || user.addresses[0]._id);
    } else {
      setError("Vui lòng thêm địa chỉ nhận hàng");
    }
  }, [user]);

  useEffect(() => {
      window.scrollTo(0, 0);
  
      // Refresh user data để có địa chỉ mới nhất
      getCurrentUser();
  }, [getCurrentUser]);

  useEffect(() => {
    let mounted = true;

    if (!isLocalOmnichannelFlagEnabled) {
      setRolloutDecision({
        loading: false,
        enabled: false,
        mode: "off",
        percent: 0,
        reason: "frontend_flag_off",
        bucket: null,
        isInternal: false,
      });
      return () => {
        mounted = false;
      };
    }

    const loadRolloutDecision = async () => {
      try {
        const response = await monitoringAPI.getRolloutDecision();
        const data = response?.data?.data || {};
        if (!mounted) return;

        setRolloutDecision({
          loading: false,
          enabled: Boolean(data.enabled),
          mode: data.mode || "off",
          percent: Number.isFinite(Number(data.percent)) ? Number(data.percent) : 0,
          reason: data.reason || "unknown",
          bucket: data.bucket ?? null,
          isInternal: Boolean(data.isInternal),
        });
      } catch {
        if (!mounted) return;

        setRolloutDecision({
          loading: false,
          enabled: import.meta.env.DEV,
          mode: "off",
          percent: 0,
          reason: "rollout_api_unavailable",
          bucket: null,
          isInternal: false,
        });
      }
    };

    loadRolloutDecision();

    return () => {
      mounted = false;
    };
  }, [isLocalOmnichannelFlagEnabled, user?._id]);

  // Lọc sản phẩm được chọn
  const checkoutItems = useMemo(() => {
    if (
      !cart?.items ||
      !selectedForCheckout ||
      selectedForCheckout.length === 0
    ) {
      return [];
    }
    return cart.items.filter((item) =>
      selectedForCheckout.includes(item.variantId)
    );
  }, [cart?.items, selectedForCheckout]);

  // Subtotal gốc (trước giảm giá)
  const subtotal = checkoutItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // Phí vận chuyển
  // Tạm thời comment lại phần dười 5tr là có 50k tiền ship
  /*
  const shippingFee =
    effectiveFulfillmentType === "CLICK_AND_COLLECT"
      ? 0
      : subtotal >= 5000000
      ? 0
      : 50000;
  */
  const shippingFee = 0;


  // Tổng cuối cùng
  const finalTotal =
    subtotal + shippingFee - (appliedPromotion?.discountAmount || 0);

  // TÍNH GIÁ FINAL CHO TỪNG SẢN PHẨM SAU KHI ÁP DỤNG KHUYẾN MÃI
  const checkoutItemsWithFinalPrice = useMemo(() => {
    if (checkoutItems.length === 0) return [];

    const discountAmount = appliedPromotion?.discountAmount || 0;

    if (discountAmount === 0) {
      return checkoutItems.map((item) => ({
        ...item,
        originalPrice: item.price,
        finalPrice: item.price,
      }));
    }

    const totalForDiscount = subtotal;
    let remainingDiscount = discountAmount;

    const items = checkoutItems.map((item, index) => {
      const itemSubtotal = item.price * item.quantity;
      const ratio = itemSubtotal / totalForDiscount;
      let itemDiscount = Math.round(ratio * discountAmount);

      // Đảm bảo không vượt quá phần giảm còn lại (tránh lỗi làm tròn)
      if (index === checkoutItems.length - 1) {
        itemDiscount = remainingDiscount;
      } else {
        remainingDiscount -= itemDiscount;
      }

      const finalPricePerUnit = Math.max(
        0,
        item.price - Math.round(itemDiscount / item.quantity)
      );

      return {
        ...item,
        originalPrice: item.price,
        finalizedPrice: finalPricePerUnit,
      };
    });

    return items;
  }, [checkoutItems, subtotal, appliedPromotion?.discountAmount]);

  // Tính lại subtotal sau khi đã giảm giá (dùng để hiển thị)
  const discountedSubtotal = checkoutItemsWithFinalPrice.reduce(
    (sum, item) =>
      sum + (item.finalizedPrice || item.originalPrice) * item.quantity,
    0
  );

  // Kiểm tra khi mount
  useEffect(() => {
    if (selectedForCheckout.length === 0) {
      if (skipEmptySelectionGuardRef.current) {
        return;
      }
      toast.error("Vui lòng chọn sản phẩm để thanh toán");
      navigate("/cart");
      return;
    }
    if (!cart) getCart();
  }, [cart, getCart, navigate, selectedForCheckout.length]);

  // Bỏ lỗi VNPay sandbox
  useEffect(() => {
    const handler = (event) => {
      if (event.message?.includes("timer is not defined")) {
        console.warn("VNPay Sandbox bug ignored");
        event.preventDefault();
      }
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  // ✅ THÊM: Cảnh báo khi rời trang
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isRedirectingToPayment) {
        return; // Cho phép redirect đến VNPay
      }

      // Nếu đang ở trang checkout và có sản phẩm
      if (checkoutItems.length > 0 && formData.paymentMethod === "VNPAY") {
        e.preventDefault();
        e.returnValue =
          "Bạn có chắc muốn rời khỏi trang? Đơn hàng chưa được hoàn tất.";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [checkoutItems.length, isRedirectingToPayment, formData.paymentMethod]);

  const handleChange = (e) => {
    setError("");
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  useEffect(() => {
    if (isOmnichannelCheckoutEnabled) return;

    if (formData.fulfillmentType !== "HOME_DELIVERY") {
      setFormData((prev) => ({ ...prev, fulfillmentType: "HOME_DELIVERY" }));
    }

    if (selectedPickupStore) {
      setSelectedPickupStore(null);
    }
  }, [
    isOmnichannelCheckoutEnabled,
    formData.fulfillmentType,
    selectedPickupStore,
  ]);

  useEffect(() => {
    const pendingOrder = localStorage.getItem(VNPAY_PENDING_KEY);
    if (pendingOrder) {
      try {
        const { orderId, orderNumber, timestamp } = JSON.parse(pendingOrder);
        const ageMinutes = (Date.now() - timestamp) / 1000 / 60;

        if (ageMinutes < 15) {
          toast.warning(
            `Đơn hàng #${orderNumber} chưa thanh toán - Sản phẩm vẫn trong giỏ`,
            {
              duration: 10000,
              action: {
                label: "Tiếp tục thanh toán",
                onClick: () => navigate(`/orders/${orderId}`),
              },
            }
          );
        } else {
          // ✅ Sau 15 phút, hủy đơn và thông báo
          toast.info("Đơn hàng VNPay đã hết hạn - Vui lòng đặt lại", {
            duration: 6000,
          });
          localStorage.removeItem(VNPAY_PENDING_KEY);
        }
      } catch {
        localStorage.removeItem(VNPAY_PENDING_KEY);
      }
    }
  }, [navigate]);

  useEffect(() => {
    const pendingSepay = localStorage.getItem(SEPAY_PENDING_KEY);
    if (!pendingSepay) {
      return;
    }

    try {
      const { orderId, orderNumber, timestamp } = JSON.parse(pendingSepay);
      const ageMinutes = (Date.now() - Number(timestamp || 0)) / 1000 / 60;
      if (ageMinutes >= 15) {
        localStorage.removeItem(SEPAY_PENDING_KEY);
        return;
      }

      toast.warning(`Đơn #${orderNumber} đang chờ xác nhận Chuyển khoản (SePay)`, {
        duration: 10000,
        action: {
          label: "Xem đơn",
          onClick: () => navigate(`/orders/${orderId}`),
        },
      });
    } catch {
      localStorage.removeItem(SEPAY_PENDING_KEY);
    }
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (sepayPollingRef.current) {
        clearInterval(sepayPollingRef.current);
        sepayPollingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showSepayDialog || !sepaySession?.expiresAt) {
      setSepayTimeLeft("");
      return;
    }

    const updateCountdown = () => {
      const expiresAt = new Date(sepaySession.expiresAt).getTime();
      const remainingMs = expiresAt - Date.now();

      if (remainingMs <= 0) {
        setSepayTimeLeft("Expired");
        return;
      }

      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      setSepayTimeLeft(`${minutes}:${String(seconds).padStart(2, "0")}`);
    };

    updateCountdown();
    const countdownInterval = setInterval(updateCountdown, 1000);
    return () => clearInterval(countdownInterval);
  }, [showSepayDialog, sepaySession?.expiresAt]);

  const clearSepayPendingOrder = () => {
    localStorage.removeItem(SEPAY_PENDING_KEY);
    if (sepayPollingRef.current) {
      clearInterval(sepayPollingRef.current);
      sepayPollingRef.current = null;
    }
  };

  const checkSepayOrderStatus = async (orderId, options = {}) => {
    if (!orderId) {
      return false;
    }

    try {
      const response = await orderAPI.getById(orderId);
      const order = response?.data?.order || response?.data?.data?.order;
      if (!order) {
        return false;
      }

      if (order.paymentStatus === "PAID") {
        skipEmptySelectionGuardRef.current = true;
        setSelectedForCheckout([]);
        await getCart();
        clearSepayPendingOrder();
        setShowSepayDialog(false);
        toast.success("Thanh toán Chuyển khoản (SePay) thành công!");
        navigate(`/orders/${orderId}`, { replace: true });
        return true;
      }

      if (order.status === "CANCELLED" || order.status === "PAYMENT_FAILED") {
        clearSepayPendingOrder();
        setShowSepayDialog(false);
        toast.info("Đơn hàng đã hết hạn hoặc bị hủy");
        return true;
      }

      if (!options.silent) {
        toast.info("Hệ thống vẫn đang chờ xác nhận thanh toán");
      }
      return false;
    } catch {
      if (!options.silent) {
        toast.error("Không thể kiểm tra trạng thái thanh toán");
      }
      return false;
    }
  };

  const startSepayPolling = (orderId) => {
    if (!orderId) {
      return;
    }

    if (sepayPollingRef.current) {
      clearInterval(sepayPollingRef.current);
    }

    sepayPollingRef.current = setInterval(() => {
      void checkSepayOrderStatus(orderId, { silent: true });
    }, 5000);
  };

  const handleCopySepayContent = async () => {
    const orderCode = String(sepaySession?.orderCode || "").trim();
    if (!orderCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(orderCode);
      toast.success("Đã sao chép nội dung chuyển khoản");
    } catch {
      toast.error("Không thể sao chép nội dung");
    }
  };

  const handleSepayManualCheck = async () => {
    await checkSepayOrderStatus(sepaySession?.orderId, { silent: false });
  };

  // Áp dụng mã khuyến mãi
  const handleApplyPromotion = async () => {
    if (!promotionCode.trim()) {
      setPromotionError("Vui lòng nhập mã giảm giá");
      return;
    }

    setIsApplyingPromo(true);
    setPromotionError("");

    try {
      const response = await promotionAPI.apply({
        code: promotionCode,
        totalAmount: subtotal,
      });

      setAppliedPromotion(response.data.data);
      toast.success("Áp dụng mã thành công!");
    } catch (error) {
      setPromotionError(error.response?.data?.message || "Mã không hợp lệ");
      toast.error("Mã giảm giá không hợp lệ");
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleRemovePromotion = () => {
    setAppliedPromotion(null);
    setPromotionCode("");
    setPromotionError("");
    toast.info("Đã xóa mã giảm giá");
  };

  // Address handlers
  const handleSubmitAddress = async (formData, addressId) => {
    setIsSubmittingAddress(true);
    try {
      if (addressId) {
        await userAPI.updateAddress(addressId, formData);
        toast.success("Cập nhật địa chỉ thành công");
      } else {
        await userAPI.addAddress(formData);
        toast.success("Thêm địa chỉ thành công");
      }
      await getCurrentUser();
      setShowAddressDialog(false);
      setEditingAddressId(null);
    } catch {
      toast.error("Thao tác thất bại");
    } finally {
      setIsSubmittingAddress(false);
    }
  };

  const openEditAddress = (address) => {
    setEditingAddressId(address._id);
    setShowSelectAddressDialog(false);
    setShowAddressDialog(true);
  };

  const selectedAddress = user?.addresses?.find(
    (a) => a._id === selectedAddressId
  );
  const selectedPickupStoreId = selectedPickupStore?._id || null;
  const storeSelectorAddress = useMemo(() => {
    if (!selectedAddress) return null;
    return {
      province: selectedAddress.province,
      district: selectedAddress.district || selectedAddress.ward,
    };
  }, [selectedAddress]);

  const getFullAddress = (address) =>
    [address.detailAddress, address.ward, address.province]
      .filter(Boolean)
      .join(", ");

  useEffect(() => {
    setSelectedPickupStore(null);
  }, [selectedAddressId]);

  // Xử lý đặt hàng
  const handleCheckout = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    if (checkoutItems.length === 0) {
      setError("Không có sản phẩm nào để thanh toán");
      setIsLoading(false);
      navigate("/cart", { replace: true });
      return;
    }

    if (!selectedAddressId) {
      setError("Vui lòng chọn địa chỉ nhận hàng");
      setIsLoading(false);
      return;
    }

    if (
      effectiveFulfillmentType === "CLICK_AND_COLLECT" &&
      !selectedPickupStoreId
    ) {
      const message = "Vui lòng chọn cửa hàng nhận hàng";
      setError(message);
      setIsLoading(false);
      toast.error(message);
      return;
    }

    if (!selectedAddress) {
      setError("Không tìm thấy địa chỉ nhận hàng");
      setIsLoading(false);
      return;
    }

    try {
      const orderData = {
        fulfillmentType: effectiveFulfillmentType,
        preferredStoreId:
          effectiveFulfillmentType === "CLICK_AND_COLLECT"
            ? selectedPickupStoreId
            : undefined,
        shippingAddress: {
          fullName: selectedAddress.fullName,
          phoneNumber: selectedAddress.phoneNumber,
          province: selectedAddress.province,
          district: selectedAddress.district || selectedAddress.ward,
          ward: selectedAddress.ward,
          detailAddress: selectedAddress.detailAddress,
        },
        paymentMethod: formData.paymentMethod,
        note: formData.note,
        promotionCode: appliedPromotion?.code || null,
        items: checkoutItemsWithFinalPrice.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          productType: item.productType,
          price: item.finalizedPrice || item.originalPrice,
          originalPrice: item.originalPrice,
        })),
      };

      const response = await orderAPI.create(orderData);
      const createdOrder = response?.data?.order || response?.data?.data?.order;
      if (!createdOrder?._id) {
        throw new Error("Không nhận được thông tin đơn hàng từ server");
      }

      const deferredMethods = ["VNPAY", "BANK_TRANSFER"];
      console.log(
        "Should clear cart:",
        !deferredMethods.includes(formData.paymentMethod)
      );

      if (formData.paymentMethod === "VNPAY") {
        setIsRedirectingToPayment(true);
        try {
          const vnpayResponse = await vnpayAPI.createPaymentUrl({
            orderId: createdOrder._id,
            amount: createdOrder.totalAmount,
            orderDescription: `Thanh toán đơn hàng ${createdOrder.orderNumber}`,
            language: "vn",
          });

          if (!vnpayResponse.data?.success) {
            throw new Error("Không thể tạo link thanh toán");
          }

          localStorage.setItem(
            VNPAY_PENDING_KEY,
            JSON.stringify({
              orderId: createdOrder._id,
              orderNumber: createdOrder.orderNumber,
              selectedItems: selectedForCheckout,
              totalAmount: createdOrder.totalAmount,
              timestamp: Date.now(),
            })
          );

          window.location.href = vnpayResponse.data.data.paymentUrl;
        } catch {
          setIsRedirectingToPayment(false);
          await orderAPI.cancel(createdOrder._id, {
            reason: "Không thể tạo link thanh toán VNPay",
          });
          toast.error("Lỗi khi tạo link thanh toán VNPay");
        }
      } else if (formData.paymentMethod === "BANK_TRANSFER") {
        try {
          const sepayResponse = await sepayAPI.createQr({
            orderId: createdOrder._id,
          });
          const sepayData = sepayResponse?.data?.data;
          if (!sepayResponse?.data?.success || !sepayData?.qrUrl) {
            throw new Error("Không thể tạo mã QR Chuyển khoản (SePay)");
          }

          console.info("[SEPAY][checkout] createQr response", {
            orderId: createdOrder._id,
            orderNumber: createdOrder.orderNumber,
            success: Boolean(sepayResponse?.data?.success),
            backendMessage: sepayResponse?.data?.message || "",
            orderCode: sepayData?.orderCode || "",
            qrUrl: sepayData?.qrUrl || "",
          });

          const session = {
            orderId: createdOrder._id,
            orderNumber: createdOrder.orderNumber,
            amount: Number(sepayData.amount || createdOrder.totalAmount || 0),
            qrUrl: sepayData.qrUrl,
            orderCode: sepayData.orderCode,
            instruction: sepayData.instruction,
            expiresAt: sepayData.expiresAt,
            timestamp: Date.now(),
          };

          setSepaySession(session);
          setShowSepayDialog(true);
          localStorage.setItem(SEPAY_PENDING_KEY, JSON.stringify(session));
          startSepayPolling(createdOrder._id);
          toast.success("Đơn hàng đã tạo. Vui lòng quét QR để thanh toán");
        } catch (error) {
          console.error("[SEPAY][checkout] createQr failed", {
            orderId: createdOrder._id,
            orderNumber: createdOrder.orderNumber,
            requestBody: {
              orderId: createdOrder._id,
            },
            responseStatus: error?.response?.status || null,
            responseData: error?.response?.data || null,
            message: error?.message || "",
          });
          await orderAPI.cancel(createdOrder._id, {
            reason:
              error?.response?.data?.message ||
              "Không thể tạo mã QR Chuyển khoản (SePay)",
          });
          toast.error(
            error?.response?.data?.message ||
              "Lỗi khi tạo QR thanh toán Chuyển khoản (SePay)"
          );
        }
      } else {
        skipEmptySelectionGuardRef.current = true;
        setSelectedForCheckout([]);

        await new Promise((resolve) => setTimeout(resolve, 500));
        await getCart();

        const freshCart = useCartStore.getState().cart;
        const selectedVariantIds = checkoutItems.map((i) => i.variantId);
        const stillInCart =
          freshCart?.items?.filter((item) =>
            selectedVariantIds.includes(item.variantId)
          ) || [];

        if (stillInCart.length > 0) {
          for (const item of stillInCart) {
            try {
              await cartAPI.removeItem(item.variantId);
            } catch (err) {
              if (err.response?.status !== 404) {
                console.error(`Failed to remove ${item.variantId}:`, err);
              }
            }
          }
          await getCart();
        }

        toast.success("Đặt hàng thành công!");
        setTimeout(() => {
          navigate(`/orders/${createdOrder._id}`, { replace: true });
        }, 300);
      }
    } catch (error) {
      console.error("Order error:", {
        message: error?.message,
        status: error?.response?.status,
        data: error?.response?.data,
      });
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Đặt hàng thất bại";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      if (formData.paymentMethod !== "VNPAY") {
        setIsLoading(false);
      }
    }
  };

  if (!cart || cart.items?.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">Giỏ hàng trống</p>
        <Button onClick={() => navigate("/products")}>Tiếp tục mua sắm</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <button
        onClick={() => navigate("/cart")}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Quay lại giỏ hàng</span>
      </button>
      <h1 className="text-3xl font-bold mb-8">Thanh toán</h1>
      {/* {isLocalOmnichannelFlagEnabled && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            {isOmnichannelCheckoutEnabled ? "Canary" : "Rollout"}
          </Badge>
        </div>
      )} */}

      <form onSubmit={handleCheckout}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Địa chỉ nhận hàng */}
            <Card>
              <CardHeader>
                <CardTitle>Địa chỉ nhận hàng</CardTitle>
              </CardHeader>
              <CardContent>
                {user?.addresses?.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      Bạn chưa có địa chỉ nào
                    </p>
                    <Button onClick={() => setShowAddressDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Thêm địa chỉ mới
                    </Button>
                  </div>
                ) : selectedAddress ? (
                  <div
                    className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition"
                    onClick={() => setShowSelectAddressDialog(true)}
                  >
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-red-500 mt-1" />
                      <div>
                        <p className="font-medium">
                          {selectedAddress.fullName} (+84){" "}
                          {selectedAddress.phoneNumber.replace(/^0/, "")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {getFullAddress(selectedAddress)}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hình thức nhận hàng</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg hover:bg-muted transition">
                  <input
                    type="radio"
                    name="fulfillmentType"
                    value="HOME_DELIVERY"
                    checked={effectiveFulfillmentType === "HOME_DELIVERY"}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary"
                  />
                  <div>
                    <p className="font-medium">Giao tận nhà </p>
                    <p className="text-sm text-muted-foreground">
                      Nhận hàng tại địa chỉ của bạn
                    </p>
                  </div>
                </label>

                {isOmnichannelCheckoutEnabled && (
                  <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg hover:bg-muted transition">
                  <input
                    type="radio"
                    name="fulfillmentType"
                    value="CLICK_AND_COLLECT"
                    checked={effectiveFulfillmentType === "CLICK_AND_COLLECT"}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary"
                  />
                  <div>
                    <p className="font-medium">Click & Collect</p>
                    <p className="text-sm text-muted-foreground">
                      Đặt online, nhận tại cửa hàng
                    </p>
                  </div>
                  </label>
                )}

                {effectiveFulfillmentType === "CLICK_AND_COLLECT" && (
                  <div className="border rounded-lg p-3 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Chọn cửa hàng để nhận đơn hàng
                    </p>
                    <StoreSelector
                      onSelectStore={setSelectedPickupStore}
                      selectedStoreId={selectedPickupStoreId}
                      customerAddress={storeSelectorAddress}
                    />
                    {!selectedPickupStoreId && (
                      <p className="text-sm text-red-600">
                        Vui lòng chọn cửa hàng trước khi đặt hàng.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ghi chú */}
            <Card>
              <CardHeader>
                <CardTitle>Ghi chú đơn hàng</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  name="note"
                  className="w-full min-h-[100px] px-3 py-2 border rounded-md resize-none"
                  placeholder="Ghi chú cho đơn hàng..."
                  value={formData.note}
                  onChange={handleChange}
                />
              </CardContent>
            </Card>

            {/* Phương thức thanh toán */}
            <Card>
              <CardHeader>
                <CardTitle>Phương thức thanh toán</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg hover:bg-muted transition">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="COD"
                    checked={formData.paymentMethod === "COD"}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary"
                  />
                  <div>
                    <p className="font-medium">
                      Thanh toán khi nhận hàng (COD)
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Thanh toán bằng tiền mặt khi nhận hàng
                    </p>
                  </div>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg hover:bg-muted transition">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="VNPAY"
                    checked={formData.paymentMethod === "VNPAY"}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary"
                  />
                  <div>
                    <p className="font-medium">Thanh toán VNPay</p>
                    <p className="text-sm text-muted-foreground">
                      Thanh toán qua ATM, Visa, MasterCard, JCB
                    </p>
                  </div>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg hover:bg-muted transition">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="BANK_TRANSFER"
                    checked={formData.paymentMethod === "BANK_TRANSFER"}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary"
                  />
                  <div>
                    <p className="font-medium">Chuyển khoản (SePay)</p>
                    <p className="text-sm text-muted-foreground">
                      Quét mã QR và chuyển khoản qua ứng dụng ngân hàng hỗ trợ SePay
                    </p>
                  </div>
                </label>
              </CardContent>
            </Card>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle>
                  Đơn hàng ({checkoutItems.length} sản phẩm)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {checkoutItemsWithFinalPrice.map((item) => (
                    <div
                      key={item.variantId}
                      className="flex gap-3 items-center"
                    >
                      <img
                        src={item.images?.[0] || "/placeholder.png"}
                        alt={item.productName}
                        className="w-14 h-14 object-cover rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.productName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            item.variantColor,
                            item.variantStorage,
                            item.variantConnectivity,
                            item.variantName,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SL: {item.quantity}
                        </p>
                      </div>
                      <div className="text-right">
                        {appliedPromotion ? (
                          <>
                            <p className="text-xs line-through text-muted-foreground">
                              {formatPrice(item.originalPrice * item.quantity)}
                            </p>
                            <p className="text-sm font-semibold text-red-600">
                              {formatPrice(item.finalizedPrice * item.quantity)}
                            </p>
                          </>
                        ) : (
                          <span className="text-sm font-medium">
                            {formatPrice(item.originalPrice * item.quantity)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mã giảm giá */}
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-2 block">
                    Mã giảm giá
                  </Label>
                  {!appliedPromotion ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Nhập mã giảm giá"
                          value={promotionCode}
                          onChange={(e) => {
                            setPromotionCode(e.target.value.toUpperCase());
                            setPromotionError("");
                          }}
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleApplyPromotion()
                          }
                          disabled={isApplyingPromo}
                          className="uppercase"
                        />
                        <Button
                          onClick={handleApplyPromotion}
                          disabled={isApplyingPromo || !promotionCode.trim()}
                          variant="outline"
                          className="whitespace-nowrap"
                        >
                          {isApplyingPromo ? "Đang áp dụng..." : "Áp dụng"}
                        </Button>
                      </div>
                      {promotionError && (
                        <p className="text-sm text-red-600">{promotionError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-green-700">
                          Mã: {appliedPromotion.code}
                        </p>
                        <p className="text-sm text-green-600">
                          Giảm: {formatPrice(appliedPromotion.discountAmount)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemovePromotion}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        Xóa
                      </Button>
                    </div>
                  )}
                </div>

                {/* Tổng tiền */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Tạm tính:</span>
                    <span>{formatPrice(discountedSubtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Phí vận chuyển:</span>
                    <span>
                      {shippingFee === 0
                        ? "Miễn phí"
                        : formatPrice(shippingFee)}
                    </span>
                  </div>
                  {appliedPromotion && (
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>Giảm giá:</span>
                      <span>
                        -{formatPrice(appliedPromotion.discountAmount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t font-bold text-lg">
                    <span>Tổng cộng:</span>
                    <span className="text-red-600">
                      {formatPrice(finalTotal)}
                    </span>
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={
                    isLoading ||
                    checkoutItems.length === 0 ||
                    finalTotal <= 0 ||
                    (effectiveFulfillmentType === "CLICK_AND_COLLECT" &&
                      !selectedPickupStoreId) ||
                    isRedirectingToPayment
                  }
                >
                  {isRedirectingToPayment
                    ? "Đang chuyển đến cổng thanh toán..."
                    : isLoading
                    ? "Đang xử lý..."
                    : "Đặt hàng"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      <Dialog
        open={showSepayDialog}
        onOpenChange={(open) => {
          setShowSepayDialog(open);
          if (!open && sepayPollingRef.current) {
            clearInterval(sepayPollingRef.current);
            sepayPollingRef.current = null;
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thanh toán Chuyển khoản (SePay)</DialogTitle>
            <DialogDescription>
              Quet QR để chuyển khoản, hệ thống sẽ tự động cập nhật khi nhận tiền.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm">
              <p>
                <span className="font-medium">Mã đơn:</span>{" "}
                {sepaySession?.orderNumber}
              </p>
              <p>
                <span className="font-medium">Số tiền:</span>{" "}
                {formatPrice(sepaySession?.amount || 0)}
              </p>
              <p>
                <span className="font-medium">Nội dung:</span>{" "}
                {sepaySession?.orderCode}
              </p>
              <p>
                <span className="font-medium">Còn lại:</span>{" "}
                {sepayTimeLeft || "..."}
              </p>
            </div>

            {sepaySession?.qrUrl && (
              <div className="flex justify-center rounded-lg border p-3">
                <img
                  src={sepaySession.qrUrl}
                  alt="QR Chuyển khoản (SePay)"
                  className="h-56 w-56 object-contain"
                  onLoad={() => {
                    console.info("[SEPAY][checkout] QR image loaded", {
                      orderId: sepaySession?.orderId || "",
                      orderNumber: sepaySession?.orderNumber || "",
                      orderCode: sepaySession?.orderCode || "",
                      qrUrl: sepaySession?.qrUrl || "",
                    });
                  }}
                  onError={(event) => {
                    console.error("[SEPAY][checkout] QR image failed", {
                      orderId: sepaySession?.orderId || "",
                      orderNumber: sepaySession?.orderNumber || "",
                      orderCode: sepaySession?.orderCode || "",
                      qrUrl: sepaySession?.qrUrl || "",
                      currentSrc: event.currentTarget?.currentSrc || "",
                    });
                  }}
                />
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {sepaySession?.instruction ||
                "Vui lòng chuyển khoản đúng nội dung để xác nhận tự động."}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleCopySepayContent}>
                <Copy className="mr-2 h-4 w-4" />
                Copy nội dung
              </Button>
              <Button onClick={handleSepayManualCheck}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tôi đã chuyển
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate(`/orders/${sepaySession?.orderId}`)}
            >
              Xem đơn hàng
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog chọn địa chỉ */}
      <Dialog
        open={showSelectAddressDialog}
        onOpenChange={setShowSelectAddressDialog}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chọn địa chỉ nhận hàng</DialogTitle>
            <DialogDescription>
              Chọn hoặc thêm địa chỉ để nhận hàng.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {user?.addresses?.map((address) => (
              <div
                key={address._id}
                className="flex items-center justify-between border-b pb-2 last:border-b-0"
              >
                <label className="flex items-center gap-4 flex-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={selectedAddressId === address._id}
                    onChange={() => {
                      setSelectedAddressId(address._id);
                      setShowSelectAddressDialog(false);
                    }}
                    className="w-5 h-5 text-red-500"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {address.fullName} (+84){" "}
                        {address.phoneNumber.replace(/^0/, "")}
                      </span>
                      {address.isDefault && (
                        <Badge variant="secondary">Mặc định</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getFullAddress(address)}
                    </p>
                  </div>
                </label>
                <Button
                  variant="link"
                  className="text-blue-600"
                  onClick={() => openEditAddress(address)}
                >
                  Sửa
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full text-red-500"
              onClick={() => {
                setEditingAddressId(null);
                setShowSelectAddressDialog(false);
                setShowAddressDialog(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Thêm Địa Chỉ Mới
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AddressFormDialog
        open={showAddressDialog}
        onOpenChange={setShowAddressDialog}
        onSubmit={handleSubmitAddress}
        editingAddress={
          editingAddressId
            ? user?.addresses?.find((a) => a._id === editingAddressId)
            : null
        }
        isLoading={isSubmittingAddress}
      />
    </div>
  );
};

export default CheckoutPage;




