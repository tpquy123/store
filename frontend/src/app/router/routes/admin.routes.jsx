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
import WarehouseConfigPage from "@/features/warehouse/pages/WarehouseConfigPage";
import WarehouseVisualizerPage from "@/features/warehouse/pages/WarehouseVisualizerPage";

const adminRoutes = (
  <>
    <Route
      element={
        <ProtectedRoute
          allowedPermissions={[
            "analytics.read.global",
            "analytics.read.branch",
            "analytics.read.assigned",
            "users.manage.branch",
            "users.manage.global",
            "store.manage",
          ]}
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin" element={<AdminDashboard />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["promotion.manage"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/promotions" element={<PromotionsPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["content.manage"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/homepage-editor" element={<HomePageEditor />} />
      <Route path="/admin/short-videos" element={<ShortVideoAdminPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["brand.manage"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/brands" element={<BrandManagementPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["product_type.manage"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/product-types" element={<ProductTypeManagementPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["store.manage"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/stores" element={<StoreManagementPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["inventory.read", "warehouse.read"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/inventory-dashboard" element={<InventoryDashboard />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["inventory.write", "warehouse.write"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/stock-in" element={<StockInPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["device.read", "device.write"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/devices" element={<DeviceManagementPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["order.audit.read"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/audit-logs" element={<AuditLogPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedPermissions={["order.pick.complete.instore"]}>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/admin/warehouse-config" element={<WarehouseConfigPage />} />
      <Route path="/admin/warehouse-config/:id/visual" element={<WarehouseVisualizerPage />} />
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
