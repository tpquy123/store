import React from "react";
import { Route } from "react-router-dom";
import DashboardLayout from "@/app/layouts/dashboard/DashboardLayout";
import ProtectedRoute from "@/app/router/guards/ProtectedRoute";
import { AdminDashboard } from "@/features/analytics";
import { DeviceManagementPage } from "@/features/afterSales";
import { AuditLogPage } from "@/features/audit";
import { EmployeesPage } from "@/features/employees";
import { InventoryDashboard, StockInPage } from "@/features/inventory";
import {
  BrandManagementPage,
  ProductTypeManagementPage,
} from "@/features/catalog";
import { PromotionsPage } from "@/features/promotions";
import { HomePageEditor } from "@/features/content/homepage";
import { ShortVideoAdminPage } from "@/features/content/videos";
import { StoreManagementPage } from "@/features/stores";

const adminRoutes = (
  <>
    <Route
      element={
        <ProtectedRoute
          allowedPermissions={[
            "analytics.read.global",
            "store.manage",
            "promotion.manage",
            "content.manage",
            "brand.manage",
            "product_type.manage",
            "inventory.read",
            "inventory.write",
            "device.read",
            "device.write",
            "order.audit.read",
          ]}
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/promotions" element={<PromotionsPage />} />
      <Route path="/admin/homepage-editor" element={<HomePageEditor />} />
      <Route path="/admin/short-videos" element={<ShortVideoAdminPage />} />
      <Route path="/admin/brands" element={<BrandManagementPage />} />
      <Route path="/admin/product-types" element={<ProductTypeManagementPage />} />
      <Route path="/admin/stores" element={<StoreManagementPage />} />
      <Route path="/admin/inventory-dashboard" element={<InventoryDashboard />} />
      <Route path="/admin/stock-in" element={<StockInPage />} />
      <Route path="/admin/devices" element={<DeviceManagementPage />} />
      <Route path="/admin/audit-logs" element={<AuditLogPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute
          allowedPermissions={["users.manage.branch", "users.manage.global"]}
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/employees" element={<EmployeesPage />} />
    </Route>
  </>
);

export default adminRoutes;
