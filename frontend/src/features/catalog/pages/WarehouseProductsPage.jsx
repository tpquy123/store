// frontend/src/pages/warehouse/ProductsPage.jsx
// ✅ ENHANCED: Modern UI with new tab navigation for product details
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePermission } from "@/features/auth";
import { Button } from "@/shared/ui/button";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  Package, 
  Grid3x3, 
  List, 
  Filter,
  X,
  ChevronDown,
  LayoutGrid,
  Layers,
  ArrowUpDown
} from "lucide-react";
import { universalProductAPI, productTypeAPI, brandAPI } from "../api/catalog.api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Input } from "@/shared/ui/input";
import { Loading } from "@/shared/ui/Loading";
import ProductCard from "../components/ProductCard";
import UniversalProductForm from "../components/UniversalProductForm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";

const ProductsPage = () => {
  const navigate = useNavigate();
  const canManageProducts = usePermission(["product.create", "product.update"], {
    mode: "any",
  });
  
  // Refs for potential future use
  const containerRef = useRef(null);
  
  // Helper to get representative image (matching ProductCard logic)
  const getRepresentativeImage = (product) => {
    const safeVariants = Array.isArray(product?.variants) ? product.variants : [];
    let variant = safeVariants.find((v) => v.stock > 0 && v.sku && v.slug);
    if (!variant) variant = safeVariants.find((v) => v.sku && v.slug);
    if (!variant) variant = safeVariants.find((v) => v.sku);
    if (!variant) variant = safeVariants[0];

    return (
      variant?.images?.[0] ||
      (Array.isArray(product?.images) ? product.images[0] : null) ||
      product?.image ||
      product?.featuredImages?.[0] || 
      "/placeholder.png"
    );
  };

  const isLikelyImageUrl = (value = "") => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
    if (trimmed.startsWith("/")) return true;
    return /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(trimmed);
  };

  // Product Types State
  const [productTypes, setProductTypes] = useState([]);
  const [activeTab, setActiveTab] = useState("");
  
  // Brand Filter State
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState("all");
  
  // Products State
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // UI State
  const [viewMode, setViewMode] = useState("grid"); // grid or list
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState("newest"); // newest, oldest, name-asc, name-desc
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [currentMode, setCurrentMode] = useState(null);
  const [currentProduct, setCurrentProduct] = useState(null);
  
  const LIMIT = 12;

  const pagination = {
    currentPage: page,
    totalPages: Math.ceil(total / LIMIT),
    hasPrev: page > 1,
    hasNext: page < Math.ceil(total / LIMIT),
  };

  // ============================================
  // FETCH PRODUCT TYPES
  // ============================================
  useEffect(() => {
    fetchProductTypes();
    fetchBrands();
  }, []);

  useEffect(() => {
    if (activeTab) {
      fetchProducts();
    }
  }, [activeTab, page, searchQuery, sortBy, selectedBrand]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, selectedBrand]);

  const fetchProductTypes = async () => {
    try {
      const response = await productTypeAPI.getAll({ status: "ACTIVE" });
      
      let types = [];
      if (Array.isArray(response?.data?.data?.productTypes)) {
        types = response.data.data.productTypes;
      } else if (Array.isArray(response?.data?.productTypes)) {
        types = response.data.productTypes;
      } else if (Array.isArray(response?.data?.data)) {
        types = response.data.data;
      } else if (Array.isArray(response?.data)) {
        types = response.data;
      }
      
      setProductTypes(types);
      
      if (types.length > 0 && !activeTab) {
        setActiveTab(types[0]._id);
      }
    } catch (error) {
      console.error("❌ Error fetching product types:", error);
      toast.error("Không thể tải danh sách loại sản phẩm");
      setProductTypes([]);
    }
  };

  const fetchBrands = async () => {
    try {
      const response = await brandAPI.getAll({ limit: 100 });
      const brandList = response.data?.data?.brands || [];
      setBrands(brandList);
    } catch (error) {
      console.error("Error fetching brands:", error);
      // Don't show toast for this background task to avoid annoyance
    }
  };

  const fetchProducts = async () => {
    if (!activeTab) return;
    
    setIsLoading(true);
    try {
      const response = await universalProductAPI.getAll({
        page,
        limit: LIMIT,
        search: searchQuery || undefined,
        productType: activeTab,
        sortBy: sortBy,
        brand: selectedBrand !== "all" ? selectedBrand : undefined,
      });

      const data = response?.data?.data;
      if (!data) throw new Error("Không có dữ liệu");

      const productsList = data.products || [];
      const totalCount = data.total || productsList.length;

      setProducts(productsList);
      setTotal(totalCount);
    } catch (error) {
      console.error("❌ Error fetching products:", error);
      toast.error(error.response?.data?.message || "Lỗi tải sản phẩm");
      setProducts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // CRUD OPERATIONS
  // ============================================
  const handleCreate = () => {
    setCurrentMode("create");
    setCurrentProduct(null);
    setShowModal(true);
  };

  const handleEdit = (product) => {
    setCurrentMode("edit");
    setCurrentProduct(product);
    setShowModal(true);
  };

  const handleDelete = async (productId) => {
    if (!productId) {
      toast.error("Không thể xóa: ID sản phẩm không hợp lệ");
      return;
    }

    setIsLoading(true);
    try {
      await universalProductAPI.delete(productId);
      toast.success("Xóa sản phẩm thành công");
      
      if (products.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchProducts();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Xóa sản phẩm thất bại");
    } finally {
      setIsLoading(false);
    }
  };




  // Navigate to customer-facing product page in new tab (ROBUST LOGIC)
  const handleProductClick = (product) => {
    let url = "";
    
    // CASE A: UNIVERSAL PRODUCTS
    const isUniversal = product.isUniversal || (product.productType && !["iPhone", "iPad", "Mac", "AirPods", "AppleWatch", "Accessories"].includes(product.category));
    
    if (isUniversal) {
      // Map productType slug to category path
      const PRODUCT_TYPE_TO_CATEGORY = {
        smartphone: "dien-thoai",
        tablet: "may-tinh-bang",
        laptop: "macbook",
        smartwatch: "apple-watch",
        headphone: "tai-nghe",
        tv: "tivi",
        monitor: "man-hinh",
        keyboard: "ban-phim",
        mouse: "chuot",
        speaker: "loa",
        camera: "may-anh",
        "gaming-console": "may-choi-game",
        accessories: "phu-kien",
      };
      
      const categoryPath = PRODUCT_TYPE_TO_CATEGORY[product.productType?.slug] || "products";
      const baseSlug = product.baseSlug || product.slug;
      
      // Get first variant for SKU (if available)
      const firstVariant = product.variants?.[0];
      
      // Extract storage from variantName if available
      let storageSuffix = "";
      if (firstVariant?.variantName) {
        const match = firstVariant.variantName.match(/^([\d]+(?:GB|TB))/);
        storageSuffix = match ? `-${match[1].toLowerCase()}` : "";
      }
      
      url = firstVariant?.sku 
        ? `/${categoryPath}/${baseSlug}${storageSuffix}?sku=${firstVariant.sku}`
        : `/${categoryPath}/${baseSlug}`;

    } else {
      // CASE B: LEGACY PRODUCTS
      const categoryPath = {
        iPhone: "dien-thoai",
        iPad: "may-tinh-bang",
        Mac: "macbook",
        AppleWatch: "apple-watch",
        AirPods: "tai-nghe",
        Accessories: "phu-kien",
      }[product.category];

      if (!categoryPath) {
        console.warn("Unknown category:", product.category);
        toast.error("Không thể xác định danh mục sản phẩm");
        return;
      }

      const firstVariant = product.variants?.[0];
      if (firstVariant?.sku && firstVariant?.slug) {
        url = `/${categoryPath}/${firstVariant.slug}?sku=${firstVariant.sku}`;
      } else if (product.baseSlug) {
        url = `/${categoryPath}/${product.baseSlug}`;
      } else {
         toast.error("Không thể xem chi tiết sản phẩm");
         return;
      }
    }
    
    // Open in new tab
    window.open(url, '_blank');
  };

  // Get active product type info
  const activeProductType = productTypes.find(t => t._id === activeTab);
  const activeProductCount = products.length;

  // ============================================
  // RENDER
  // ============================================
  if (productTypes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl flex items-center justify-center">
            <Package className="w-12 h-12 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold mb-3 text-slate-900">Chưa có loại sản phẩm</h2>
          <p className="text-slate-600 mb-6">
            Vui lòng tạo loại sản phẩm trước khi thêm sản phẩm
          </p>
          <Button 
            onClick={() => navigate("/admin/product-types")}
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            <Layers className="w-4 h-4 mr-2" />
            Quản lý loại sản phẩm
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50" ref={containerRef}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 space-y-6">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                <Package className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
                Quản lý sản phẩm
              </h1>
            </div>
            <p className="text-slate-600 text-sm sm:text-base">
              Quản lý sản phẩm theo danh mục với tìm kiếm và lọc nâng cao
            </p>
          </div>
          <Button 
            onClick={handleCreate}
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-md hover:shadow-lg transition-all duration-300 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" /> Thêm sản phẩm
          </Button>
        </div>

        {/* CATEGORY TABS - Enhanced with scroll */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-slate-600" />
              <h2 className="font-semibold text-slate-900">Danh mục sản phẩm</h2>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {productTypes.length} loại
            </Badge>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Scrollable horizontal tabs */}
            <div className="relative -mx-1">
              <div className="overflow-x-auto scrollbar-hide pb-2">
                <TabsList className="inline-flex gap-2 bg-transparent p-0 h-auto">
                  {productTypes.map((type) => (
                    <TabsTrigger 
                      key={type._id} 
                      value={type._id}
                      className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md border border-slate-200 data-[state=active]:border-blue-600 rounded-xl px-4 py-2.5 transition-all duration-300 hover:border-blue-400 hover:bg-blue-50"
                    >
                      {isLikelyImageUrl(type.icon) ? (
                        <img
                          src={type.icon}
                          alt={type.name}
                          className="w-5 h-5 mr-2 object-contain"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = "/placeholder.png";
                          }}
                        />
                      ) : (
                        <Package className="w-5 h-5 mr-2 text-slate-500" />
                      )}
                      <span className="font-medium">{type.name}</span>
                      {activeTab === type._id && (
                        <Badge className="ml-2 bg-white/20 text-white border-0 hover:bg-white/30">
                          {total}
                        </Badge>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            {/* SEARCH & FILTERS BAR */}
            <div className="mt-6 space-y-4">
              {/* Active category info */}
              {activeProductType && (
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    {isLikelyImageUrl(activeProductType.icon) ? (
                      <img
                        src={activeProductType.icon}
                        alt={activeProductType.name}
                        className="w-8 h-8 object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/placeholder.png";
                        }}
                      />
                    ) : (
                      <Package className="w-8 h-8 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{activeProductType.name}</h3>
                    <p className="text-xs text-slate-600">
                      {total} sản phẩm {searchQuery && `• Đang tìm kiếm`}
                    </p>
                  </div>
                </div>
              )}

              {/* Search and controls */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <Input
                    placeholder="Tìm kiếm tên hoặc model..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10 h-11 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Brand Filter */}
                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger className="w-[160px] h-11 border-slate-200 focus:ring-blue-400/20 rounded-xl bg-white">
                    <div className="flex items-center truncate">
                      <Filter className="w-4 h-4 mr-2 text-slate-500" />
                      <SelectValue placeholder="Hãng sản xuất" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả hãng</SelectItem>
                    {brands.map((brand) => (
                      <SelectItem key={brand._id} value={brand._id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Sort */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-11 border-slate-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl">
                      <ArrowUpDown className="w-4 h-4 mr-2" />
                      Sắp xếp
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setSortBy("newest")}>
                      Mới nhất
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("oldest")}>
                      Cũ nhất
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("name-asc")}>
                      Tên A-Z
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("name-desc")}>
                      Tên Z-A
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* View Mode Toggle */}
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2 rounded-lg transition-all duration-300 ${
                      viewMode === "grid"
                        ? "bg-white shadow-sm text-blue-600"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                    title="Dạng lưới"
                  >
                    <LayoutGrid className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-2 rounded-lg transition-all duration-300 ${
                      viewMode === "list"
                        ? "bg-white shadow-sm text-blue-600"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                    title="Dạng danh sách"
                  >
                    <List className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* PRODUCTS CONTENT */}
            {productTypes.map((type) => (
              <TabsContent key={type._id} value={type._id} className="mt-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-slate-600 font-medium">Đang tải sản phẩm...</p>
                    </div>
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-16 sm:py-20">
                    <div className="w-20 h-20 mx-auto mb-6 bg-slate-100 rounded-2xl flex items-center justify-center">
                      <Package className="w-10 h-10 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      {searchQuery ? "Không tìm thấy sản phẩm" : `Chưa có sản phẩm ${type.name} nào`}
                    </h3>
                    <p className="text-slate-500 text-sm mb-6">
                      {searchQuery 
                        ? "Thử thay đổi từ khóa tìm kiếm hoặc xóa bộ lọc"
                        : "Bắt đầu thêm sản phẩm để quản lý kho hàng của bạn"
                      }
                    </p>
                    {!searchQuery && (
                      <Button onClick={handleCreate} className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Thêm sản phẩm đầu tiên
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Grid View */}
                    {viewMode === "grid" && (
                      <div 
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5"
                        style={{
                          animation: 'fadeIn 0.4s ease-out'
                        }}
                      >
                        {products.map((product, index) => {
                          return (
                            <div 
                              key={product._id} 
                              className="relative group"
                              style={{
                                animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`
                              }}
                            >
                              <div className="">
                                <ProductCard
                                  product={product}
                                  onEdit={handleEdit}
                                  onDelete={handleDelete}
                                  onUpdate={() => fetchProducts()}
                                  showVariantsBadge={true}
                                  showAdminActions={canManageProducts}
                                  openInNewTab={true}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* List View */}
                    {viewMode === "list" && (
                      <div className="space-y-3">
                        {products.map((product, index) => {
                          return (
                            <div 
                              key={product._id}
                              className="bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 p-4 cursor-pointer"
                              onClick={() => handleProductClick(product)}
                              style={{
                                animation: `fadeInUp 0.3s ease-out ${index * 0.03}s both`
                              }}
                            >
                              <div className="flex items-center gap-4">
                                {/* Product Image */}
                                <div className="flex-shrink-0">
                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-white border border-slate-200 flex items-center justify-center p-2">
                                      <img
                                        src={getRepresentativeImage(product)}
                                        alt={product.name}
                                        className="max-w-full max-h-full object-contain"
                                        onError={(e) => {
                                          e.target.src = "/placeholder.png"; 
                                          e.target.onerror = null;
                                        }}
                                      />
                                    </div>
                                </div>

                                {/* Product Info */}
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-slate-900 mb-1 truncate">{product.name}</h3>
                                  {product.model && (
                                    <p className="text-sm text-slate-500 mb-2 truncate">{product.model}</p>
                                  )}
                                  <div className="flex flex-wrap gap-2">
                                    {product.variants?.length > 0 && (
                                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                        {product.variants.length} biến thể
                                      </Badge>
                                    )}
                                    {product.status && (
                                      <Badge 
                                        variant="outline"
                                        className={
                                          product.status === "ACTIVE"
                                            ? "bg-green-50 text-green-700 border-green-200"
                                            : "bg-slate-50 text-slate-700 border-slate-200"
                                        }
                                      >
                                        {product.status === "ACTIVE" ? "Hoạt động" : "Không hoạt động"}
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                {/* Actions */}
                                {canManageProducts && (
                                  <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEdit(product);
                                      }}
                                      className="hover:bg-blue-50 hover:border-blue-400"
                                    >
                                      Sửa
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(product._id);
                                      }}
                                      className="hover:bg-red-50 hover:border-red-400 hover:text-red-600"
                                    >
                                      Xóa
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* PAGINATION */}
                    {pagination.totalPages > 1 && (
                      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-10 pt-6 border-t border-slate-200">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page === 1 || isLoading}
                          onClick={() => {
                            setPage(page - 1);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="h-10 border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 w-full sm:w-auto"
                        >
                          Trang trước
                        </Button>

                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
                          <span className="text-sm font-medium text-slate-900">
                            Trang <span className="font-bold text-blue-600">{pagination.currentPage}</span> / {pagination.totalPages}
                          </span>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page === pagination.totalPages || isLoading}
                          onClick={() => {
                            setPage(page + 1);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="h-10 border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 w-full sm:w-auto"
                        >
                          Trang sau
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>

      {/* UNIVERSAL PRODUCT FORM */}
      <UniversalProductForm
        open={showModal}
        onOpenChange={setShowModal}
        mode={currentMode}
        product={currentProduct}
        onSave={() => {
          fetchProducts();
        }}
      />

      {/* CSS Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

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

        /* Hide scrollbar for horizontal tabs */
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
};

export default ProductsPage;
