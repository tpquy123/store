import React from "react";
import { formatPrice, formatDate } from "@/shared/lib/utils";

const getDeviceIdentifierText = (item = {}) => {
  const assignments = Array.isArray(item.deviceAssignments) ? item.deviceAssignments : [];
  const assignmentIdentifiers = assignments
    .map((entry) => entry?.imei || entry?.serialNumber || "")
    .filter(Boolean);
  if (assignmentIdentifiers.length > 0) {
    return assignmentIdentifiers.join(" / ");
  }
  return item.imei || item.serialNumber || "N/A";
};

const InvoiceTemplate = ({ order, editableData, storeInfo }) => {
  const {
    storeName = "Ninh Kiều iSTORE",
    storeAddress = "Số 58 Đường 3 Tháng 2 - Phường Xuân Khánh - Quận Ninh Kiều, Cần Thơ",
    hotline = "0917.755.765",
    storePhone = "0981.774.710",
    warrantyUrl = "https://warranty-h1wg.onrender.com",
  } = storeInfo || {};

  const {
    customerName,
    customerPhone,
    customerAddress,
    items,
    totalAmount,
    paymentReceived,
    changeGiven,
    orderNumber,
    createdAt,
    staffName,
    cashierName,
  } = editableData;

  return (
    <div
      className="bg-white mx-auto"
      style={{
        width: "210mm",
        minHeight: "297mm",
        maxHeight: "297mm",
        padding: "15mm 15mm",
        fontSize: "11px",
        lineHeight: "1.3",
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h1 className="text-lg font-bold mb-1">{storeName}</h1>
          <p className="text-xs leading-tight">{storeAddress}</p>
          <p className="text-xs">
            Hotline: {hotline} - Khánh sửa: {storePhone}
          </p>
        </div>
        <div className="w-16 h-16 border border-black flex items-center justify-center flex-shrink-0">
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-3">
        <h2 className="text-base font-bold">
          HÓA ĐƠN BÁN HÀNG KIÊM PHIẾU BẢO HÀNH
        </h2>
        <p className="text-xs">Ngày lúc {formatDate(createdAt)}</p>
      </div>

      {/* Customer Info */}
      <div className="mb-3 space-y-0.5 text-xs">
        <p>
          <span className="font-semibold">Tên khách hàng:</span> {customerName}
        </p>
        <p>
          <span className="font-semibold">Địa chỉ:</span> {customerAddress}
        </p>
        <p>
          <span className="font-semibold">Số điện thoại:</span> {customerPhone}
        </p>
      </div>

      {/* Products Table */}
      <table className="w-full border border-black mb-3 text-xs">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-black p-1.5 text-left font-bold">
              TÊN MÁY
            </th>
            <th className="border-r border-black p-1.5 text-center font-bold w-32">
              IMEI
            </th>
            <th className="p-1.5 text-right font-bold w-24">ĐƠN GIÁ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-black">
              <td className="border-r border-black p-1.5">
                <div>{item.productName}</div>
                <div className="text-[10px] text-gray-600">
                  {item.variantColor}
                  {item.variantStorage && ` - ${item.variantStorage}`}
                </div>
              </td>
              <td className="border-r border-black p-1.5 text-center">
                {getDeviceIdentifierText(item)}
              </td>
              <td className="p-1.5 text-right font-semibold">
                {formatPrice(item.price * item.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Warranty Terms - COMPACT */}
      <div className="border border-black p-2 mb-3 text-xs">
        <p className="font-bold mb-1">
          GÓI BẢO HÀNH CƠ BẢN Ninh Kiều iSTORE Care
        </p>
        <p className="font-bold mb-1">
          LƯU Ý NHỮNG TRƯỜNG HỢP KHÔNG ĐƯỢC BẢO HÀNH
        </p>
        <ul className="list-disc ml-4 text-[10px] space-y-0.5 leading-tight">
          <li>Mất tem máy, rách tem</li>
          <li>
            Kiểm tra màn hình (trường hợp màn sọc mực, đen màn, lỗi màn hình khi
            ra khỏi shop sẽ không bảo hành)
          </li>
          <li>
            Máy bị phơi đơm theo giấy bảo hành KHÔNG có hữu trách nhiệm tài
            khoản icloud
          </li>
          <li>Máy rơi/va đụp, máy trả góp shop không bỏ trợ bảo an tiền</li>
        </ul>
      </div>

      {/* Totals - COMPACT */}
      <div className="border border-black text-xs mb-3">
        <div className="flex justify-between p-1.5 border-b border-black">
          <span className="font-bold">Tiền sản phẩm:</span>
          <span className="font-bold">{formatPrice(totalAmount)}</span>
        </div>
        <div className="flex justify-between p-1.5 border-b border-black">
          <span>Voucher:</span>
          <span>0</span>
        </div>
        <div className="flex justify-between p-1.5 border-b border-black bg-yellow-50">
          <span className="font-bold">Thành tiền:</span>
          <span className="font-bold">{formatPrice(totalAmount)}</span>
        </div>
        <div className="flex justify-between p-1.5 border-b border-black">
          <span className="font-bold">Tiền đã đưa:</span>
          <span className="font-bold">{formatPrice(paymentReceived)}</span>
        </div>
        <div className="flex justify-between p-1.5">
          <span>Khoản vay còn lại:</span>
          <span>0</span>
        </div>
      </div>

      {/* Warning */}
      <div className="text-center my-2">
        <p className="font-bold italic text-xs">
          CẢM ƠN QUÝ KHÁCH ĐÃ TIN TƯỞNG ỦNG HỘ Ninh Kiều iSTORE !!!
        </p>
      </div>

      {/* Signatures */}
      <div className="flex justify-between mb-3">
        <div className="text-center text-xs">
          <p className="font-bold mb-12">NHÂN VIÊN</p>
          <p>{staffName}</p>
        </div>
        <div className="text-center text-xs">
          <p className="font-bold mb-12">KHÁCH HÀNG</p>
          <p>{customerName}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] border-t border-black pt-2">
        <p className="font-bold">
          BẢO HÀNH PHÂN CŨNG PHẦN MỀM TRỌNG 6 THÁNG (KHÔNG ĐỔI LỖI)
        </p>
        <p>
          Xem thêm các điều khoản bảo hành tại{" "}
          <span className="font-semibold">{warrantyUrl}</span>
        </p>
      </div>
    </div>
  );
};

export default InvoiceTemplate;
