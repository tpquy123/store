// ============================================
// FILE: frontend/src/pages/HomePage.jsx
// Fully dynamic homepage layout from database
// ============================================

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Loading } from "@/shared/ui/Loading";
import DynamicSection from "../components/DynamicSection";
import { ProductEditModal, universalProductAPI } from "@/features/catalog";
import { useAuthStore, usePermission } from "@/features/auth";
import { homePageAPI } from "../api/homepage.api";
import { toast } from "sonner";

const logDebug = (label, payload) => {
  if (!import.meta.env?.DEV) return;
  if (payload === undefined) {
    console.info(label);
    return;
  }
  console.info(label, payload);
};

const logWarn = (label, payload) => {
  if (!import.meta.env?.DEV) return;
  if (payload === undefined) {
    console.warn(label);
    return;
  }
  console.warn(label, payload);
};

const HomePage = () => {
  const { isAuthenticated, user } = useAuthStore();
  const canManageHomepage = usePermission(["content.manage", "product.update", "product.create"], {
    mode: "any",
  });

  const [layout, setLayout] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasInitialLoadRef = useRef(false);
  const lastProductsLogSignatureRef = useRef("");

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const isAdmin = isAuthenticated && canManageHomepage;

  // ============================================
  // FETCH HOMEPAGE LAYOUT
  // ============================================
  const fetchLayout = useCallback(async () => {
    try {
      logDebug("[HOMEPAGE] Fetch layout...");
      const response = await homePageAPI.getLayout();
      const layoutData = response.data?.data?.layout;
      setLayout(layoutData);
      logDebug("[HOMEPAGE] Layout loaded", {
        sections: layoutData?.sections?.length || 0,
        enabled: layoutData?.sections?.filter((s) => s.enabled)?.length || 0,
      });
    } catch (error) {
      console.error("❌ [API ERROR] Error fetching layout:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        url: error.config?.url,
        isAxiosError: error.isAxiosError,
        raw: error
      });
      toast.error("Không thể tải cấu hình trang chủ");
    }
  }, []);

  // ============================================
  // FETCH ALL PRODUCTS (Universal ONLY)
  // ============================================
  const fetchAllProducts = useCallback(async () => {
    try {
      logDebug("[HOMEPAGE] Fetch universal products", {
        params: { limit: 500 },
      });
      const response = await universalProductAPI.getAll({ limit: 500 }); // Fetch enough for homepage
      const payload = response?.data;
      const products = payload?.data?.products || [];
      logDebug("[HOMEPAGE] Universal products response", {
        status: response?.status,
        hasData: Boolean(payload?.data),
        keys: payload ? Object.keys(payload) : [],
        dataKeys: payload?.data ? Object.keys(payload.data) : [],
        total: payload?.data?.total,
        received: products.length,
        sample: products.slice(0, 3).map((p) => ({
          id: p?._id,
          name: p?.name,
          productType: p?.productType?.name || p?.productType || "",
          status: p?.status,
        })),
      });

      // Normalize for display
      const normalizedProducts = products.map((p) => ({
        ...p,
        createAt: p.createdAt || p.createAt,
        category: p.productType?.name || "Sản phẩm",
        isUniversal: true,
      }));

      const newestPreview = [...normalizedProducts]
        .sort(
          (a, b) =>
            new Date(b.createAt || 0).getTime() -
            new Date(a.createAt || 0).getTime()
        )
        .slice(0, 10)
        .map((p) => ({
          id: p._id,
          model: p.model,
          createdAt: p.createAt,
        }));

      const logPayload = {
        total: normalizedProducts.length,
        newestPreview,
      };
      if (import.meta.env.DEV) {
        const signature = JSON.stringify(logPayload);
        if (signature !== lastProductsLogSignatureRef.current) {
          lastProductsLogSignatureRef.current = signature;
          console.log("[HOMEPAGE] Loaded universal products:", signature);
        }
      }

      setAllProducts(normalizedProducts);

      if (!normalizedProducts.length) {
        logWarn("[HOMEPAGE] No products returned", {
          total: payload?.data?.total,
          status: payload?.status,
        });
      }
    } catch (err) {
      console.error("❌ [API ERROR] Error loading products:", {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        url: err.config?.url,
        isAxiosError: err.isAxiosError,
        raw: err
      });
      toast.error("Không thể tải dữ liệu sản phẩm");
      logWarn("[HOMEPAGE] Fetch products failed", {
        message: err?.message,
        status: err?.response?.status,
        data: err?.response?.data,
        url: err?.config?.url,
      });
    }
  }, []);

  // ============================================
  // INITIAL LOAD
  // ============================================
  useEffect(() => {
    if (hasInitialLoadRef.current) return;
    hasInitialLoadRef.current = true;

    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchLayout(), fetchAllProducts()]);
      setIsLoading(false);
    };

    loadData();
  }, [fetchLayout, fetchAllProducts]);

  // ============================================
  // HANDLERS
  // ============================================
  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowEditModal(true);
  };

  const handleDelete = async (productId) => {
    if (!confirm("Bạn có chắc chắn muốn xóa sản phẩm này?")) return;

    try {
      await universalProductAPI.delete(productId);
      toast.success("Xóa sản phẩm thành công");
      fetchAllProducts(); // Reload products
    } catch (error) {
      toast.error(error.response?.data?.message || "Xóa sản phẩm thất bại");
    }
  };

  const handleSaveProduct = () => {
    fetchAllProducts(); // Reload products after edit
  };

  // ============================================
  // RENDER
  // ============================================
  if (isLoading) {
    return <Loading />;
  }

  // Sort sections by order
  const sortedSections =
    layout?.sections
      ?.filter((s) => s.enabled)
      ?.sort((a, b) => a.order - b.order) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {sortedSections.length > 0 ? (
        sortedSections.map((section) => (
          <DynamicSection
            key={section.id}
            section={section}
            allProducts={allProducts}
            isAdmin={isAdmin}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))
      ) : (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-500 text-lg">Chưa có cấu hình trang chủ</p>
            {isAdmin && (
              <p className="text-sm text-gray-400 mt-2">Vào trang quản lý để thiết lập giao diện</p>
            )}
          </div>
        </div>
      )}

      {/* Product Edit Modal */}
      <ProductEditModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        mode="edit"
        product={editingProduct}
        onSave={handleSaveProduct}
      />
    </div>
  );
};

export default HomePage;
