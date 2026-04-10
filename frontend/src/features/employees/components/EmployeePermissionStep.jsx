import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  UserCog,
  Users,
  WalletCards,
  Warehouse,
} from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/utils";

import EmployeeSelectionCheckbox from "./EmployeeSelectionCheckbox";

const normalize = (value) => String(value || "").trim();
const normalizeRoleKey = (value) => normalize(value).toUpperCase();
const normalizePermissionKey = (value) => normalize(value).toLowerCase();
const unique = (items = []) =>
  Array.from(new Set(items.map((item) => normalize(item)).filter(Boolean)));

const iconClassName = "h-4 w-4";

export const ROLE_DEFINITIONS = [
  {
    value: "GLOBAL_ADMIN",
    label: "Quản trị hệ thống",
    shortLabel: "Quản trị HT",
    description: "Toàn quyền trên mọi chi nhánh và module hệ thống.",
    icon: ShieldCheck,
    tone: "rose",
  },
  {
    value: "ADMIN",
    label: "Quản trị",
    shortLabel: "Quản trị",
    description: "Quản lý vận hành chi nhánh, nhân sự và quyền nhạy cảm.",
    icon: UserCog,
    tone: "rose",
  },
  {
    value: "BRANCH_ADMIN",
    label: "Quản trị CN",
    shortLabel: "Quản trị CN",
    description: "Điều hành chi nhánh trong phạm vi được giao.",
    icon: Store,
    tone: "orange",
  },
  {
    value: "SALES_STAFF",
    label: "Nhân viên bán hàng",
    shortLabel: "Bán hàng",
    description: "Tư vấn bán hàng, tạo đơn và hỗ trợ khách tại quầy.",
    icon: Users,
    tone: "amber",
  },
  {
    value: "WAREHOUSE_MANAGER",
    label: "QL kho",
    shortLabel: "QL kho",
    description: "Quản lý tồn kho, thiết bị serial và điều chuyển.",
    icon: Warehouse,
    tone: "indigo",
  },
  {
    value: "WAREHOUSE_STAFF",
    label: "Nhân viên kho",
    shortLabel: "NV kho",
    description: "Thực thi nghiệp vụ kho, nhập xuất và xử lý điều chuyển.",
    icon: Warehouse,
    tone: "indigo",
  },
  {
    value: "PRODUCT_MANAGER",
    label: "QL sản phẩm",
    shortLabel: "QL SP",
    description: "Quản lý danh mục sản phẩm, thương hiệu và loại hàng.",
    icon: BriefcaseBusiness,
    tone: "violet",
  },
  {
    value: "ORDER_MANAGER",
    label: "QL đơn",
    shortLabel: "QL đơn",
    description: "Theo dõi vòng đời đơn hàng, phân công và xử lý sự cố.",
    icon: LockKeyhole,
    tone: "cyan",
  },
  {
    value: "POS_STAFF",
    label: "Nhân viên POS",
    shortLabel: "Nhân viên POS",
    description: "Bán hàng tại quầy, tạo đơn POS và thao tác giao nhận tại cửa hàng.",
    icon: WalletCards,
    tone: "blue",
  },
  {
    value: "CASHIER",
    label: "Thu ngân",
    shortLabel: "Thu ngân",
    description: "Xử lý thanh toán, hoàn tất đơn POS và xuất hoá đơn VAT.",
    icon: WalletCards,
    tone: "emerald",
  },
  {
    value: "SHIPPER",
    label: "Giao hàng",
    shortLabel: "Giao hàng",
    description: "Nhận nhiệm vụ giao hàng và cập nhật trạng thái đơn được phân công.",
    icon: Truck,
    tone: "teal",
  },
];

const ROLE_TONE_CLASSES = {
  amber: {
    selected: "border-amber-400 bg-amber-50 text-amber-950",
    icon: "bg-amber-100 text-amber-700",
  },
  blue: {
    selected: "border-blue-400 bg-blue-50 text-blue-950",
    icon: "bg-blue-100 text-blue-700",
  },
  cyan: {
    selected: "border-cyan-400 bg-cyan-50 text-cyan-950",
    icon: "bg-cyan-100 text-cyan-700",
  },
  emerald: {
    selected: "border-emerald-400 bg-emerald-50 text-emerald-950",
    icon: "bg-emerald-100 text-emerald-700",
  },
  indigo: {
    selected: "border-indigo-400 bg-indigo-50 text-indigo-950",
    icon: "bg-indigo-100 text-indigo-700",
  },
  orange: {
    selected: "border-orange-400 bg-orange-50 text-orange-950",
    icon: "bg-orange-100 text-orange-700",
  },
  rose: {
    selected: "border-rose-400 bg-rose-50 text-rose-950",
    icon: "bg-rose-100 text-rose-700",
  },
  teal: {
    selected: "border-teal-400 bg-teal-50 text-teal-950",
    icon: "bg-teal-100 text-teal-700",
  },
  violet: {
    selected: "border-violet-400 bg-violet-50 text-violet-950",
    icon: "bg-violet-100 text-violet-700",
  },
};

