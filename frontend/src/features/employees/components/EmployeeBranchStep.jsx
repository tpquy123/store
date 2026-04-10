import React from "react";
import { AlertTriangle, Info, MapPin } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/utils";

import EmployeeSelectionCheckbox from "./EmployeeSelectionCheckbox";

const normalize = (value) => String(value || "").trim();
const toDisplayText = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(toDisplayText).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const orderedKeys = ["street", "ward", "district", "province", "city"];
    const prioritized = orderedKeys
      .map((key) => value?.[key])
      .filter(Boolean)
      .map((item) => String(item).trim());
    const remaining = Object.entries(value)
      .filter(([key]) => !orderedKeys.includes(key))
      .map(([, item]) => toDisplayText(item))
      .filter(Boolean);

    return [...prioritized, ...remaining].join(", ");
  }
  return String(value).trim();
};

const EmployeeBranchStep = ({
  branchStoreOptions = [],
  branchIds = [],
  primaryBranchId = "",
  sortedBranchIds = [],
  roleNeedsBranch = false,
  hasBranchScopedPermission = false,
  onToggleBranch,
  onPrimaryBranchChange,
  storeById,
  selectedRoleLabels = [],
}) => {
  const branchSelectionRequired = roleNeedsBranch || hasBranchScopedPermission;
  const selectedCount = branchIds.length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white p-2 text-slate-700 shadow-sm">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Chọn chi nhánh làm việc
              </h3>
              <Badge
                variant={branchSelectionRequired ? "default" : "secondary"}
                className={cn(
                  branchSelectionRequired
                    ? "bg-amber-500 text-white hover:bg-amber-500"
                    : "bg-white text-slate-700",
                )}
              >
                {branchSelectionRequired ? "Bắt buộc" : "Có thể bỏ qua"}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Chọn chi nhánh mà nhân viên này sẽ làm việc. Quyền hạn sẽ được
              giới hạn trong phạm vi chi nhánh được chọn.
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <Badge variant="outline" className="bg-white">
                Đã chọn {selectedCount} chi nhánh
              </Badge>
              {selectedRoleLabels.length ? (
                <Badge variant="outline" className="bg-white">
                  Vai trò hiện tại: {selectedRoleLabels.join(", ")}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {!branchSelectionRequired ? (
        <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <Info className="h-4 w-4" />
            Bước này đang là tuỳ chọn
          </div>
          <p>
            Vai trò hiện tại không bắt buộc gắn chi nhánh. Bạn vẫn có thể chọn
            chi nhánh nếu muốn giới hạn phạm vi làm việc ngay từ đầu.
          </p>
        </div>
      ) : null}

      {branchStoreOptions.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          Không có chi nhánh nào trong phạm vi quản lý để gán cho nhân viên này.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {branchStoreOptions.map((store) => {
            const storeId = normalize(store?._id);
            const checked = branchIds.some((branchId) => normalize(branchId) === storeId);
            const isPrimary = normalize(primaryBranchId) === storeId;
            const addressLabel = toDisplayText(store?.address);

            const toggleCard = () => onToggleBranch?.(storeId, !checked);
            const handleCardKeyDown = (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              toggleCard();
            };

            return (
              <div
                key={storeId}
                role="button"
                tabIndex={0}
                aria-pressed={checked}
                className={cn(
                  "rounded-2xl border bg-background p-4 text-left transition hover:border-primary/40 hover:shadow-sm",
                  checked
                    ? "border-primary/60 bg-primary/5"
                    : "border-border",
                )}
                onClick={toggleCard}
                onKeyDown={handleCardKeyDown}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <EmployeeSelectionCheckbox
                      checked={checked}
                      onCheckedChange={(nextChecked) =>
                        onToggleBranch?.(storeId, Boolean(nextChecked))
                      }
                      onClick={(event) => event.stopPropagation()}
                    />
                    <div>
                      <div className="font-medium text-foreground">{store.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Mã chi nhánh: {store.code || "N/A"}
                      </div>
                      {addressLabel ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {addressLabel}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {isPrimary ? (
                    <Badge className="bg-sky-600 text-white hover:bg-sky-600">
                      Chính
                    </Badge>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {branchSelectionRequired && branchStoreOptions.length > 0 && selectedCount === 0 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Cần chọn ít nhất một chi nhánh để tiếp tục
          </div>
          <p>
            Một trong các vai trò hoặc quyền bạn đang chọn yêu cầu phạm vi chi
            nhánh.
          </p>
        </div>
      ) : null}

      {selectedCount > 1 ? (
        <div className="rounded-2xl border p-4">
          <Label className="mb-2 block">Chi nhánh chính</Label>
          <p className="mb-3 text-sm text-muted-foreground">
            Chi nhánh chính sẽ được dùng làm ngữ cảnh mặc định khi nhân viên đăng
            nhập.
          </p>
          <Select
            value={normalize(primaryBranchId)}
            onValueChange={(value) => onPrimaryBranchChange?.(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn chi nhánh chính" />
            </SelectTrigger>
            <SelectContent>
              {sortedBranchIds.map((branchId) => {
                const normalizedBranchId = normalize(branchId);
                const store = storeById?.get(normalizedBranchId);
                const label = store
                  ? `${store.name} (${store.code || "N/A"})`
                  : normalizedBranchId;

                return (
                  <SelectItem key={normalizedBranchId} value={normalizedBranchId}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
};

export default EmployeeBranchStep;
