import React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { cn, getNameInitials } from "@/shared/lib/utils";
import { useAuthStore } from "@/features/auth";
import { getRoleKeys, isGlobalAdminAuthorization } from "@/features/auth/lib/authorization";
import { BranchSwitcher } from "@/features/stores";
import { getDashboardNavigation, getRoleLabel } from "./sidebar.config";

const normalizePath = (path) => {
  if (!path) return "/";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed || "/";
};

const getActiveMenuPath = (pathname, items) => {
  const currentPath = normalizePath(String(pathname || "").toLowerCase());

  const matchedItems = items.filter((item) => {
    const itemPath = normalizePath(String(item.path || "").toLowerCase());
    return (
      currentPath === itemPath ||
      (itemPath !== "/" && currentPath.startsWith(`${itemPath}/`))
    );
  });

  if (!matchedItems.length) return null;

  return matchedItems.reduce((bestMatch, currentItem) => {
    const bestPath = normalizePath(String(bestMatch.path || ""));
    const currentItemPath = normalizePath(String(currentItem.path || ""));
    return currentItemPath.length > bestPath.length ? currentItem : bestMatch;
  }).path;
};

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, authz, authorization, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const isGlobalAdmin = isGlobalAdminAuthorization({ user, authz, authorization });
  const roleKeys = getRoleKeys({ user, authz, authorization });
  const navigationItems = getDashboardNavigation({ user, authz, authorization });
  const activeMenuPath = getActiveMenuPath(location.pathname, navigationItems);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 lg:translate-x-0 lg:static flex flex-col",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b">
          <Link to="/" className="font-bold text-xl">
            Trang chủ
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {isGlobalAdmin ? (
          <div className="px-4 py-3 border-b">
            <BranchSwitcher className="w-full" />
          </div>
        ) : null}

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenuPath === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg",
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center font-semibold">
              {getNameInitials(user?.fullName)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold line-clamp-2">{user?.fullName}</p>
              <p className="text-xs text-muted-foreground">{getRoleLabel(roleKeys || user?.role)}</p>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-2">
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Bạn có chắc chắn muốn đăng xuất?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng hệ thống.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Đăng xuất
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden h-16 border-b flex items-center px-4">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-4 font-semibold">Dashboard</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
