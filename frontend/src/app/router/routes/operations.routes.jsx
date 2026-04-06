import React from "react";
import { Route } from "react-router-dom";
import DashboardLayout from "@/app/layouts/dashboard/DashboardLayout";
import ProtectedRoute from "@/app/router/guards/ProtectedRoute";
import { OrderManagementPage } from "@/features/orders";
import { POSDashboard, POSOrderHistory, POSOrderHandover } from "@/features/pos";
import { CashierDashboard, VATInvoicesPage } from "@/features/cashier";
import { ShipperDashboard } from "@/features/shipping";

const operationsRoutes = (
  <>
    <Route
      element={
        <ProtectedRoute
          allowedPermissions={["orders.read", "order.status.manage", "order.audit.read"]}
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/order-manager/orders" element={<OrderManagementPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute
          allowedPermissions={["pos.order.create", "pos.order.read.self", "pos.order.read.branch"]}
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/pos/dashboard" element={<POSDashboard />} />
      <Route path="/pos/orders" element={<POSOrderHistory />} />
      <Route path="/pos-staff/handover/:orderId" element={<POSOrderHandover />} />
    </Route>

    <Route
      element={
        <ProtectedRoute
          allowedPermissions={[
            "pos.order.read.branch",
            "pos.payment.process",
            "pos.order.finalize",
            "pos.vat.issue",
          ]}
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/cashier/dashboard" element={<CashierDashboard />} />
      <Route path="/CASHIER/dashboard" element={<CashierDashboard />} />
      <Route path="/cashier/vat-invoices" element={<VATInvoicesPage />} />
      <Route path="/CASHIER/vat-invoices" element={<VATInvoicesPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute
          allowedPermissions={["task.read", "task.update", "order.view.assigned", "order.status.manage.task"]}
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/shipper/dashboard" element={<ShipperDashboard />} />
    </Route>
  </>
);

export default operationsRoutes;