const MODULE_LABELS = {
  account: "Tài khoản",
  analytics: "Thống kê",
  brand: "Thương hiệu",
  cart: "Giỏ hàng",
  content: "Nội dung",
  context: "Ngữ cảnh chi nhánh",
  device: "Thiết bị / serial",
  general: "Chung",
  inventory: "Tồn kho",
  monitoring: "Giám sát",
  order: "Vận hành đơn hàng",
  orders: "Đơn hàng",
  pos: "POS",
  product: "Sản phẩm",
  product_type: "Loại sản phẩm",
  promotion: "Khuyến mãi",
  review: "Đánh giá",
  store: "Chi nhánh",
  task: "Nhiệm vụ",
  transfer: "Điều chuyển",
  users: "Người dùng",
  warehouse: "Kho vận",
  warranty: "Bảo hành",
};

export const PERMISSION_LABELS = {
  "analytics.read.branch": "Xem thống kê chi nhánh",
  "analytics.read.assigned": "Xem thống kê các chi nhánh được giao",
  "analytics.read.global": "Xem thống kê toàn hệ thống",
  "analytics.read.personal": "Xem thống kê cá nhân",
  "analytics.manage.global": "Quản lý dữ liệu thống kê toàn hệ thống",
  "users.read.branch": "Xem danh sách nhân sự trong chi nhánh",
  "users.manage.branch": "Tạo và cập nhật nhân sự trong chi nhánh",
  "users.manage.global": "Tạo và cập nhật nhân sự toàn hệ thống",
  "account.profile.update.self": "Cập nhật hồ sơ cá nhân",
  "account.address.manage.self": "Quản lý địa chỉ cá nhân",
  "cart.manage.self": "Quản lý giỏ hàng cá nhân",
  "orders.read": "Xem danh sách đơn hàng",
  "orders.write": "Tạo và chỉnh sửa đơn hàng",
  "order.audit.read": "Xem lịch sử audit đơn hàng",
  "order.view.self": "Xem đơn hàng do chính mình phụ trách",
  "order.view.assigned": "Xem đơn được phân công giao",
  "order.assign.carrier": "Phân công đơn cho đơn vị vận chuyển hoặc shipper",
  "order.assign.store": "Gán chi nhánh xử lý đơn",
  "order.status.manage": "Cập nhật trạng thái đơn hàng",
  "order.status.manage.warehouse": "Cập nhật trạng thái xử lý kho",
  "order.status.manage.task": "Cập nhật trạng thái đơn giao được giao",
  "order.status.manage.pos": "Cập nhật trạng thái giao nhận tại quầy",
  "order.pick.complete.instore": "Hoàn tất lấy hàng tại cửa hàng",
  "order.picker.assign.instore": "Phân công nhân viên lấy hàng tại cửa hàng",
  "inventory.read": "Xem tồn kho",
  "inventory.write": "Điều chỉnh tồn kho",
  "device.read": "Xem thiết bị / số serial",
  "device.write": "Tạo và cập nhật thiết bị / số serial",
  "warranty.read": "Xem hồ sơ bảo hành",
  "warranty.write": "Quản lý hồ sơ bảo hành",
  "product.read": "Xem danh mục sản phẩm",
  "product.create": "Tạo sản phẩm",
  "product.update": "Cập nhật sản phẩm",
  "product.delete": "Xoá sản phẩm",
  "brand.manage": "Quản lý thương hiệu",
  "product_type.manage": "Quản lý loại sản phẩm",
  "warehouse.read": "Xem nghiệp vụ kho",
  "warehouse.write": "Thực hiện nghiệp vụ kho",
  "transfer.create": "Tạo phiếu điều chuyển",
  "transfer.approve": "Duyệt điều chuyển",
  "transfer.ship": "Xuất kho điều chuyển",
  "transfer.receive": "Nhận kho điều chuyển",
  "transfer.read": "Xem phiếu điều chuyển",
  "store.manage": "Quản lý chi nhánh",
  "content.manage": "Quản lý nội dung trang chủ và video ngắn",
  "monitoring.read": "Xem dữ liệu giám sát và rollout",
  "promotion.apply.self": "Áp dụng mã khuyến mãi cho đơn cá nhân",
  "promotion.manage": "Quản lý khuyến mãi",
  "review.create.self": "Tạo đánh giá cá nhân",
  "review.update.self": "Cập nhật đánh giá cá nhân",
  "review.delete.self": "Xoá đánh giá cá nhân",
  "review.like.self": "Thích hoặc bỏ thích đánh giá",
  "review.upload.self": "Tải nội dung đánh giá cá nhân",
  "review.reply": "Phản hồi đánh giá khách hàng",
  "review.moderate": "Kiểm duyệt hoặc ẩn đánh giá",
  "task.read": "Xem nhiệm vụ được giao",
  "task.update": "Cập nhật nhiệm vụ được giao",
  "pos.order.create": "Tạo đơn POS",
  "pos.order.read.self": "Xem đơn POS do chính mình tạo",
  "pos.order.read.branch": "Xem đơn POS của chi nhánh",
  "pos.payment.process": "Xử lý thanh toán POS",
  "pos.order.cancel": "Huỷ đơn POS",
  "pos.order.finalize": "Hoàn tất đơn POS",
  "pos.vat.issue": "Xuất hoá đơn VAT cho POS",
  "context.switch.branch": "Chuyển ngữ cảnh chi nhánh",
  "context.simulate.branch": "Mô phỏng ngữ cảnh chi nhánh",
};

