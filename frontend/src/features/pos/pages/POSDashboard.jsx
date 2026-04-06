// ============================================
// FILE: frontend/src/pages/pos-staff/POSDashboard.jsx
// ✅ V3: Fixed - Chọn sản phẩm → Tạo đơn POS
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { toast } from "sonner";
import {
  Bell,
  Search,
  ShoppingCart,
  Plus,
  Trash2,
  User,
  ArrowRight,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { formatPrice } from "@/shared/lib/utils";
import {
  ProductVariantSelector,
  productTypeAPI,
  universalProductAPI,
} from "@/features/catalog";
import { authAPI } from "@/features/auth";
import { notificationAPI } from "@/features/orders";
import { promotionAPI } from "@/features/promotions";
import { posAPI } from "../api/pos.api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { CustomerCheckDialog } from "@/features/pos";

const POSDashboard = () => {
  const navigate = useNavigate();

  // ============================================
  // STATE
  // ============================================
  const [products, setProducts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(""); // This will be productTypeId
  const [isLoading, setIsLoading] = useState(false);

  // Cart state
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [customerExists, setCustomerExists] = useState(null);
  const [checkingCustomer, setCheckingCustomer] = useState(false);
  const [showCustomerCheckDialog, setShowCustomerCheckDialog] = useState(false);

  // Product selection dialog
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);

  // Promotion state
  const [promotionCode, setPromotionCode] = useState("");
  const [appliedPromotion, setAppliedPromotion] = useState(null);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

  const buildCustomerPasswordPreview = (fullName, phoneNumber) => {
    const compactName = String(fullName || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
    const last3Digits = String(phoneNumber || "").trim().slice(-3);
    return `${compactName}@${last3Digits}`;
  };

  // ============================================
  // LOAD PRODUCT TYPES
  // ============================================
  useEffect(() => {
    const loadTypes = async () => {
      try {
        const res = await productTypeAPI.getPublic({ status: "ACTIVE" });
        const types = res.data?.data?.productTypes || res.data?.productTypes || [];
        setProductTypes(types);
        if (types.length > 0 && !selectedCategory) {
          setSelectedCategory(types[0]._id);
        }
      } catch (e) {
        console.error("Error loading product types:", e);
      }
    };
    loadTypes();
  }, []);

  // ============================================
  // HELPER FOR IMAGE URL
  // ============================================
  const getImageUrl = (path) => {
    if (!path) return "https://via.placeholder.com/100?text=No+Image";
    if (path.startsWith("http")) return path;
    const baseUrl = String(import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "");
    return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  };

  // ============================================
  // TÍNH TOÁN GIẢM GIÁ THEO TỶ LỆ
  // ============================================
  const checkoutItemsWithFinalPrice = useMemo(() => {
    if (cart.length === 0) return [];

    const discountAmount = appliedPromotion?.discountAmount || 0;

    if (discountAmount === 0) {
      return cart.map((item) => ({
        ...item,
        originalPrice: item.price,
        finalizedPrice: item.price,
      }));
    }

    const subtotal = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    let remainingDiscount = discountAmount;

    return cart.map((item, index) => {
      const itemSubtotal = item.price * item.quantity;
      const ratio = itemSubtotal / subtotal;
      let itemDiscount = Math.round(ratio * discountAmount);

      if (index === cart.length - 1) {
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
  }, [cart, appliedPromotion?.discountAmount]);

  // ============================================
  // CALCULATIONS
  // ============================================
  const getTotal = () => {
    return checkoutItemsWithFinalPrice.reduce(
      (sum, item) =>
        sum + (item.finalizedPrice || item.originalPrice) * item.quantity,
      0
    );
  };

  // ============================================
  // PROMOTION HANDLERS
  // ============================================
  const handleApplyPromotion = async () => {
    if (!promotionCode.trim()) {
      toast.error("Vui lòng nhập mã giảm giá");
      return;
    }

    const subtotal = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    if (subtotal === 0) {
      toast.error("Giỏ hàng trống");
      return;
    }

    setIsApplyingPromo(true);
    try {
      const response = await promotionAPI.apply({
        code: promotionCode.trim().toUpperCase(),
        totalAmount: subtotal,
      });

      setAppliedPromotion(response.data.data);
      toast.success(
        `Áp dụng mã thành công! Giảm ${formatPrice(
          response.data.data.discountAmount
        )}`
      );
    } catch (error) {
      toast.error(error.response?.data?.message || "Mã giảm giá không hợp lệ");
      console.error("Lỗi áp dụng mã:", error);
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleRemovePromotion = () => {
    setAppliedPromotion(null);
    setPromotionCode("");
    toast.info("Đã xóa mã giảm giá");
  };

  // ============================================
  // FETCH PRODUCTS
  // ============================================
  const fetchProducts = useCallback(async () => {
    if (!selectedCategory) return;

    try {
      setIsLoading(true);
      // Use the productType filter directly supported by backend
      const response = await universalProductAPI.getAll({ 
        limit: 100,
        productType: selectedCategory,
        search: searchQuery
      });
      
      const productData = response?.data?.data?.products || [];
      setProducts(Array.isArray(productData) ? productData : []);
    } catch (error) {
      console.error("Lỗi tải sản phẩm:", error);
      toast.error("Không thể tải sản phẩm");
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const response = await notificationAPI.getMyNotifications({ isRead: false });
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.pagination?.total || 0);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);

    return () => clearInterval(interval);
  }, []);

  // ============================================
  // PRODUCT SELECTION
  // ============================================
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setSelectedVariant(null);
    setShowProductDialog(true);
  };

  const handleAddToCart = () => {
    if (!selectedVariant) {
      toast.error("Vui lòng chọn phiên bản");
      return;
    }

    if (selectedVariant.stock === 0) {
      toast.error("Sản phẩm đã hết hàng");
      return;
    }

    // Get the main product image (first variant's first image) 
    // strictly as requested: "ảnh đầu tiên của màu sắc đầu tiên của biến thể đầu tiên"
    // Ideally this is the first variant in the list.
    // Get the main product image (first variant's first image)
    // strictly as requested: "ảnh đầu tiên của màu sắc đầu tiên của biến thể đầu tiên"
    // Ideally this is the first variant in the list.
    const safeVariants = Array.isArray(selectedProduct.variants) ? selectedProduct.variants : [];
    let firstVariant = safeVariants.find((v) => v.stock > 0 && v.sku && v.slug);
    if (!firstVariant) firstVariant = safeVariants.find((v) => v.sku && v.slug);
    if (!firstVariant) firstVariant = safeVariants.find((v) => v.sku);
    if (!firstVariant) firstVariant = safeVariants[0];

    const mainImage = firstVariant?.images?.[0] || 
                      (Array.isArray(selectedProduct.images) ? selectedProduct.images[0] : null) || 
                      selectedProduct.image || 
                      selectedProduct.featuredImages?.[0];

    const existingIndex = cart.findIndex(
      (item) => item.variantId === selectedVariant._id
    );

    if (existingIndex >= 0) {
      const newCart = [...cart];
      if (newCart[existingIndex].quantity >= selectedVariant.stock) {
        toast.error("Không đủ hàng trong kho");
        return;
      }
      newCart[existingIndex].quantity += 1;
      setCart(newCart);
      toast.success("Đã tăng số lượng");
    } else {
      setCart([
        ...cart,
        {
          productId: selectedProduct._id,
          variantId: selectedVariant._id,
          productType: selectedProduct.productType?._id || selectedProduct.category, // fallback
          productName: selectedProduct.name,
          variantSku: selectedVariant.sku,
          variantColor: selectedVariant.color,
          variantStorage: selectedVariant.storage || "",
          variantConnectivity: selectedVariant.connectivity || "",
          variantName: selectedVariant.variantName || "",
          variantCpuGpu: selectedVariant.cpuGpu || "",
          variantRam: selectedVariant.ram || "",
          price: selectedVariant.price,
          quantity: 1,
          stock: selectedVariant.stock,
          image: getImageUrl(mainImage),
        },
      ]);
      toast.success("Đã thêm vào giỏ hàng");
    }

    setShowProductDialog(false);
  };

  // ============================================
  // CART MANAGEMENT
  // ============================================
  const updateQuantity = (variantId, newQuantity) => {
    if (newQuantity < 1) {
      removeFromCart(variantId);
      return;
    }

    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.variantId === variantId) {
          if (newQuantity > item.stock) {
            toast.error("Không đủ hàng trong kho");
            return item;
          }
          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  };

  const removeFromCart = (variantId) => {
    setCart(cart.filter((item) => item.variantId !== variantId));
    toast.success("Đã xóa khỏi giỏ hàng");
  };

  const clearCart = () => {
    if (window.confirm("Xóa tất cả sản phẩm?")) {
      setCart([]);
      setAppliedPromotion(null);
      setPromotionCode("");
      toast.success("Đã xóa giỏ hàng");
    }
  };

  // ============================================
  // CREATE ORDER
  // ============================================
  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      toast.error("Giỏ hàng trống");
      return;
    }

    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error("Vui lòng nhập thông tin khách hàng");
      return;
    }

    setIsLoading(true);
    try {
      const totalAmount = checkoutItemsWithFinalPrice.reduce(
        (sum, item) =>
          sum + (item.finalizedPrice || item.originalPrice) * item.quantity,
        0
      );

      await posAPI.createOrder({
        orderSource: "IN_STORE",
        items: checkoutItemsWithFinalPrice.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          productType: item.productType,
          quantity: item.quantity,
          price: item.finalizedPrice || item.originalPrice,
          originalPrice: item.originalPrice,
        })),
        customerInfo: {
          fullName: customerName.trim(),
          phoneNumber: customerPhone.trim(),
        },
        totalAmount,
        promotionCode: appliedPromotion?.code || null,
      });

      toast.success("Tạo đơn bán hàng thành công. Đơn đang chờ Order Manager xử lý.");

      // Reset form
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setAppliedPromotion(null);
      setPromotionCode("");
      setCustomerExists(null);
    } catch (error) {
      console.error("Lỗi tạo đơn:", error);
      toast.error(error.response?.data?.message || "Lỗi tạo đơn hàng");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickRegister = async ({ skipConfirm = false } = {}) => {
    try {
      if (!customerPhone.trim() || !customerName.trim()) {
        toast.error("Thiếu thông tin khách hàng để đăng ký");
        return;
      }

      setIsLoading(true);
      const res = await authAPI.quickRegister({
        fullName: customerName,
        phoneNumber: customerPhone,
      });

      if (res.data.success) {
        setCustomerExists(true);
        toast.success(`Đăng ký thành công! Mật khẩu: ${res.data.password}`);
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Đăng ký thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckCustomer = async () => {
    if (!customerPhone.trim()) return;

    try {
      setCheckingCustomer(true);
      const response = await authAPI.checkCustomer(customerPhone.trim());
      setCustomerExists(response.data.exists);

      if (response.data.exists && response.data.customer) {
        setCustomerName(response.data.customer.fullName);
        toast.success("Tìm thấy khách hàng!");
        return;
      }

      // If not found, open dialog
      setShowCustomerCheckDialog(true);
      
    } catch (error) {
      console.error("Error checking customer:", error);
    } finally {
      setCheckingCustomer(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <CustomerCheckDialog 
        open={showCustomerCheckDialog} 
        onOpenChange={setShowCustomerCheckDialog}
        onConfirm={() => {
          setShowCustomerCheckDialog(false);
          handleQuickRegister({ skipConfirm: true });
        }}
        customerName={customerName}
        customerPhone={customerPhone}
      />

      {/* LEFT COLUMN: PRODUCTS */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header & Categories */}
        <div className="bg-white p-4 border-b flex flex-col gap-4 shadow-sm z-10">
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-gray-500" />
                <Input 
                  placeholder="Tìm kiếm sản phẩm..." 
                  className="w-64" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
             </div>
             <div className="text-sm font-medium text-gray-500">
               {products.length} sản phẩm
             </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
             {productTypes.map(type => (
               <Button 
                key={type._id}
                variant={selectedCategory === type._id ? "default" : "outline"} 
                onClick={() => setSelectedCategory(type._id)}
                size="sm"
                className="rounded-full px-6 whitespace-nowrap"
               >
                 {type.name}
               </Button>
             ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
           {isLoading ? (
             <div className="flex justify-center py-12">Loading...</div>
           ) : (
             <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map(product => (
                   <Card key={product._id} className="cursor-pointer hover:shadow-lg transition-all border-none shadow-sm" onClick={() => handleSelectProduct(product)}>
                      <div className="p-4 flex flex-col h-full bg-white rounded-lg">
                         <div className="h-40 w-full mb-4 flex items-center justify-center bg-gray-50 rounded-md">
                           <img 
                              src={getImageUrl(
                                product.variants?.[0]?.images?.[0] || 
                                product.featuredImages?.[0] ||
                                product.image
                              )} 
                              className="h-32 w-auto object-contain mix-blend-multiply"
                              alt={product.name}
                           />
                         </div>
                         <h3 className="font-semibold text-sm line-clamp-2 mb-1">{product.name}</h3>
                         <div className="mt-auto pt-2 flex justify-between items-end">
                            <span className="font-bold text-primary">
                              {product.minPrice ? formatPrice(product.minPrice) : 
                               (product.variants?.[0]?.price ? formatPrice(product.variants[0].price) : "Liên hệ")}
                            </span>
                            {product.variants?.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {product.variants.length} bản
                              </Badge>
                            )}
                         </div>
                      </div>
                   </Card>
                ))}
             </div>
           )}
        </div>
      </div>

      {/* RIGHT COLUMN: CART & CHECKOUT */}
      <div className="w-[420px] bg-white border-l shadow-xl flex flex-col h-full z-20">
         {/* Customer Info */}
         <div className="p-5 border-b bg-gray-50 space-y-4">
            <h2 className="font-bold flex items-center gap-2">
              <User className="w-5 h-5" /> Thông tin khách hàng
            </h2>
            <div className="grid grid-cols-3 gap-2">
               <div className="col-span-2 relative">
                 <Input 
                  placeholder="Số điện thoại" 
                  value={customerPhone} 
                  onChange={e => setCustomerPhone(e.target.value)} 
                 />
                 {customerExists === true && <CheckCircle className="w-4 h-4 text-green-500 absolute right-3 top-3" />}
                 {customerExists === false && <XCircle className="w-4 h-4 text-red-500 absolute right-3 top-3" />}
               </div>
               <Button variant="outline" onClick={handleCheckCustomer} disabled={checkingCustomer}>
                 {checkingCustomer ? "..." : "Kiểm tra"}
               </Button>
            </div>
            <Input 
              placeholder="Tên khách hàng" 
              value={customerName} 
              onChange={e => setCustomerName(e.target.value)}
              disabled={customerExists === true} // Disable name edit if found
            />
         </div>

         {/* Cart List */}
         <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {cart.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>Giỏ hàng trống</p>
              </div>
            ) : (
              cart.map((item, idx) => (
               <div key={`${item.variantId}-${idx}`} className="flex gap-3 group relative">
                  <div className="w-16 h-16 bg-gray-50 rounded-md border flex items-center justify-center p-1">
                    <img src={item.image} className="max-w-full max-h-full object-contain" alt="" />
                  </div>
                  <div className="flex-1 min-w-0">
                     <p className="text-sm font-medium truncate">{item.productName}</p>
                     <p className="text-xs text-gray-500 mb-1">
                       {[item.variantColor, item.variantStorage].filter(Boolean).join(" - ")}
                     </p>
                     <div className="flex justify-between items-center">
                        <span className="font-bold text-sm">{formatPrice(item.price)}</span>
                        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                           <button className="w-6 h-6 flex items-center justify-center hover:bg-white rounded" onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>-</button>
                           <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                           <button className="w-6 h-6 flex items-center justify-center hover:bg-white rounded" onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>+</button>
                        </div>
                     </div>
                  </div>
                  <button onClick={() => removeFromCart(item.variantId)} className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 p-1 bg-red-100 text-red-500 rounded-full">
                    <Trash2 className="w-3 h-3" />
                  </button>
               </div>
              ))
            )}
         </div>

         {/* Footer Actions */}
         <div className="p-5 border-t bg-gray-50 space-y-4">
            <div className="space-y-2 text-sm">
               <div className="flex justify-between text-gray-600">
                 <span>Tạm tính</span>
                 <span>{formatPrice(cart.reduce((s, i) => s + i.price * i.quantity, 0))}</span>
               </div>
               {appliedPromotion && (
                 <div className="flex justify-between text-green-600">
                   <span>Giảm giá ({appliedPromotion.code})</span>
                   <span>-{formatPrice(appliedPromotion.discountAmount)}</span>
                 </div>
               )}
               <div className="flex justify-between text-xl font-bold pt-2 border-t">
                 <span>Tổng cộng</span>
                 <span className="text-primary">{formatPrice(getTotal())}</span>
               </div>
            </div>

            <Button 
              className="w-full text-lg h-12" 
              onClick={handleCreateOrder} 
              disabled={cart.length === 0 || isLoading}
            >
               {isLoading ? "Đang xử lý..." : "Tạo đơn bán hàng"}
            </Button>
            <Button variant="ghost" className="w-full text-red-500 h-8 text-xs" onClick={clearCart}>
               Xóa giỏ hàng
            </Button>
         </div>
      </div>

      {/* Product Variant Selection Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chọn phiên bản sản phẩm</DialogTitle>
            <DialogDescription>
              Vui lòng chọn màu sắc và cấu hình
            </DialogDescription>
          </DialogHeader>

          {selectedProduct && (
            <div className="space-y-4">
              <ProductVariantSelector
                product={selectedProduct}
                onVariantChange={setSelectedVariant}
                selectedVariant={selectedVariant}
              />

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowProductDialog(false)}
                >
                  Hủy
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAddToCart}
                  disabled={!selectedVariant || selectedVariant.stock === 0}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Thêm vào giỏ
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSDashboard;
