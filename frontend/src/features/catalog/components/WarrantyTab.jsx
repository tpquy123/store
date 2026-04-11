import React from "react";
import {
  Check,
  Clock,
  Gift,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Truck,
} from "lucide-react";
import {
  formatIdentifierPolicy,
  formatWarrantyDuration,
  formatWarrantyProvider,
  isSerializedProduct,
  resolveAfterSalesConfig,
} from "@/features/afterSales/utils/afterSales";

export const WarrantyTab = ({ product }) => {
  const config = resolveAfterSalesConfig(product);
  const serializedTracking = isSerializedProduct(product);
  const warrantyProvider = formatWarrantyProvider(config.warrantyProvider);
  const warrantyDuration = formatWarrantyDuration(config.warrantyMonths);
  const identifierPolicy = formatIdentifierPolicy(config.identifierPolicy);
  const warrantyTerms =
    config.warrantyTerms ||
    "Ap dung theo dieu kien bao hanh cua cua hang va nha san xuat.";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <Gift className="h-8 w-8" />
          <div>
            <h3 className="text-xl font-bold">Dich vu sau ban hang</h3>
            <p className="mt-1 text-sm text-orange-50">
              {serializedTracking
                ? "Thiet bi duoc quan ly bao hanh cua hang theo ma dinh danh rieng."
                : "San pham hien thi thong tin bao hanh theo chinh sach dang ap dung."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Shield className="h-6 w-6" />
          </div>
          <p className="text-lg font-bold text-blue-900">{warrantyDuration}</p>
          <p className="mt-1 text-sm text-slate-700">{warrantyProvider}</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Smartphone className="h-6 w-6" />
          </div>
          <p className="text-lg font-bold text-emerald-900">{identifierPolicy}</p>
          <p className="mt-1 text-sm text-slate-700">
            {serializedTracking
              ? "Ma dinh danh dung de tao va tra cuu phieu bao hanh cua hang."
              : "San pham nay khong bat buoc theo doi IMEI/Serial trong he thong."}
          </p>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-white">
            <RefreshCw className="h-6 w-6" />
          </div>
          <p className="text-lg font-bold text-orange-900">
            {serializedTracking ? "Co theo doi tung may" : "Khong tao phieu theo tung may"}
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {serializedTracking
              ? "Warranty duoc gan truc tiep vao IMEI/Serial va so dien thoai khach hang."
              : "He thong khong tao phieu bao hanh cua hang cho nhom san pham nay."}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="border-b bg-slate-50 px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Chinh sach bao hanh
          </h3>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex gap-3">
            <div className="mt-1 rounded-full bg-blue-100 p-2 text-blue-600">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Thoi han bao hanh</p>
              <p className="text-sm text-slate-600">
                Bao hanh duoc tinh tu ngay ban giao va keo dai trong{" "}
                {warrantyDuration.toLowerCase()}.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="mt-1 rounded-full bg-emerald-100 p-2 text-emerald-600">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Tra cuu cong khai</p>
              <p className="text-sm text-slate-600">
                Khach hang co the kiem tra thong tin bang so dien thoai hoac{" "}
                {identifierPolicy.toLowerCase()} khi san pham duoc cua hang tu bao hanh.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="mt-1 rounded-full bg-amber-100 p-2 text-amber-600">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Dieu khoan ap dung</p>
              <p className="text-sm text-slate-600">{warrantyTerms}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="border-b bg-orange-50 px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-orange-900">
            <RefreshCw className="h-5 w-5" />
            Doi tra va ho tro
          </h3>
        </div>
        <div className="grid gap-5 p-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
              <span>Warranty cua hang chi duoc tao khi san pham thuoc nhom STORE.</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
              <span>IMEI/Serial duoc luu de truy vet chinh xac tung thiet bi can bao hanh.</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
              <span>Khach hang co the tim lai phieu bao hanh bang so dien thoai mua hang.</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <Truck className="mt-0.5 h-4 w-4 text-blue-600" />
              <span>San pham moi duoc hien thi theo chinh sach bao hanh hang, khong tao phieu store warranty.</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <Gift className="mt-0.5 h-4 w-4 text-orange-600" />
              <span>Quy tac co the duoc mo rong cho dien thoai, laptop, tai nghe va cac nhom san pham khac.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarrantyTab;
