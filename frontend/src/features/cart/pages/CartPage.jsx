// ============================================
// FILE: src/pages/customer/CartPage.jsx
// FIXED: Không còn bị bỏ chọn khi tăng/giảm số lượng
// FIXED: Checkbox luôn click được, không bị disable vô cớ
// FIXED: Maximum Update Depth by optimizing useEffects to avoid infinite loops
// UPDATED: Dùng shadcn/ui Checkbox + màu đỏ khi chọn
// ============================================
import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Loading } from "@/shared/ui/Loading";
import { Trash2, Minus, Plus, ShoppingBag } from "lucide-react";
import { useCartStore } from "../state/cart.store";
import { formatPrice, cn } from "@/shared/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/shared/ui/checkbox";
import { universalProductAPI } from "@/features/catalog";

const CartPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const autoSelectVariantId = searchParams.get("select");
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const {
    cart,
    isLoading,
    getCart,
    updateCartItem,
    removeFromCart,
    addToCart,
    setSelectedForCheckout,
    shouldAutoSelect,
  } = useCartStore();

  const [selectedItems, setSelectedItems] = useState([]);
  const [variantsCache, setVariantsCache] = useState({});
  const [optimisticCart, setOptimisticCart] = useState(null);
  const [loadingVariants, setLoadingVariants] = useState({});
  const [isChangingVariant, setIsChangingVariant] = useState(false);
  const hasAutoSelected = useRef(false);
  const updateTimeoutRef = useRef(null);
  const [itemsOrder, setItemsOrder] = useState({});

  const items = optimisticCart?.items || cart?.items || [];
  const hasItems = items.length > 0;

  // Load giỏ hàng CHỈ 1 LẦN khi mount
  useEffect(() => {
    getCart();
  }, [getCart]); // getCart là stable function từ Zustand

  // Kiểm tra VNPay pending - CHỈ phụ thuộc vào cart items length
  useEffect(() => {
    if (!cart?.items || cart.items.length === 0) return;
    const pendingOrder = localStorage.getItem("pending_vnpay_order");
    if (!pendingOrder) return;
    try {
      const {
        orderId,
        orderNumber,
        selectedItems: pendingItems,
        timestamp,
      } = JSON.parse(pendingOrder);
      const ageMinutes = (Date.now() - timestamp) / 1000 / 60;
      if (ageMinutes < 15) {
        const stillInCart = cart.items.some((item) =>
          pendingItems?.includes(item.variantId)
        );
        if (stillInCart) {
          toast.warning(
            `Đơn hàng #${orderNumber} chưa thanh toán - Sản phẩm vẫn trong giỏ`,
            {
              duration: 12000,
              action: {
                label: "Xem chi tiết",
                onClick: () => navigate(`/orders/${orderId}`),
              },
            }
          );
        } else {
          localStorage.removeItem("pending_vnpay_order");
        }
      } else {
        toast.info("Đơn hàng VNPay đã hết hạn - Vui lòng đặt lại", {
          duration: 6000,
        });
        localStorage.removeItem("pending_vnpay_order");
      }
    } catch (e) {
      console.error("Error checking pending order:", e);
    }
  }, [cart?.items?.length, navigate]); // CHỈ phụ thuộc LENGTH, không phụ thuộc cả array

  // Auto-select sản phẩm - CHỈ chạy khi có query param HOẶC shouldAutoSelect thay đổi
  useEffect(() => {
    if (!cart?.items || cart.items.length === 0) return;

    const idToSelect = autoSelectVariantId || shouldAutoSelect();
    if (!idToSelect || hasAutoSelected.current) return;
    const item = cart.items.find((i) => i.variantId === idToSelect);
    if (item && !selectedItems.includes(idToSelect)) {
      setSelectedItems([idToSelect]);
      setItemsOrder((prev) => ({ ...prev, [idToSelect]: Date.now() }));
      hasAutoSelected.current = true;

      if (autoSelectVariantId) {
        navigate("/cart", { replace: true });
      }
    }
  }, [cart?.items, autoSelectVariantId, shouldAutoSelect, navigate]); // BỎ selectedItems

  // Reset flag khi query param thay đổi
  useEffect(() => {
    if (autoSelectVariantId) {
      hasAutoSelected.current = false;
    }
  }, [autoSelectVariantId]);

  // Scroll to top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Load order từ localStorage CHỈ 1 LẦN
  useEffect(() => {
    const saved = localStorage.getItem("cart-items-order");
    if (saved) {
      try {
        setItemsOrder(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Save order khi thay đổi
  useEffect(() => {
    if (Object.keys(itemsOrder).length > 0) {
      localStorage.setItem("cart-items-order", JSON.stringify(itemsOrder));
    }
  }, [itemsOrder]);

  // Cleanup items không còn trong giỏ - SỬ DỤNG CALLBACK
  const cleanupItemsOrder = useCallback(() => {
    if (!cart?.items || isChangingVariant) return;

    const existingIds = new Set(cart.items.map((i) => i.variantId));
    setItemsOrder((prev) => {
      const cleaned = {};
      let changed = false;

      for (const id in prev) {
        if (existingIds.has(id)) {
          cleaned[id] = prev[id];
        } else {
          changed = true;
        }
      }

      return changed ? cleaned : prev;
    });
  }, [cart?.items, isChangingVariant]);

  useEffect(() => {
    cleanupItemsOrder();
  }, [cleanupItemsOrder]);

  // Sync optimistic cart
  useEffect(() => {
    if (cart) setOptimisticCart(cart);
  }, [cart]);

  // Initialize order for new items
  useEffect(() => {
    if (!cart?.items || isChangingVariant) return;

    setItemsOrder((prev) => {
      const newOrder = { ...prev };
      let changed = false;

      cart.items.forEach((item) => {
        if (!newOrder[item.variantId]) {
          newOrder[item.variantId] = Date.now();
          changed = true;
        }
      });

      return changed ? newOrder : prev;
    });
  }, [cart?.items, isChangingVariant]);

  // Tính tổng tiền
  const selectedTotal = useMemo(() => {
    return items
      .filter((item) => selectedItems.includes(item.variantId))
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [items, selectedItems]);

  const sortedItems = useMemo(() => {
    if (!items.length) return [];
    const itemsWithIndex = items.map((item, index) => ({
      ...item,
      originalIndex: index,
    }));
    // Sắp xếp: timestamp lớn nhất (mới nhất) lên đầu
    const sorted = itemsWithIndex.sort((a, b) => {
      const timeA = itemsOrder[a.variantId] || 0;
      const timeB = itemsOrder[b.variantId] || 0;
      if (timeA !== timeB) return timeB - timeA; // Mới nhất trước
      return a.originalIndex - b.originalIndex;
    });
    return sorted; // ✅ BỎ reverse() để giữ thứ tự mới nhất ở trên
  }, [items, itemsOrder]);
  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Chọn/tắt tất cả
  const handleSelectAll = () => {
    if (selectedItems.length === items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map((i) => i.variantId));
    }
  };

  // Chọn/tắt một item
  const handleSelectItem = (variantId) => {
    setSelectedItems((prev) =>
      prev.includes(variantId)
        ? prev.filter((id) => id !== variantId)
        : [...prev, variantId]
    );
  };

  // Xóa nhiều
  const handleBulkRemove = () => {
  if (selectedItems.length === 0) {
    toast.error("Chọn ít nhất 1 sản phẩm");
    return;
  }
  setDeleteDialogOpen(true); // Mở dialog
};

const confirmBulkDelete = async () => {
  setDeleteDialogOpen(false);

  try {
    for (const id of selectedItems) {
      await removeFromCart(id);
    }
    await getCart();
    setSelectedItems([]);
    toast.success(`Đã xóa ${selectedItems.length} sản phẩm khỏi giỏ hàng`);
  } catch (error) {
    toast.error("Có lỗi xảy ra khi xóa sản phẩm");
    console.error(error);
  }
};

  // Cập nhật số lượng (có debounce + optimistic)
  const handleUpdateQuantity = (item, newQty) => {
    if (newQty < 1 || newQty > item.stock) return;

    // Optimistic update
    const updatedItems = items.map((i) =>
      i.variantId === item.variantId ? { ...i, quantity: newQty } : i
    );
    setOptimisticCart((prev) => ({ ...prev, items: updatedItems }));

    // Debounce API call
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    updateTimeoutRef.current = setTimeout(async () => {
      try {
        await updateCartItem(item.variantId, newQty);
      } catch {
        toast.error("Cập nhật số lượng thất bại");
        getCart();
      }
    }, 400);
  };

  // Xóa 1 sản phẩm
  const handleRemove = async (item) => {
    await removeFromCart(item.variantId);
    await getCart();
    setSelectedItems((prev) => prev.filter((id) => id !== item.variantId));
  };

  // Fetch variants - SIDE EFFECT MOVED TO USEEFFECT
  useEffect(() => {
    const loadMissingVariants = async () => {
      items.forEach((item) => {
        if (
          !variantsCache[item.productId] &&
          !loadingVariants[item.productId]
        ) {
          fetchAndCacheVariants(item);
        }
      });
    };
    loadMissingVariants();
  }, [items]); // Only run when items change

  // Fetch variants
  const fetchAndCacheVariants = async (item) => {
    // Double check inside async function
    if (loadingVariants[item.productId] || variantsCache[item.productId]) return;

    setLoadingVariants((prev) => ({ ...prev, [item.productId]: true }));
    try {
      const res = await universalProductAPI.getById(item.productId);
      const product = res.data.data.product;
      const variants = product.variants || [];

      const storages = [
        ...new Set(
          variants.map((v) => v.storage || v.variantName).filter(Boolean)
        ),
      ];
      const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];

      const cached = { variants, storages, colors };
      setVariantsCache((prev) => ({ ...prev, [item.productId]: cached }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingVariants((prev) => ({ ...prev, [item.productId]: false }));
    }
  };

  const getStorageOptions = (item) => {
    if (variantsCache[item.productId])
      return variantsCache[item.productId].storages;
    // Removed fetchAndCacheVariants(item) call from here
    return [item.variantStorage || item.variantName || "Standard"];
  };

  const getColorOptions = (item) => {
    if (variantsCache[item.productId])
      return variantsCache[item.productId].colors;
    // Removed fetchAndCacheVariants(item) call from here
    return [item.variantColor || "Default"];
  };

  // Đổi nhanh variant
  const handleQuickChangeVariant = async (item, type, newValue) => {
    const oldTimestamp = itemsOrder[item.variantId] || Date.now();
    setIsChangingVariant(true);

    try {
      let cached =
        variantsCache[item.productId] || (await fetchAndCacheVariants(item));
      if (!cached) throw new Error("Không tải được variant");

      const target =
        cached.variants.find((v) => {
          if (type === "storage") {
            return (
              (v.storage === newValue || v.variantName === newValue) &&
              (v.color === item.variantColor || !v.color)
            );
          } else {
            return (
              v.color === newValue &&
              (v.storage === item.variantStorage ||
                v.variantName === item.variantName ||
                !v.storage)
            );
          }
        }) ||
        cached.variants.find((v) =>
          type === "storage"
            ? v.storage || v.variantName === newValue
            : v.color === newValue
        );

      if (!target) throw new Error("Không tìm thấy phiên bản");
      if (target.stock === 0) throw new Error("Hết hàng");

      // Cập nhật order + selected trước khi thay đổi giỏ
      setItemsOrder((prev) => {
        const n = { ...prev };
        delete n[item.variantId];
        n[target._id] = oldTimestamp;
        return n;
      });

      if (selectedItems.includes(item.variantId)) {
        setSelectedItems((prev) =>
          prev.map((id) => (id === item.variantId ? target._id : id))
        );
      }

      await removeFromCart(item.variantId);
      await addToCart(target._id, item.quantity, item.productType);
      await getCart();

      toast.success(
        `Đổi ${type === "storage" ? "dung lượng" : "màu sắc"} thành công`
      );
    } catch (err) {
      toast.error(err.message || "Đổi phiên bản thất bại");
      getCart();
    } finally {
      setIsChangingVariant(false);
    }
  };

  if (isLoading && !cart) return <Loading />;

  return (
    <div className="container mx-auto px-4 pb-16">
      <h1 className="text-3xl font-bold mb-8">Giỏ hàng của bạn</h1>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShoppingBag className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Giỏ hàng trống</h3>
            <p className="text-muted-foreground mb-6">
              Bạn chưa có sản phẩm nào trong giỏ hàng
            </p>
            <Button onClick={() => navigate(-1)}>Tiếp tục mua sắm</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Header: Chọn tất cả */}
          <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={hasItems && selectedItems.length === items.length}
                onCheckedChange={handleSelectAll}
                className={cn(
                  "data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600",
                  "focus-visible:ring-red-600",
                  "border border-black" // Thêm viền màu đen
                )}
              />
              <span className="font-medium py-2">
                Chọn tất cả ({selectedItems.length}/{items.length})
              </span>
            </div>
            {selectedItems.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkRemove}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Xóa đã chọn
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Danh sách sản phẩm */}
            <div className="lg:col-span-2 space-y-4">
              {sortedItems.map((item) => {
                const isSelected = selectedItems.includes(item.variantId);

                return (
                  <Card
                    key={item.variantId}
                    className={cn(
                      "transition-all cursor-pointer hover:shadow-md",
                      "border border-transparent-hover ",
                      isSelected && "ring-2 ring-red-600 shadow-lg"
                    )}
                    // Click vào card = toggle chọn
                    onClick={() => handleSelectItem(item.variantId)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Checkbox */}
                        <div className="flex items-start /**/">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (!checked) {
                                setSelectedItems((p) =>
                                  p.filter((id) => id !== item.variantId)
                                );
                              } else {
                                setSelectedItems((p) => [...p, item.variantId]);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600",
                              "focus-visible:ring-red-600",
                              "border border-black" // Thêm viền màu đen
                            )}
                          />
                        </div>

                        {/* Hình + Info */}
                        <img
                          src={item.images?.[0] || "/placeholder.png"}
                          alt={item.productName}
                          className="w-24 h-24 object-cover rounded-md flex-shrink-0"
                        />

                        {/* Thông tin sản phẩm + hành động */}
                        <div className="flex-1 min-w-0 space-y-3">
                          {/* Tên sản phẩm */}
                          <h3 className="font-semibold text-lg line-clamp-2">
                            {item.productName}
                          </h3>

                          {/* Thông tin biến thể */}
                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                            {item.variantColor && (
                              <span>Màu: {item.variantColor}</span>
                            )}
                            {item.variantStorage && (
                              <span>{item.variantStorage}</span>
                            )}
                            {item.variantName && (
                              <span>{item.variantName}</span>
                            )}
                          </div>

                          {/* Giá */}
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-bold text-red-600">
                              {formatPrice(item.price)}
                            </span>
                            {item.originalPrice > item.price && (
                              <span className="text-sm text-muted-foreground line-through">
                                {formatPrice(item.originalPrice)}
                              </span>
                            )}
                          </div>

                          {/* Quantity + Variant Selects + Tổng tiền + Xóa */}
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                            {/* Left: Quantity + 2 Select */}
                            <div className="flex flex-wrap items-center gap-3">
                              {/* Số lượng */}
                              <div className="flex items-center border rounded-md">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateQuantity(
                                      item,
                                      item.quantity - 1
                                    );
                                  }}
                                  disabled={item.quantity <= 1}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-12 text-center font-medium">
                                  {item.quantity}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateQuantity(
                                      item,
                                      item.quantity + 1
                                    );
                                  }}
                                  disabled={item.quantity >= item.stock}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>

                              {/* Select Dung lượng / RAM */}
                              <Select
                                value={
                                  item.variantStorage || item.variantName || ""
                                }
                                onValueChange={(v) =>
                                  handleQuickChangeVariant(item, "storage", v)
                                }
                                disabled={loadingVariants[item.productId]}
                              >
                                <SelectTrigger
                                  className="w-[130px] sm:w-[140px] overflow-hidden whitespace-nowrap text-ellipsis"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <SelectValue
                                    placeholder="Dung lượng"
                                    className="truncate"
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {getStorageOptions(item).map((s) => (
                                    <SelectItem key={s} value={s}>
                                      <span className="block truncate">
                                        {s}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              {/* Select Màu sắc */}
                              <Select
                                value={item.variantColor || ""}
                                onValueChange={(v) =>
                                  handleQuickChangeVariant(item, "color", v)
                                }
                                disabled={loadingVariants[item.productId]}
                              >
                                <SelectTrigger
                                  className="w-[130px] sm:w-[140px] overflow-hidden whitespace-nowrap text-ellipsis"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <SelectValue
                                    placeholder="Màu"
                                    className="truncate"
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {getColorOptions(item).map((c) => (
                                    <SelectItem key={c} value={c}>
                                      <span className="flex items-center gap-2">
                                        <span className="block truncate">
                                          {c}
                                        </span>
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                            
                            </div>

                            {/* Right: Tổng tiền + Xóa */}
                            <div className="flex items-center justify-between sm:justify-end gap-4">
                              <span className="font-bold text-lg whitespace-nowrap">
                                {formatPrice(item.price * item.quantity)}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemove(item);
                                }}
                              >
                                <Trash2 className="h-5 w-5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Tóm tắt đơn hàng */}
            <div className="lg:col-span-1">
              <Card className="sticky top-20">
                <CardContent className="p-6 space-y-6">
                  <h3 className="text-xl font-bold">Tóm tắt đơn hàng</h3>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span>Tạm tính ({selectedItems.length} sản phẩm)</span>
                      <span className="font-medium">
                        {formatPrice(selectedTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Phí vận chuyển</span>
                      <span
                        className={
                          selectedTotal >= 5000000 ? "text-green-600" : ""
                        }
                      >
                        {selectedTotal >= 5000000 ? "Miễn phí" : "50.000đ"}
                      </span>
                    </div>
                    <div className="border-t pt-3">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Tổng cộng</span>
                        <span className="text-red-600">
                          {formatPrice(selectedTotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    className="w-full"
                    disabled={selectedItems.length === 0}
                    onClick={() => {
                      if (selectedItems.length === 0) {
                        toast.error("Vui lòng chọn ít nhất 1 sản phẩm");
                        return;
                      }
                      setSelectedForCheckout(selectedItems);
                      navigate("/cart/checkout");
                    }}
                  >
                    Tiến hành thanh toán
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate(-1)}
                  >
                    Tiếp tục mua sắm
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa sản phẩm</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa{" "}
              <strong>{selectedItems.length} sản phẩm</strong> đã chọn khỏi giỏ hàng không?
              <br />
              <span className="text-red-600 font-medium">
                Hành động này không thể hoàn tác.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Xóa vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CartPage;
