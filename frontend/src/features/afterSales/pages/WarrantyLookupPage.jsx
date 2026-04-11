import React, { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Search,
  ShieldCheck,
  ShieldX,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { afterSalesAPI } from "../api/afterSales.api";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

const STATUS_STYLES = {
  ACTIVE: {
    label: "Còn bảo hành",
    className: "bg-black text-white",
  },
  EXPIRED: {
    label: "Hết bảo hành",
    className: "bg-gray-100 text-gray-500",
  },
  VOID: {
    label: "Bảo hành vô hiệu",
    className: "bg-gray-800 text-gray-200",
  },
  REPLACED: {
    label: "Đã đổi máy",
    className: "bg-gray-300 text-gray-800",
  },
};

const formatDate = (value) => {
  if (!value) return "N/A";
  return new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
};

const formatRemaining = (days) => {
  const normalizedDays = Number(days) || 0;
  if (normalizedDays <= 0) return "Đã hết hạn";
  const months = Math.floor(normalizedDays / 30);
  const remainingDays = normalizedDays % 30;
  if (months <= 0) return `${remainingDays} ngày`;
  if (remainingDays === 0) return `${months} tháng`;
  return `${months} tháng ${remainingDays} ngày`;
};

const isPhoneLookup = (value) => {
  const normalizedValue = String(value || "").trim();
  if (/[A-Za-z]/.test(normalizedValue)) {
    return false;
  }

  const digits = normalizedValue.replace(/\D+/g, "");
  if (digits.length === 15) {
    return false;
  }

  return digits.length >= 9 && digits.length <= 11;
};

const WarrantyLookupPage = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const searchSummary = useMemo(
    () => ({
      total: results.length,
    }),
    [results]
  );

  const handleLookup = async (event) => {
    event?.preventDefault?.();

    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      toast.error("Vui lòng nhập số điện thoại hoặc IMEI/Serial");
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const response = await afterSalesAPI.warrantyLookup(
        isPhoneLookup(normalizedQuery)
          ? { phone: normalizedQuery }
          : { imeiOrSerial: normalizedQuery }
      );
      setResults(response.data?.data?.warranties || []);
    } catch (error) {
      setResults([]);
      toast.error(
        error.response?.data?.message ||
          "Không tìm thấy thông tin bảo hành phù hợp"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-black">
                  <ShieldCheck className="h-4 w-4" />
                  Tra cứu phiếu bảo hành
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">
                  Kiểm tra bảo hành bằng SĐT hoặc IMEI/Serial
                </h1>
                <p className="mt-3 text-sm leading-6 text-gray-500 sm:text-base">
                  Nhập số điện thoại khách hàng hoặc mã định danh thiết bị để xem
                  thời hạn, chính sách và trạng thái bảo hành của hãng.
                </p>
              </div>
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-black text-white shadow-md">
                <Smartphone className="h-10 w-10" />
              </div>
            </div>

            <form className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={handleLookup}>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ví dụ: 0848549959, 356789012345678, SN-ABC-2026"
                className="h-12 border-gray-200 bg-white text-base"
              />
              <Button
                type="submit"
                disabled={loading}
                className="h-12 gap-2 bg-black text-white hover:bg-gray-800"
              >
                <Search className="h-4 w-4" />
                {loading ? "Đang kiểm tra..." : "Tra cứu bảo hành"}
              </Button>
            </form>
          </div>

          {searchSummary.total > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">
              Tìm thấy <span className="font-semibold text-black">{searchSummary.total}</span> thiết bị phù hợp.
            </div>
          )}

          {results.map((item) => {
            const statusMeta =
              STATUS_STYLES[String(item.warrantyStatus || "").toUpperCase()] ||
              STATUS_STYLES.EXPIRED;

            return (
              <Card
                key={item.id}
                className="border-gray-200 shadow-sm"
              >
                <CardHeader className="border-b bg-gray-50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-xl text-black">
                        {item.productName}
                      </CardTitle>
                      <p className="mt-1 text-sm text-gray-500">
                        Thiết bị: {item.identifier || "Không có mã định danh"}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Số điện thoại: {item.customerPhone || "N/A"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-semibold ${statusMeta.className}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-black">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Ngày mua
                    </p>
                    <p className="mt-2 text-lg font-semibold text-black">
                      {formatDate(item.purchaseDate)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-black">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Hạn bảo hành
                    </p>
                    <p className="mt-2 text-lg font-semibold text-black">
                      {formatDate(item.warrantyExpirationDate)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-black">
                      <Clock3 className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Thời gian còn lại
                    </p>
                    <p className="mt-2 text-lg font-semibold text-black">
                      {formatRemaining(item.remainingWarrantyDays)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-black">
                      {String(item.warrantyStatus || "").toUpperCase() === "ACTIVE" ? (
                        <ShieldCheck className="h-5 w-5" />
                      ) : (
                        <ShieldX className="h-5 w-5" />
                      )}
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Trạng thái
                    </p>
                    <p className="mt-2 text-lg font-semibold text-black">
                      {statusMeta.label}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-black">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Chính sách
                    </p>
                    <p className="mt-2 text-sm font-medium leading-6 text-black">
                      {item.warrantyPolicy || "Theo chính sách bảo hành của cửa hàng"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {searched && !results.length && !loading && (
            <Card className="border-dashed border-gray-300 bg-white">
              <CardContent className="py-12 text-center">
                <ShieldX className="mx-auto h-10 w-10 text-gray-400" />
                <h2 className="mt-4 text-lg font-semibold text-black">
                  Không tìm thấy thông tin bảo hành
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Kiểm tra lại SĐT, IMEI hoặc serial, sau đó thử tra cứu lại.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default WarrantyLookupPage;
