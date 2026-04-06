// ============================================
// FILE: frontend/src/pages/admin/StockInPage.jsx
// Direct Stock-In Page for Global Admin
// Responsive UI + scrollable dropdowns
// ============================================
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/shared/lib/http/httpClient";
import { toast } from "sonner";
import { formatDate, formatPrice } from "@/shared/lib/utils";
import { isSerializedProduct } from "@/features/afterSales/utils/afterSales";
import {
  PackagePlus,
  Search,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Package,
  MapPin,
  History,
  AlertCircle,
  Box,
  Layers,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

const parseSerializedUnitsInput = (input) =>
  String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t|;]/).map((item) => item.trim()).filter(Boolean);
      const first = parts[0] || "";
      const second = parts[1] || "";
      return /^\d{8,}$/.test(first.replace(/\s+/g, ""))
        ? { imei: first.replace(/\s+/g, ""), serialNumber: second }
        : { imei: "", serialNumber: first };
    });

// ============================================
// LOCATION PICKER COMPONENT
// Cascading dropdowns: Khu → Dãy → Tầng → Ô
// ============================================
const LocationPicker = ({ locations, value, onChange }) => {
  const parsedValue = useMemo(() => {
    if (!value) return { zone: "", aisle: "", shelf: "", bin: "" };
    const loc = locations.find((l) => l.locationCode === value);
    if (loc) return { zone: loc.zone, aisle: loc.aisle, shelf: loc.shelf, bin: loc.bin };
    return { zone: "", aisle: "", shelf: "", bin: "" };
  }, [value, locations]);

  const [selected, setSelected] = useState(parsedValue);

  useEffect(() => {
    setSelected(parsedValue);
  }, [parsedValue]);

  const zoneOptions = useMemo(() => {
    const map = new Map();
    locations.forEach((loc) => {
      if (!map.has(loc.zone)) {
        map.set(loc.zone, loc.zoneName || loc.zone);
      }
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [locations]);

  const aisleOptions = useMemo(() => {
    if (!selected.zone) return [];
    const set = new Set();
    locations
      .filter((loc) => loc.zone === selected.zone)
      .forEach((loc) => set.add(loc.aisle));
    return Array.from(set).sort();
  }, [locations, selected.zone]);

  const shelfOptions = useMemo(() => {
    if (!selected.zone || !selected.aisle) return [];
    const set = new Set();
    locations
      .filter((loc) => loc.zone === selected.zone && loc.aisle === selected.aisle)
      .forEach((loc) => set.add(loc.shelf));
    return Array.from(set).sort();
  }, [locations, selected.zone, selected.aisle]);

  const binOptions = useMemo(() => {
    if (!selected.zone || !selected.aisle || !selected.shelf) return [];
    const filtered = locations.filter(
      (loc) =>
        loc.zone === selected.zone &&
        loc.aisle === selected.aisle &&
        loc.shelf === selected.shelf
    );
    return filtered.sort((a, b) => a.bin.localeCompare(b.bin));
  }, [locations, selected.zone, selected.aisle, selected.shelf]);

  const handleChange = (level, val) => {
    let next = { ...selected };
    if (level === "zone") {
      next = { zone: val, aisle: "", shelf: "", bin: "" };
    } else if (level === "aisle") {
      next = { ...next, aisle: val, shelf: "", bin: "" };
    } else if (level === "shelf") {
      next = { ...next, shelf: val, bin: "" };
    } else if (level === "bin") {
      next = { ...next, bin: val };
    }
    setSelected(next);

    if (next.zone && next.aisle && next.shelf && next.bin) {
      const match = locations.find(
        (loc) =>
          loc.zone === next.zone &&
          loc.aisle === next.aisle &&
          loc.shelf === next.shelf &&
          loc.bin === next.bin
      );
      if (match) onChange(match.locationCode);
    } else {
      onChange("");
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {/* Row 1: Khu + Dãy */}
      <div className="flex items-center gap-1">
        {/* Zone */}
        <Select value={selected.zone} onValueChange={(val) => handleChange("zone", val)}>
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Khu" />
          </SelectTrigger>
          <SelectContent
            className="max-h-52 overflow-y-auto"
            // Ensure dropdown renders within viewport
            side="bottom"
            align="start"
            avoidCollisions
          >
            {zoneOptions.map((z) => (
              <SelectItem key={z.code} value={z.code}>
                <div className="flex items-center gap-1">
                  <Layers className="h-3 w-3 text-blue-500 shrink-0" />
                  <span className="font-medium">{z.code}</span>
                  <span className="text-muted-foreground text-xs truncate max-w-[80px]">
                    - {z.name}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />

        {/* Aisle */}
        <Select
          value={selected.aisle}
          onValueChange={(val) => handleChange("aisle", val)}
          disabled={!selected.zone}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Dãy" />
          </SelectTrigger>
          <SelectContent
            className="max-h-52 overflow-y-auto"
            side="bottom"
            align="start"
            avoidCollisions
          >
            {aisleOptions.map((a) => (
              <SelectItem key={a} value={a}>
                Dãy {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Row 2: Tầng + Ô */}
      <div className="flex items-center gap-1">
        {/* Shelf */}
        <Select
          value={selected.shelf}
          onValueChange={(val) => handleChange("shelf", val)}
          disabled={!selected.aisle}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Tầng" />
          </SelectTrigger>
          <SelectContent
            className="max-h-52 overflow-y-auto"
            side="bottom"
            align="start"
            avoidCollisions
          >
            {shelfOptions.map((s) => (
              <SelectItem key={s} value={s}>
                Kệ {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />

        {/* Bin */}
        <Select
          value={selected.bin}
          onValueChange={(val) => handleChange("bin", val)}
          disabled={!selected.shelf}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Ô" />
          </SelectTrigger>
          <SelectContent
            className="max-h-52 overflow-y-auto"
            side="bottom"
            align="start"
            avoidCollisions
          >
            {binOptions.map((loc) => (
              <SelectItem key={loc.bin} value={loc.bin}>
                <div className="flex items-center gap-1">
                  <span>Ô {loc.bin}</span>
                  {loc.capacity > 0 && (
                    <span className="text-muted-foreground text-xs">
                      ({loc.currentLoad || 0}/{loc.capacity})
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resolved location code */}
      {value && (
        <div className="flex items-center gap-1 text-xs text-emerald-600">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="font-mono">{value}</span>
        </div>
      )}
    </div>
  );
};

// ============================================
// MOBILE STOCK-IN ITEM CARD
// Shown instead of table row on small screens
// ============================================
const StockInItemCard = ({ item, locations, onUpdate, onRemove }) => (
  <div className="rounded-lg border bg-card p-4 space-y-3">
    {/* Header: image + name + remove */}
    <div className="flex items-start gap-3">
      {item.productImage ? (
        <img
          src={item.productImage}
          alt=""
          className="h-12 w-12 rounded-md object-cover border shrink-0"
        />
      ) : (
        <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Box className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{item.productName}</p>
        <p className="text-xs text-muted-foreground">{item.variantName}</p>
        <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
        onClick={() => onRemove(item.sku)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>

    {/* Quantity + Location row */}
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Số lượng</label>
        <Input
          type="number"
          min="1"
          value={item.quantity}
          onChange={(e) => onUpdate(item.sku, "quantity", e.target.value)}
          className="h-8 text-center"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Cost</label>
        <Input
          type="number"
          min="0"
          value={item.costPrice || ""}
          onChange={(e) => onUpdate(item.sku, "costPrice", e.target.value)}
          className="h-8 text-right"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Selling</label>
        <Input
          type="number"
          min="0"
          value={item.sellingPrice || ""}
          onChange={(e) => onUpdate(item.sku, "sellingPrice", e.target.value)}
          className="h-8 text-right"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Ghi chú</label>
        <Input
          placeholder="Ghi chú..."
          value={item.notes}
          onChange={(e) => onUpdate(item.sku, "notes", e.target.value)}
          className="h-8 text-xs"
        />
      </div>
    </div>

    {/* Location picker */}
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <MapPin className="h-3 w-3" /> Vị trí kho (Khu → Dãy → Tầng → Ô)
      </label>
      <LocationPicker
        locations={locations}
        value={item.locationCode}
        onChange={(val) => onUpdate(item.sku, "locationCode", val)}
      />
    </div>

    {item.serializedTrackingEnabled && (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          IMEI / Serial ({item.quantity} dòng)
        </label>
        <textarea
          value={item.serializedInput || ""}
          onChange={(e) => onUpdate(item.sku, "serializedInput", e.target.value)}
          rows={4}
          className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono"
          placeholder={"356789012345678\n356789012345679,SN-IP15-0002"}
        />
      </div>
    )}
  </div>
);

// ============================================
// MAIN PAGE
// ============================================
const StockInPage = () => {
  const [activeTab, setActiveTab] = useState("stock-in");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locations, setLocations] = useState([]);
  const [stockInItems, setStockInItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPages, setHistoryPages] = useState(0);

  // ============================================
  // FETCH LOCATIONS
  // ============================================
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await api.get("/warehouse/locations");
        const data = res.data?.locations || res.data?.data?.locations || [];
        setLocations(data.filter((loc) => loc.status === "ACTIVE"));
      } catch (err) {
        console.error("Error fetching locations:", err);
      }
    };
    fetchLocations();
  }, []);

  // ============================================
  // SEARCH PRODUCTS
  // ============================================
  const searchProducts = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const normalizedQuery = query.trim().toLowerCase();
    setSearching(true);
    try {
      const res = await api.get("/universal-products", {
        params: { search: query.trim(), limit: 20 },
      });
      const products = res.data?.data?.products || [];
      const flattened = [];
      for (const product of products) {
        const variants = product.variants || [];
        for (const variant of variants) {
          const sku = String(variant.sku || "");
          const isSkuMatch = sku.toLowerCase().includes(normalizedQuery);
          const isProductMatch = `${String(product.name || "")} ${String(product.model || "")}`
            .toLowerCase()
            .includes(normalizedQuery);
          if (!isSkuMatch && !isProductMatch) continue;

          flattened.push({
            productId: product._id,
            productName: product.name,
            productImage: variant.images?.[0] || product.featuredImages?.[0] || "",
            sku,
            variantName: `${variant.color} - ${variant.variantName}`,
            currentStock: variant.stock || 0,
            lifecycleStage: product.lifecycleStage || "ACTIVE",
            afterSalesConfig: product.afterSalesConfig || {},
            productType: product.productType || null,
            serializedTrackingEnabled: isSerializedProduct(product),
          });
        }
      }
      const skus = Array.from(
        new Set(
          flattened
            .map((item) => String(item.sku || "").trim())
            .filter(Boolean)
        )
      );

      if (skus.length === 0) {
        setSearchResults(flattened);
        return;
      }

      try {
        const stockRes = await api.get("/warehouse/inventory/by-skus", {
          params: { skus: skus.join(",") },
        });

        const totals = stockRes.data?.totals || {};
        const normalizedTotals = {};
        for (const [sku, qty] of Object.entries(totals)) {
          normalizedTotals[String(sku || "").trim()] = Number(qty) || 0;
        }

        setSearchResults(
          flattened.map((item) => ({
            ...item,
            currentStock:
              Object.prototype.hasOwnProperty.call(normalizedTotals, item.sku)
                ? normalizedTotals[item.sku]
                : item.currentStock,
          }))
        );
      } catch (stockErr) {
        console.error("Error fetching inventory totals by skus:", stockErr);
        setSearchResults(flattened);
      }
    } catch (err) {
      console.error("Error searching products:", err);
      toast.error("Lỗi khi tìm kiếm sản phẩm");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchProducts(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProducts]);

  // ============================================
  // ITEM ACTIONS
  // ============================================
  const addItem = (variant) => {
    if (stockInItems.some((item) => item.sku === variant.sku)) {
      toast.warning("SKU này đã có trong danh sách");
      return;
    }
    setStockInItems((prev) => [
      ...prev,
      {
        ...variant,
        quantity: 1,
        costPrice: "",
        sellingPrice: "",
        locationCode: "",
        notes: "",
        serializedInput: "",
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
    toast.success(`Đã thêm ${variant.sku}`);
  };

  const removeItem = (sku) => {
    setStockInItems((prev) => prev.filter((item) => item.sku !== sku));
  };

  const updateItem = (sku, field, value) => {
    setStockInItems((prev) =>
      prev.map((item) => (item.sku === sku ? { ...item, [field]: value } : item))
    );
  };

  // ============================================
  // SUBMIT
  // ============================================
  const handleSubmit = async () => {
    if (stockInItems.length === 0) {
      toast.warning("Chưa có sản phẩm nào trong danh sách");
      return;
    }
    for (const item of stockInItems) {
      if (!item.quantity || item.quantity <= 0) {
        toast.error(`Số lượng không hợp lệ cho SKU: ${item.sku}`);
        return;
      }
      const costPrice = Number(item.costPrice);
      const sellingPrice = Number(item.sellingPrice);
      if (!Number.isFinite(costPrice) || costPrice < 0) {
        toast.error(`Missing valid cost price for SKU: ${item.sku}`);
        return;
      }
      if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
        toast.error(`Missing valid selling price for SKU: ${item.sku}`);
        return;
      }
      if (!item.locationCode) {
        toast.error(`Chưa chọn đầy đủ vị trí kho cho SKU: ${item.sku}`);
        return;
      }
      if (item.serializedTrackingEnabled) {
        const serializedUnits = parseSerializedUnitsInput(item.serializedInput);
        if (serializedUnits.length !== Number(item.quantity)) {
          toast.error(`SKU ${item.sku} cần đúng ${item.quantity} IMEI/serial`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        items: stockInItems.map((item) => ({
          sku: item.sku,
          quantity: Number(item.quantity),
          costPrice: Number(item.costPrice),
          sellingPrice: Number(item.sellingPrice),
          locationCode: item.locationCode,
          notes: item.notes || "",
          serializedUnits: item.serializedTrackingEnabled
            ? parseSerializedUnitsInput(item.serializedInput)
            : [],
        })),
      };
      const res = await api.post("/warehouse/stock-in", payload);
      if (res.data?.success) {
        toast.success(res.data.message || "Nhập kho thành công!");
        setStockInItems([]);
        if (res.data.data?.activatedProducts > 0) {
          toast.info(
            `${res.data.data.activatedProducts} sản phẩm đã được kích hoạt tự động`,
            { duration: 5000 }
          );
        }
      }
    } catch (err) {
      console.error("Stock-in error:", err);
      toast.error(err.response?.data?.message || "Lỗi khi nhập kho");
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================
  // FETCH HISTORY
  // ============================================
  const fetchHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await api.get("/warehouse/stock-in/history", {
        params: { page, limit: 15 },
      });
      const data = res.data?.data || {};
      setHistory(data.movements || []);
      setHistoryPage(data.pagination?.page || 1);
      setHistoryTotal(data.pagination?.total || 0);
      setHistoryPages(data.pagination?.pages || 0);
    } catch (err) {
      console.error("Error fetching history:", err);
      toast.error("Lỗi khi tải lịch sử nhập kho");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history") fetchHistory(1);
  }, [activeTab, fetchHistory]);

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 shrink-0">
            <PackagePlus className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Nhập kho trực tiếp
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Nhập hàng vào kho trung tâm (không cần PO)
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="stock-in" className="gap-1.5 text-xs sm:text-sm">
            <PackagePlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Nhập kho
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
            <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Lịch sử
          </TabsTrigger>
        </TabsList>

        {/* ===================== TAB: STOCK IN ===================== */}
        <TabsContent value="stock-in" className="space-y-4 sm:space-y-6 mt-4 sm:mt-6">

          {/* Search */}
          <Card>
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Search className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                Tìm sản phẩm
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="product-search"
                  placeholder="Tìm theo tên sản phẩm hoặc SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-3 border rounded-lg max-h-64 overflow-y-auto divide-y">
                  {searchResults.map((variant) => (
                    <div
                      key={variant.sku}
                      className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-accent/50 transition-colors cursor-pointer group"
                      onClick={() => addItem(variant)}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {variant.productImage ? (
                          <img
                            src={variant.productImage}
                            alt=""
                            className="h-9 w-9 sm:h-10 sm:w-10 rounded-md object-cover border shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <Box className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{variant.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {variant.variantName} •{" "}
                            <span className="font-mono">{variant.sku}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
                        {variant.lifecycleStage === "SKELETON" && (
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-300 bg-amber-50 text-xs hidden sm:inline-flex"
                          >
                            Skeleton
                          </Badge>
                        )}
                        {variant.serializedTrackingEnabled && (
                          <Badge
                            variant="outline"
                            className="text-blue-600 border-blue-300 bg-blue-50 text-xs hidden sm:inline-flex"
                          >
                            Serialized
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          Tồn: {variant.currentStock}
                        </span>
                        <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                <div className="mt-3 text-center py-6 text-muted-foreground">
                  <AlertCircle className="h-7 w-7 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Không tìm thấy sản phẩm</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stock-In Items */}
          {stockInItems.length > 0 && (
            <Card>
              <CardHeader className="pb-3 sm:pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Package className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                    Danh sách nhập kho
                    <Badge variant="secondary" className="ml-1">
                      {stockInItems.length} mục
                    </Badge>
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">
                    Tổng:{" "}
                    <span className="font-semibold text-foreground">
                      {stockInItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)}
                    </span>{" "}
                    sản phẩm
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Mobile: cards; Desktop: table */}
                <div className="sm:hidden space-y-3">
                  {stockInItems.map((item) => (
                    <StockInItemCard
                      key={item.sku}
                      item={item}
                      locations={locations}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                    />
                  ))}
                </div>

                {/* Desktop table — horizontally scrollable */}
                <div className="hidden sm:block rounded-lg border overflow-x-auto">
                  <Table className="min-w-[1180px]">
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[220px]">Sản phẩm</TableHead>
                        <TableHead className="w-[100px]">SKU</TableHead>
                        <TableHead className="w-[120px]">Cost</TableHead>
                        <TableHead className="w-[120px]">Selling</TableHead>
                        <TableHead className="w-[90px]">Số lượng</TableHead>
                        <TableHead className="w-[260px]">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            Vị trí kho
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              (Khu → Dãy → Tầng → Ô)
                            </span>
                          </div>
                        </TableHead>
                        <TableHead className="w-[150px]">Ghi chú</TableHead>
                        <TableHead className="w-[260px]">IMEI / Serial</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockInItems.map((item) => (
                        <TableRow key={item.sku}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {item.productImage ? (
                                <img
                                  src={item.productImage}
                                  alt=""
                                  className="h-8 w-8 rounded object-cover border shrink-0"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                                  <Box className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate max-w-[140px]">
                                  {item.productName}
                                </p>
                                <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                                  {item.variantName}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs">{item.sku}</span>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={item.costPrice || ""}
                              onChange={(e) =>
                                updateItem(item.sku, "costPrice", e.target.value)
                              }
                              className="w-24 h-8 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={item.sellingPrice || ""}
                              onChange={(e) =>
                                updateItem(item.sku, "sellingPrice", e.target.value)
                              }
                              className="w-24 h-8 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(item.sku, "quantity", e.target.value)
                              }
                              className="w-20 h-8 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <LocationPicker
                              locations={locations}
                              value={item.locationCode}
                              onChange={(val) =>
                                updateItem(item.sku, "locationCode", val)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Ghi chú..."
                              value={item.notes}
                              onChange={(e) =>
                                updateItem(item.sku, "notes", e.target.value)
                              }
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            {item.serializedTrackingEnabled ? (
                              <textarea
                                value={item.serializedInput || ""}
                                onChange={(e) =>
                                  updateItem(item.sku, "serializedInput", e.target.value)
                                }
                                rows={4}
                                className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono"
                                placeholder={"356789012345678\n356789012345679,SN-IP15-0002"}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Không yêu cầu
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => removeItem(item.sku)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Submit */}
                <div className="flex justify-end mt-4 sm:mt-6">
                  <Button
                    id="confirm-stock-in"
                    size="lg"
                    className="w-full sm:w-auto gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20"
                    onClick={handleSubmit}
                    disabled={submitting || stockInItems.length === 0}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Đang nhập kho...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Xác nhận nhập kho ({stockInItems.length} mục)
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {stockInItems.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-10 sm:py-12 text-center">
                <div className="inline-flex p-4 rounded-full bg-muted mb-4">
                  <PackagePlus className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" />
                </div>
                <h3 className="text-base sm:text-lg font-medium mb-1">
                  Chưa có sản phẩm nào
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                  Tìm kiếm và chọn sản phẩm cần nhập kho ở trên. Bạn có thể thêm
                  nhiều sản phẩm trước khi xác nhận nhập kho.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===================== TAB: HISTORY ===================== */}
        <TabsContent value="history" className="space-y-4 sm:space-y-6 mt-4 sm:mt-6">
          <Card>
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <History className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                Lịch sử nhập kho
                {historyTotal > 0 && (
                  <Badge variant="secondary">{historyTotal} bản ghi</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-10 sm:py-12">
                  <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Đang tải...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-10 sm:py-12 text-muted-foreground">
                  <History className="h-7 w-7 sm:h-8 sm:w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Chưa có lịch sử nhập kho</p>
                </div>
              ) : (
                <>
                  {/* Horizontally scrollable table */}
                  <div className="rounded-lg border overflow-x-auto">
                    <Table className="min-w-[760px]">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="whitespace-nowrap">Thời gian</TableHead>
                          <TableHead className="whitespace-nowrap">SKU</TableHead>
                          <TableHead className="whitespace-nowrap">Cost</TableHead>
                          <TableHead className="whitespace-nowrap">Selling</TableHead>
                          <TableHead className="whitespace-nowrap">Sản phẩm</TableHead>
                          <TableHead className="whitespace-nowrap">Số lượng</TableHead>
                          <TableHead className="whitespace-nowrap">Vị trí</TableHead>
                          <TableHead className="whitespace-nowrap">Người thực hiện</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((mov) => (
                          <TableRow key={mov._id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {formatDate(mov.createdAt)}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs">{mov.sku}</span>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {formatPrice(mov.costPrice || 0)}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {formatPrice(mov.sellingPrice || mov.price || 0)}
                            </TableCell>
                            <TableCell className="max-w-[160px] sm:max-w-[200px] truncate text-sm">
                              {mov.productName}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-emerald-600 border-emerald-300 bg-emerald-50 whitespace-nowrap"
                              >
                                +{mov.quantity}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                {mov.toLocationCode}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {mov.performedByName}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {historyPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4">
                      <p className="text-sm text-muted-foreground order-2 sm:order-1">
                        Trang {historyPage} / {historyPages}
                      </p>
                      <div className="flex gap-2 order-1 sm:order-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage <= 1}
                          onClick={() => fetchHistory(historyPage - 1)}
                        >
                          Trước
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage >= historyPages}
                          onClick={() => fetchHistory(historyPage + 1)}
                        >
                          Sau
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StockInPage;