const SCOPE_LABELS = {
  BRANCH: "Chi nhánh",
  GLOBAL: "Toàn hệ thống",
  SELF: "Cá nhân",
  TASK: "Theo nhiệm vụ",
};

const ROLE_DEFINITION_MAP = new Map(
  ROLE_DEFINITIONS.map((role) => [normalizeRoleKey(role.value), role]),
);

const translateModule = (moduleKey) =>
  MODULE_LABELS[normalizePermissionKey(moduleKey)] || moduleKey || "Chung";

const sentenceCase = (value) => {
  const text = normalize(value);
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const DESCRIPTION_REPLACEMENTS = [
  ["Read analytics for active branch", "Xem dữ liệu thống kê của chi nhánh đang chọn"],
  ["Read analytics for assigned branches", "Xem dữ liệu thống kê của các chi nhánh được giao"],
  ["Read analytics across all branches", "Xem thống kê trên toàn hệ thống"],
  ["Read personal analytics", "Xem dữ liệu thống kê cá nhân"],
  ["Manage global analytics datasets", "Quản lý tập dữ liệu thống kê toàn hệ thống"],
  ["Read users in branch scope", "Xem nhân sự trong phạm vi chi nhánh"],
  ["Create/update users in branch scope", "Tạo hoặc cập nhật nhân sự trong phạm vi chi nhánh"],
  ["Create/update users across all branches", "Tạo hoặc cập nhật nhân sự trên toàn hệ thống"],
  ["Update own profile", "Cho phép tự cập nhật hồ sơ"],
  ["Manage own saved addresses", "Cho phép tự quản lý địa chỉ đã lưu"],
  ["Manage own cart", "Cho phép tự quản lý giỏ hàng"],
  ["Read order data", "Cho phép xem dữ liệu đơn hàng"],
  ["Create or update order data", "Cho phép tạo hoặc cập nhật đơn hàng"],
  ["Read order audit logs", "Cho phép xem lịch sử audit của đơn"],
  ["View own orders", "Cho phép xem các đơn của chính mình"],
  ["View assigned delivery orders", "Cho phép xem đơn giao được phân công"],
  ["Assign carrier or shipper to an order", "Cho phép phân công đơn vị vận chuyển hoặc shipper"],
  ["Assign a branch to an order", "Cho phép gán chi nhánh xử lý đơn"],
  ["Manage order status workflow", "Cho phép cập nhật luồng trạng thái đơn"],
  ["Manage warehouse order status workflow", "Cho phép cập nhật luồng trạng thái xử lý kho"],
  ["Manage assigned delivery order status workflow", "Cho phép cập nhật trạng thái đơn giao được giao"],
  ["Manage in-store order handover workflow", "Cho phép cập nhật trạng thái giao nhận tại quầy"],
  ["Complete in-store picking workflow", "Cho phép hoàn tất lấy hàng tại cửa hàng"],
  ["Assign in-store order picker", "Cho phép phân công nhân viên lấy hàng tại cửa hàng"],
  ["Read inventory data", "Cho phép xem dữ liệu tồn kho"],
  ["Adjust inventory", "Cho phép điều chỉnh tồn kho"],
  ["Read serialized device data", "Cho phép xem thiết bị hoặc số serial"],
  ["Create or update serialized devices", "Cho phép tạo hoặc cập nhật thiết bị hoặc số serial"],
  ["Read warranty records", "Cho phép xem hồ sơ bảo hành"],
  ["Manage warranty records", "Cho phép quản lý hồ sơ bảo hành"],
  ["Read product catalog", "Cho phép xem danh mục sản phẩm"],
  ["Create products", "Cho phép tạo sản phẩm mới"],
  ["Update products", "Cho phép cập nhật sản phẩm"],
  ["Delete products", "Cho phép xoá sản phẩm"],
  ["Manage brands", "Cho phép quản lý thương hiệu"],
  ["Manage product types", "Cho phép quản lý loại sản phẩm"],
  ["Read warehouse operations", "Cho phép xem nghiệp vụ kho"],
  ["Operate warehouse processes", "Cho phép thực hiện nghiệp vụ kho"],
  ["Create stock transfer", "Cho phép tạo phiếu điều chuyển"],
  ["Approve stock transfer", "Cho phép duyệt điều chuyển"],
  ["Ship stock transfer", "Cho phép xuất kho điều chuyển"],
  ["Receive stock transfer", "Cho phép nhận kho điều chuyển"],
  ["Read stock transfer", "Cho phép xem phiếu điều chuyển"],
  ["Manage stores", "Cho phép quản lý chi nhánh"],
  ["Manage homepage and short video content", "Cho phép quản lý nội dung trang chủ và video ngắn"],
  ["Read rollout and monitoring telemetry", "Cho phép xem dữ liệu giám sát và rollout"],
  ["Apply promotion codes to own order", "Cho phép áp dụng mã khuyến mãi cho đơn cá nhân"],
  ["Manage promotions", "Cho phép quản lý chương trình khuyến mãi"],
  ["Create own review", "Cho phép tạo đánh giá cá nhân"],
  ["Update own review", "Cho phép sửa đánh giá cá nhân"],
  ["Delete own review", "Cho phép xoá đánh giá cá nhân"],
  ["Like or unlike a review as self", "Cho phép thích hoặc bỏ thích đánh giá"],
  ["Request review upload signature for own content", "Cho phép tải nội dung đánh giá của chính mình"],
  ["Reply to reviews as staff", "Cho phép phản hồi đánh giá với vai trò nhân viên"],
  ["Moderate or hide reviews", "Cho phép kiểm duyệt hoặc ẩn đánh giá"],
  ["Read assigned task", "Cho phép xem nhiệm vụ được giao"],
  ["Update assigned task", "Cho phép cập nhật nhiệm vụ được giao"],
  ["Create in-store POS order", "Cho phép tạo đơn bán tại quầy"],
  ["Read own POS orders", "Cho phép xem đơn POS do chính mình tạo"],
  ["Read branch POS orders", "Cho phép xem đơn POS của chi nhánh"],
  ["Process POS payment", "Cho phép xử lý thanh toán POS"],
  ["Cancel POS order", "Cho phép huỷ đơn POS"],
  ["Finalize POS order", "Cho phép hoàn tất đơn POS"],
  ["Issue POS VAT invoice", "Cho phép xuất hoá đơn VAT cho POS"],
  ["Switch active branch context", "Cho phép chuyển ngữ cảnh chi nhánh đang làm việc"],
  ["Simulate branch context", "Cho phép mô phỏng ngữ cảnh chi nhánh"],
];

const humanizePermissionHint = (permission = {}) => {
  const scopeLabel = SCOPE_LABELS[normalizeRoleKey(permission.scopeType)];

  if (!permission?.description) {
    return scopeLabel ? `Phạm vi ${scopeLabel.toLowerCase()}` : "";
  }

  let description = String(permission.description);
  for (const [from, to] of DESCRIPTION_REPLACEMENTS) {
    description = description.replace(from, to);
  }

  return scopeLabel
    ? `${sentenceCase(description)}. Phạm vi ${scopeLabel.toLowerCase()}.`
    : sentenceCase(description);
};

export const getRoleDefinition = (roleKey) =>
  ROLE_DEFINITION_MAP.get(normalizeRoleKey(roleKey));

export const getRoleLabel = (roleKey) =>
  getRoleDefinition(roleKey)?.label || normalizeRoleKey(roleKey) || "Chưa chọn";

const getPermissionLabel = (permission = {}) =>
  PERMISSION_LABELS[normalizePermissionKey(permission.key)] ||
  sentenceCase(permission.description || permission.key || "Quyền chưa đặt tên");

const RoleSelectorGrid = ({ availableRoles = [], primaryRoleKey, onPrimaryRoleChange }) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    {availableRoles.map((role) => {
      const isActive = normalizeRoleKey(primaryRoleKey) === normalizeRoleKey(role.value);
      const tone = ROLE_TONE_CLASSES[role.tone] || ROLE_TONE_CLASSES.blue;
      const Icon = role.icon;

      return (
        <button
          key={role.value}
          type="button"
          className={cn(
            "rounded-2xl border p-4 text-left transition hover:border-primary/40 hover:shadow-sm",
            isActive ? tone.selected : "border-border bg-background",
          )}
          onClick={() => onPrimaryRoleChange?.(role.value)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "rounded-xl p-2",
                  isActive ? tone.icon : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">{role.label}</div>
                <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
              </div>
            </div>
            {isActive ? (
              <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                Đang chọn
              </Badge>
            ) : null}
          </div>
        </button>
      );
    })}
  </div>
);

const RolePermissionPreview = ({
  primaryRoleKey,
  template,
  templateApplied,
  onApplyTemplate,
  onToggleAdvanced,
  showAdvancedPermissions,
  customPermissionCount,
}) => {
  const permissions = template?.permissions || [];
  const previewPermissions = permissions.slice(0, 8);
  const remainingPermissions = Math.max(permissions.length - previewPermissions.length, 0);

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">Quyền mặc định của vai trò</h4>
            <Badge variant="outline">{getRoleLabel(primaryRoleKey)}</Badge>
            {templateApplied ? (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                Đang dùng làm mẫu
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Vai trò là bộ quyền mặc định. Quyền chi tiết chỉ nên dùng khi cần cộng
            thêm quyền ngoài vai trò hoặc tinh chỉnh cho trường hợp đặc biệt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => onApplyTemplate?.(primaryRoleKey)} disabled={!template}>
            <Sparkles className={iconClassName} />
            Dùng mẫu vai trò
          </Button>
          <Button type="button" variant="outline" onClick={() => onToggleAdvanced?.()}>
            {showAdvancedPermissions ? (
              <ChevronUp className={iconClassName} />
            ) : (
              <ChevronDown className={iconClassName} />
            )}
            {showAdvancedPermissions ? "Thu gọn tuỳ chỉnh" : "Tuỳ chỉnh thêm quyền"}
          </Button>
        </div>
      </div>

      {!template ? (
        <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Chưa tải được danh sách quyền mặc định của vai trò này.
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {previewPermissions.map((permission) => (
              <Badge
                key={permission.key}
                variant="secondary"
                className="rounded-full px-3 py-1 text-xs"
              >
                <CircleCheckBig className="mr-1 h-3.5 w-3.5" />
                {getPermissionLabel(permission)}
              </Badge>
            ))}
            {remainingPermissions > 0 ? (
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                +{remainingPermissions} quyền khác
              </Badge>
            ) : null}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Mẫu vai trò này hiện có {permissions.length} quyền mặc định.
            {customPermissionCount > 0
              ? ` Bạn đang bổ sung thêm ${customPermissionCount} quyền chi tiết.`
              : ""}
          </div>
        </>
      )}
    </div>
  );
};

const SecondaryRolePanel = ({
  availableRoles = [],
  primaryRoleKey,
  secondaryRoleKeys = [],
  onToggleRole,
}) => {
  const [expanded, setExpanded] = useState(secondaryRoleKeys.length > 0);

  useEffect(() => {
    if (secondaryRoleKeys.length > 0) {
      setExpanded(true);
    }
  }, [secondaryRoleKeys.length]);

  const optionalRoles = availableRoles.filter(
    (role) => normalizeRoleKey(role.value) !== normalizeRoleKey(primaryRoleKey),
  );

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold">Vai trò phụ (nâng cao)</div>
          <p className="text-sm text-muted-foreground">
            Chỉ dùng khi một nhân viên thật sự cần kiêm nhiệm nhiều vai trò.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? (
            <ChevronUp className={iconClassName} />
          ) : (
            <ChevronDown className={iconClassName} />
          )}
          {expanded ? "Thu gọn" : "Gắn thêm vai trò phụ"}
        </Button>
      </div>

      {secondaryRoleKeys.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {secondaryRoleKeys.map((roleKey) => (
            <Badge key={roleKey} variant="secondary">
              {getRoleLabel(roleKey)}
            </Badge>
          ))}
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {optionalRoles.map((role) => {
            const checked = secondaryRoleKeys.some(
              (roleKey) => normalizeRoleKey(roleKey) === normalizeRoleKey(role.value),
            );

            return (
              <label
                key={role.value}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-sm transition",
                  checked ? "border-primary/50 bg-primary/5" : "border-border",
                )}
              >
                <EmployeeSelectionCheckbox
                  checked={checked}
                  onCheckedChange={(nextChecked) =>
                    onToggleRole?.(role.value, Boolean(nextChecked))
                  }
                />
                <span>
                  <span className="block font-medium">{role.label}</span>
                  <span className="mt-1 block text-muted-foreground">
                    {role.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const AdvancedPermissionPanel = ({
  isOpen,
  granularEnabled,
  metadataLoading,
  catalog = [],
  permissionKeys = [],
  onTogglePermission,
  onToggleModulePermissions,
  sensitivePermissions = [],
}) => {
  const [permissionSearch, setPermissionSearch] = useState("");
  const deferredSearch = useDeferredValue(permissionSearch.trim().toLowerCase());
  const [expandedModules, setExpandedModules] = useState({});

  const permissionKeySet = useMemo(
    () => new Set(permissionKeys.map((key) => normalizePermissionKey(key))),
    [permissionKeys],
  );

  const groupedCatalog = useMemo(() => {
    const grouped = {};
    for (const permission of catalog) {
      const moduleKey = normalizePermissionKey(permission.module) || "general";
      if (!grouped[moduleKey]) {
        grouped[moduleKey] = [];
      }
      grouped[moduleKey].push(permission);
    }
    return grouped;
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    if (!deferredSearch) return groupedCatalog;

    return Object.entries(groupedCatalog).reduce((acc, [moduleKey, items]) => {
      const filtered = items.filter((permission) => {
        const label = getPermissionLabel(permission).toLowerCase();
        const hint = humanizePermissionHint(permission).toLowerCase();
        const key = normalizePermissionKey(permission.key);

        return (
          label.includes(deferredSearch) ||
          hint.includes(deferredSearch) ||
          key.includes(deferredSearch)
        );
      });

      if (filtered.length > 0) {
        acc[moduleKey] = filtered;
      }

      return acc;
    }, {});
  }, [deferredSearch, groupedCatalog]);

  const filteredModuleKeySignature = useMemo(
    () => Object.keys(filteredCatalog).sort().join("|"),
    [filteredCatalog],
  );

  useEffect(() => {
    if (!deferredSearch) return;
    setExpandedModules((prev) =>
      Object.keys(filteredCatalog).reduce((acc, moduleKey) => {
        if (acc[moduleKey]) return acc;
        return {
          ...acc,
          [moduleKey]: true,
        };
      }, prev),
    );
  }, [deferredSearch, filteredCatalog, filteredModuleKeySignature]);

  if (!isOpen) return null;

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold">Tuỳ chỉnh quyền chi tiết</div>
          <p className="text-sm text-muted-foreground">
            Dùng khi cần cộng thêm quyền ngoài vai trò mặc định. Người mới có thể
            bỏ qua phần này.
          </p>
        </div>
        <Badge variant="outline">Đã chọn {permissionKeys.length} quyền</Badge>
      </div>

      {!granularEnabled ? (
        <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Tính năng quyền chi tiết đang được tắt bởi feature flag.
        </div>
      ) : (
        <>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={permissionSearch}
              onChange={(event) => setPermissionSearch(event.target.value)}
              className="pl-10"
              placeholder="Tìm quyền theo tên thân thiện hoặc key..."
            />
          </div>

          <div className="mt-4 space-y-3">
            {metadataLoading ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Đang tải danh mục quyền...
              </div>
            ) : null}

            {!metadataLoading && catalog.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Chưa có danh mục quyền để hiển thị.
              </div>
            ) : null}

            {!metadataLoading && catalog.length > 0 && Object.keys(filteredCatalog).length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Không tìm thấy quyền phù hợp với từ khoá hiện tại.
              </div>
            ) : null}

            {Object.entries(filteredCatalog).map(([moduleKey, items]) => {
              const selectedCount = items.filter((permission) =>
                permissionKeySet.has(normalizePermissionKey(permission.key)),
              ).length;
              const expanded = deferredSearch ? true : expandedModules[moduleKey] ?? selectedCount > 0;

              return (
                <div key={moduleKey} className="rounded-xl border bg-background">
                  <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left"
                      onClick={() =>
                        setExpandedModules((prev) => ({
                          ...prev,
                          [moduleKey]: !expanded,
                        }))
                      }
                    >
                      {expanded ? (
                        <ChevronUp className={iconClassName} />
                      ) : (
                        <ChevronDown className={iconClassName} />
                      )}
                      <span className="text-sm font-semibold">
                        {translateModule(moduleKey)}
                      </span>
                      <Badge variant="secondary">
                        {selectedCount}/{items.length}
                      </Badge>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onToggleModulePermissions?.(items, true)}
                      >
                        Chọn tất cả
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onToggleModulePermissions?.(items, false)}
                      >
                        Bỏ chọn
                      </Button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="space-y-2 border-t p-3">
                      {items.map((permission) => {
                        const checked = permissionKeySet.has(
                          normalizePermissionKey(permission.key),
                        );

                        return (
                          <label
                            key={permission.key}
                            className={cn(
                              "flex items-start justify-between gap-3 rounded-xl border p-3 transition",
                              checked
                                ? "border-primary/50 bg-primary/5"
                                : "border-border",
                            )}
                          >
                            <span className="flex items-start gap-3">
                              <EmployeeSelectionCheckbox
                                checked={checked}
                                onCheckedChange={(nextChecked) =>
                                  onTogglePermission?.(
                                    permission.key,
                                    Boolean(nextChecked),
                                  )
                                }
                              />
                              <span>
                                <span className="block font-medium">
                                  {getPermissionLabel(permission)}
                                </span>
                                <span className="mt-1 block text-sm text-muted-foreground">
                                  {humanizePermissionHint(permission)}
                                </span>
                              </span>
                            </span>
                            <span className="flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {SCOPE_LABELS[normalizeRoleKey(permission.scopeType)] ||
                                  permission.scopeType}
                              </Badge>
                              {permission.isSensitive ? (
                                <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                                  Nhạy cảm
                                </Badge>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {sensitivePermissions.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Quyền nhạy cảm đang được chọn
              </div>
              <p className="leading-6">
                {sensitivePermissions.join(", ")}. Chỉ cấp những quyền này khi thật
                sự cần thiết.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

const PermissionSummary = ({
  primaryRoleKey,
  secondaryRoleKeys = [],
  sortedBranchIds = [],
  storeById,
  rolePermissionCount = 0,
  customPermissionCount = 0,
  effectivePermissionCount = 0,
  preview,
  previewLoading,
}) => {
  const branchLabels = sortedBranchIds.map((branchId) => {
    const store = storeById?.get(normalize(branchId));
    return store ? `${store.name} (${store.code || "N/A"})` : branchId;
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <CircleCheckBig className="h-4 w-4 text-emerald-600" />
        Tóm tắt phân quyền
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Vai trò chính
          </div>
          <div className="mt-1 font-medium">{getRoleLabel(primaryRoleKey)}</div>
          {secondaryRoleKeys.length > 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">
              Vai trò phụ: {secondaryRoleKeys.map(getRoleLabel).join(", ")}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Chi nhánh
          </div>
          <div className="mt-1 font-medium">
            {branchLabels.length ? branchLabels.join(", ") : "Không giới hạn theo chi nhánh"}
          </div>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Quyền từ vai trò
          </div>
          <div className="mt-1 font-medium">{rolePermissionCount} quyền mặc định</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Quyền chi tiết bổ sung: {customPermissionCount}
          </div>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Tổng quyền ước tính
          </div>
          <div className="mt-1 font-medium">{effectivePermissionCount} quyền</div>
          <div className="mt-2 text-sm text-muted-foreground">
            {previewLoading
              ? "Đang cập nhật bản xem trước granular..."
              : `Bản xem trước granular: ${preview?.assignments?.length || 0} gán quyền`}
          </div>
        </div>
      </div>
    </div>
  );
};

const EmployeePermissionStep = ({
  availableRoles = ROLE_DEFINITIONS,
  primaryRoleKey,
  selectedRoleKeys = [],
  templateByKey,
  catalog = [],
  permissionKeys = [],
  templateKeys = [],
  granularEnabled = false,
  metadataLoading = false,
  preview = null,
  previewLoading = false,
  sortedBranchIds = [],
  storeById,
  onPrimaryRoleChange,
  onSecondaryRoleToggle,
  onApplyTemplate,
  onTogglePermission,
  onToggleModulePermissions,
}) => {
  const [showAdvancedPermissions, setShowAdvancedPermissions] = useState(
    permissionKeys.length > 0 || templateKeys.length > 0,
  );

  useEffect(() => {
    if (permissionKeys.length > 0 || templateKeys.length > 0) {
      setShowAdvancedPermissions(true);
    }
  }, [permissionKeys.length, templateKeys.length]);

  const primaryRoleTemplate = templateByKey?.get(normalizeRoleKey(primaryRoleKey));
  const secondaryRoleKeys = selectedRoleKeys.filter(
    (roleKey) => normalizeRoleKey(roleKey) !== normalizeRoleKey(primaryRoleKey),
  );

  const rolePermissionKeys = useMemo(() => {
    const keys = selectedRoleKeys.flatMap((roleKey) =>
      (templateByKey?.get(normalizeRoleKey(roleKey))?.permissions || []).map(
        (permission) => permission.key,
      ),
    );
    return unique(keys.map((key) => normalizePermissionKey(key)));
  }, [selectedRoleKeys, templateByKey]);

  const effectivePermissionCount = useMemo(
    () =>
      new Set([
        ...rolePermissionKeys.map((key) => normalizePermissionKey(key)),
        ...permissionKeys.map((key) => normalizePermissionKey(key)),
      ]).size,
    [permissionKeys, rolePermissionKeys],
  );

  const sensitivePermissions = useMemo(
    () =>
      catalog
        .filter(
          (permission) =>
            permission.isSensitive &&
            permissionKeys.some(
              (permissionKey) =>
                normalizePermissionKey(permissionKey) ===
                normalizePermissionKey(permission.key),
            ),
        )
        .map((permission) => getPermissionLabel(permission)),
    [catalog, permissionKeys],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white p-2 text-sky-700 shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-sky-950">
              Chọn vai trò trước, chỉ mở quyền chi tiết khi thực sự cần
            </h3>
            <p className="text-sm leading-6 text-sky-900/80">
              Vai trò là cách nhanh nhất để cấp một bộ quyền chuẩn. Phần quyền chi
              tiết dùng cho tình huống đặc biệt như bổ sung một vài quyền nhạy cảm
              hoặc hỗ trợ nhân viên kiêm nhiệm.
            </p>
          </div>
        </div>
      </div>

      <RoleSelectorGrid
        availableRoles={availableRoles}
        primaryRoleKey={primaryRoleKey}
        onPrimaryRoleChange={onPrimaryRoleChange}
      />

      <RolePermissionPreview
        primaryRoleKey={primaryRoleKey}
        template={primaryRoleTemplate}
        templateApplied={templateKeys.includes(normalizeRoleKey(primaryRoleKey))}
        onApplyTemplate={onApplyTemplate}
        onToggleAdvanced={() => setShowAdvancedPermissions((prev) => !prev)}
        showAdvancedPermissions={showAdvancedPermissions}
        customPermissionCount={permissionKeys.length}
      />

      <SecondaryRolePanel
        availableRoles={availableRoles}
        primaryRoleKey={primaryRoleKey}
        secondaryRoleKeys={secondaryRoleKeys}
        onToggleRole={onSecondaryRoleToggle}
      />

      <AdvancedPermissionPanel
        isOpen={showAdvancedPermissions}
        granularEnabled={granularEnabled}
        metadataLoading={metadataLoading}
        catalog={catalog}
        permissionKeys={permissionKeys}
        onTogglePermission={onTogglePermission}
        onToggleModulePermissions={onToggleModulePermissions}
        sensitivePermissions={sensitivePermissions}
      />

      <PermissionSummary
        primaryRoleKey={primaryRoleKey}
        secondaryRoleKeys={secondaryRoleKeys}
        sortedBranchIds={sortedBranchIds}
        storeById={storeById}
        rolePermissionCount={rolePermissionKeys.length}
        customPermissionCount={permissionKeys.length}
        effectivePermissionCount={effectivePermissionCount}
        preview={preview}
        previewLoading={previewLoading}
      />
    </div>
  );
};

export default EmployeePermissionStep;
