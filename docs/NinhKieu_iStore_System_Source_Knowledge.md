# Ninh Kiều iStore – Tài liệu mô tả hệ thống (Knowledge Source)

Tài liệu này được viết theo hướng “kiến thức nguồn” để các công cụ AI (ví dụ NotebookLM) có thể đọc và tự sinh nội dung báo cáo phân tích – thiết kế. Nội dung bám sát hệ thống bán hàng đa chi nhánh (omnichannel) gồm kênh online + POS tại cửa hàng + nghiệp vụ kho + giao hàng + quản trị.

- Phạm vi nghiệp vụ cốt lõi:
  - Mua hàng online (catalog → cart → checkout → thanh toán → theo dõi đơn)
  - Bán hàng tại quầy (POS) + thu ngân + chốt đơn
  - Định tuyến đơn hàng theo chi nhánh (routing)
  - Quản lý kho & tồn kho theo chi nhánh (available/reserved)
  - Hậu mãi: quản lý thiết bị theo IMEI/Serial + kích hoạt/tra cứu bảo hành
  - Phân quyền nhân viên theo vai trò và ngữ cảnh chi nhánh (RBAC + permission + scope)

## Tổng quan hệ thống

### Mục tiêu

- Tăng khả năng bán hàng & phục vụ khách theo mô hình đa chi nhánh:
  - Khách đặt online → hệ thống chọn chi nhánh phù hợp để giao nhanh nhất (và/hoặc đủ hàng).
  - Khách mua tại cửa hàng → POS tạo đơn nhanh, thu ngân xử lý thanh toán, kho/nhân viên bàn giao.
- Đồng nhất dữ liệu vận hành:
  - Đơn hàng có lịch sử trạng thái (audit), theo dõi được theo giai đoạn.
  - Tồn kho theo chi nhánh có cơ chế “giữ hàng” (reserve) để tránh oversell.
- Kiểm soát rủi ro khi vận hành nhiều chi nhánh:
  - Mọi thao tác của nhân viên đều gắn với **chi nhánh đang active** (Branch Context).
  - Một số bảng/collection có “cô lập chi nhánh” ở tầng ORM để tránh query nhầm.
  - Quyền nhạy cảm yêu cầu **Step-up (OTP)**.

### Kênh sử dụng & nhóm người dùng (Actor)

> Danh sách actor bắt buộc (theo yêu cầu):

- Khách vãng lai (Guest)
- Khách hàng (Customer)
- Nhân viên kho (Warehouse Staff)
- Nhân viên bán hàng (POS Staff)
- Thu ngân (Cashier)
- Nhân viên giao hàng (Shipper) / carrier
- Quản lý (Manager/Admin)

### Bản đồ chức năng theo nhóm

- Public/Customer:
  - Xem sản phẩm, tìm kiếm/lọc
  - Giỏ hàng, checkout
  - Thanh toán (VNPay, chuyển khoản QR/SePay, COD)
  - Theo dõi đơn
  - Tra cứu bảo hành
- Operations (vận hành):
  - Quản lý đơn hàng (OMS) theo chi nhánh
  - Gán chi nhánh xử lý, gán shipper/carrier
  - Cập nhật trạng thái theo state machine
- Warehouse:
  - Nhập kho, xuất kho/pick theo đơn
  - Quản lý vị trí kho, kiểm kê, điều chỉnh tồn
  - Chuyển kho giữa chi nhánh
  - Quản lý thiết bị theo IMEI/Serial
- POS:
  - POS tạo đơn in-store
  - Thu ngân thu tiền, xuất VAT, finalize
- Admin/Manager:
  - Quản lý nhân viên, phân quyền, audit
  - Quản lý sản phẩm/brand/type, khuyến mãi, nội dung
  - Quản lý chi nhánh, tồn kho dashboard, stock-in

## Kiến trúc tổng thể (System Architecture)

### Thành phần chính

- Frontend: React SPA
  - Router chia theo nhóm: public, customer, operations, warehouse, admin
  - Bảo vệ trang bằng `ProtectedRoute` dựa trên `allowedPermissions`
- Backend: Node.js + Express
  - Modules theo domain: auth/authz, order, payment, store, inventory, warehouse, warranty, device…
  - Có các “service” cho logic trọng yếu: routingService, selectBranch, warrantyService…
- Database: MongoDB (Mongoose)
  - Nhiều collection có index + unique constraint cho tính nhất quán (IMEI/Serial unique, SKU unique…)
- Tích hợp bên ngoài:
  - VNPay: payment URL + IPN callback + return
  - SePay: tạo QR + webhook xác nhận chuyển khoản
  - Cloudinary (tuỳ module) cho media review/nội dung
  - Email/OTP (step-up) qua Nodemailer/TOTP (tuỳ cấu hình)

### Multi-branch – nguyên tắc “Branch Context”

Trong hệ thống đa chi nhánh, cùng một thao tác (xem tồn kho, pick hàng, cập nhật bảo hành…) có ý nghĩa khác nhau theo chi nhánh. Do đó hệ thống dùng **Branch Context** làm “khung” cho mọi request của nhân viên:

- Header dùng trong request:
  - `x-active-branch-id`: chi nhánh đang thao tác (bắt buộc với đa số nghiệp vụ staff)
  - `x-simulate-branch-id`: chỉ Global Admin dùng để giả lập chi nhánh
- Quy tắc:
  - Staff cần có ít nhất 1 branch assignment ACTIVE.
  - Nếu staff chọn active branch không thuộc allowedBranchIds → chặn.
  - Với các model branch-scoped, nếu không có branch context → **fail closed**.

### Cô lập dữ liệu theo chi nhánh (Branch Isolation Plugin)

Một số collection có plugin tự động inject filter theo `storeId` (hoặc field tương đương):

- Ví dụ các model branch-scoped: `StoreInventory`, `Device`, `WarrantyRecord`, `WarehouseLocation`, `Inventory` (warehouse)
- Cơ chế:
  - Middleware authz gắn context bằng AsyncLocalStorage.
  - Trước khi query (find/findOne/aggregate…), plugin tự thêm điều kiện `{ storeId: activeBranchId }`.
  - Nếu thiếu context và không set `{ skipBranchIsolation: true }` → throw lỗi `BRANCH_CONTEXT_REQUIRED`.
- Ý nghĩa nghiệp vụ:
  - Nhân viên kho chi nhánh A không thể “vô tình” nhìn/ghi tồn kho chi nhánh B chỉ vì quên filter.
  - Batch job/system admin có thể chủ động bỏ qua cô lập bằng `skipBranchIsolation: true`.

## Thuật ngữ và định nghĩa (Glossary)

- Store / Branch / Chi nhánh: đơn vị vận hành có địa chỉ, kho, dịch vụ giao hàng.
- Warehouse (kho vị trí): tồn kho chi tiết theo kệ/ngăn (WarehouseLocation).
- StoreInventory: tồn kho thương mại theo chi nhánh phục vụ bán online (quantity/reserved/available).
- Reserved: phần tồn kho giữ chỗ cho đơn chưa hoàn tất (để không bị bán trùng).
- AssignedStore: chi nhánh được gán để xử lý một đơn hàng (snapshot).
- FulfillmentType:
  - HOME_DELIVERY: giao tận nơi
  - CLICK_AND_COLLECT: đặt online, nhận tại cửa hàng
  - IN_STORE: mua trực tiếp tại cửa hàng (POS)
- OrderSource: ONLINE hoặc IN_STORE.
- Serialized tracking: theo dõi theo từng thiết bị (IMEI/Serial), không chỉ theo số lượng.
- RBAC: phân quyền theo vai trò; Permission: quyền cụ thể theo hành động; Scope: phạm vi dữ liệu áp dụng.
- Task scope: quyền chỉ áp dụng trên “đơn được gán” (shipper).
- Step-up: xác thực tăng cường (OTP) trước thao tác nhạy cảm.

## Mô hình nghiệp vụ cốt lõi (Business Domain Model)

### Thực thể chính và quan hệ

- User (khách hàng/nhân viên)
  - Có thể:
    - Mua hàng online (cart, order)
    - Là nhân viên được gán chi nhánh (branchAssignments)
    - Là shipper (task role)
- Store (chi nhánh)
  - Có tồn kho StoreInventory
  - Có kho vị trí (WarehouseLocation + Inventory)
  - Là nơi xử lý đơn (Order.assignedStore)
- Product (UniversalProduct) và Variant (UniversalVariant)
  - Variant có SKU unique + stock + pricing
  - Product có cấu hình hậu mãi (afterSalesConfig)
- Order
  - Có items (product/variant/sku/quantity/price)
  - Có trạng thái workflow + giai đoạn hiển thị (stage)
  - Gắn với assignedStore, shipper/carrier, paymentInfo
  - Khi hoàn tất → kích hoạt WarrantyRecord và cập nhật Device
- Device (IMEI/Serial)
  - Gắn chi nhánh, SKU
  - Dùng để đảm bảo “mỗi thiết bị” chỉ bán 1 lần và có bảo hành đúng
- WarrantyRecord
  - Gắn Order + OrderItem, có lookup theo IMEI/Serial hoặc SĐT

## Trạng thái & vòng đời (System States)

### PaymentStatus (trạng thái thanh toán)

- `PENDING`: mới khởi tạo, đang chờ xử lý thanh toán
- `UNPAID`: chưa thanh toán (thường dùng cho POS cash trước khi thu tiền)
- `PAID`: đã thanh toán thành công
- `FAILED`: thanh toán thất bại
- `REFUNDED`: đã hoàn tiền (tuỳ luồng refund)

### OrderStatus (trạng thái đơn hàng)

> Đơn online và đơn in-store dùng chung bộ status nhưng có state machine khác nhau.

- Nhóm khởi tạo/chờ xử lý:
  - `PENDING`
  - `PENDING_ORDER_MANAGEMENT` (đơn POS tạo, chờ Order Manager nhận xử lý)
  - `PENDING_PAYMENT`
  - `PAYMENT_FAILED`
- Nhóm xử lý:
  - `CONFIRMED`
  - `PROCESSING`
  - `PREPARING`
  - `PREPARING_SHIPMENT`
  - `READY_FOR_PICKUP`
- Nhóm vận chuyển/nhận:
  - `SHIPPING`
  - `OUT_FOR_DELIVERY`
  - `DELIVERED`
  - `PICKED_UP`
  - `COMPLETED`
- Nhóm huỷ/hoàn:
  - `CANCELLED`
  - `RETURN_REQUESTED`
  - `RETURNED`
  - **Safe-cancel (đơn đã PAID):**
    - `CANCEL_REFUND_PENDING` (huỷ – cần hoàn tiền)
    - `INCIDENT_REFUND_PROCESSING` (đang xử lý hoàn tiền)

### OrderStatusStage (giai đoạn hiển thị)

- Stage giúp UI hiển thị timeline đơn giản:
  - PENDING → CONFIRMED → PICKING → PICKUP_COMPLETED → IN_TRANSIT → DELIVERED
  - Nhánh lỗi/kết thúc sớm: PAYMENT_FAILED, CANCELLED, RETURNED

### Inventory state (thiết bị)

- `IN_STOCK`, `RESERVED`, `SOLD`, `RETURNED`, `SCRAPPED`

### Warranty status

- `ACTIVE`, `EXPIRED`, `VOID`, `REPLACED`

### Quy tắc chuyển trạng thái đơn hàng (Order State Machine)

- Mục tiêu:
  - Chuẩn hoá luồng xử lý đơn theo trạng thái hợp lệ (không “nhảy cóc” tùy tiện).
  - Ràng buộc quyền theo vai trò (warehouse/shipper/POS/manager).
  - Tránh lỗi nghiệp vụ quan trọng: **đơn đã thanh toán online không được huỷ trực tiếp**.
- Khái niệm:
  - `Order.status`: trạng thái workflow chi tiết (nhiều trạng thái).
  - `Order.statusStage`: giai đoạn hiển thị (ít trạng thái hơn), được map từ status.
  - Online và In-store có **tập transition** khác nhau.
- Chuẩn hoá alias status (khi nhận input từ UI/legacy):
  - `NEW` → `PENDING`
  - `PACKING` → `PREPARING`
  - `READY_TO_SHIP` → `PREPARING_SHIPMENT`
  - `IN_TRANSIT` → `SHIPPING`
  - `PICKING` → `PROCESSING`
  - `PICKUP_COMPLETED` → `PREPARING_SHIPMENT`
- Guard quan trọng (safe-cancel):
  - Nếu `order.paymentStatus = PAID`:
    - Không cho set `status = CANCELLED` trực tiếp.
    - Bắt buộc đi qua `CANCEL_REFUND_PENDING` (huỷ – cần hoàn tiền) và luồng xử lý hoàn.
- Map status → stage (phục vụ timeline):
  - `PROCESSING`, `PREPARING` → stage `PICKING`
  - `PREPARING_SHIPMENT`, `READY_FOR_PICKUP` → stage `PICKUP_COMPLETED`
  - `SHIPPING`, `OUT_FOR_DELIVERY` → stage `IN_TRANSIT`
  - `CANCEL_REFUND_PENDING`, `INCIDENT_REFUND_PROCESSING` → stage `CANCELLED` (hiển thị như đã huỷ cho khách, nhưng nội bộ còn xử lý refund)

#### Tập chuyển trạng thái cho đơn ONLINE (tóm tắt theo trạng thái hiện tại)

- `PENDING` → `CONFIRMED` | `CANCELLED` | `CANCEL_REFUND_PENDING`
- `PENDING_PAYMENT` → `PENDING` | `PAYMENT_FAILED` | `CANCELLED`
- `PAYMENT_CONFIRMED` → `PENDING` | `CONFIRMED` | `CANCEL_REFUND_PENDING`
- `PAYMENT_VERIFIED` → `PENDING` | `CONFIRMED` | `CANCEL_REFUND_PENDING`
- `PAYMENT_FAILED` → `PENDING_PAYMENT` | `PENDING` | `CANCELLED`
- `CONFIRMED` → `PROCESSING` | `PREPARING` | `PREPARING_SHIPMENT` | `CANCEL_REFUND_PENDING`
- `PROCESSING` → `PREPARING` | `PREPARING_SHIPMENT` | `CANCEL_REFUND_PENDING`
- `PREPARING` → `PREPARING_SHIPMENT` | `CANCEL_REFUND_PENDING`
- `PREPARING_SHIPMENT` → `SHIPPING` | `CANCEL_REFUND_PENDING`
- `READY_FOR_PICKUP` → `PICKED_UP` | `CANCEL_REFUND_PENDING`
- `SHIPPING` → `DELIVERED` | `RETURNED` | `DELIVERY_FAILED` | `CANCEL_REFUND_PENDING`
- `OUT_FOR_DELIVERY` → `DELIVERED` | `RETURNED` | `DELIVERY_FAILED` | `CANCEL_REFUND_PENDING`
- `DELIVERED` → `COMPLETED` | `RETURN_REQUESTED` | `RETURNED`
- `PICKED_UP` → `COMPLETED` | `RETURN_REQUESTED` | `RETURNED`
- `RETURN_REQUESTED` → `RETURNED` | `COMPLETED`
- `DELIVERY_FAILED` → `CANCELLED` | `RETURNED` | `SHIPPING`
- `CANCEL_REFUND_PENDING` → `INCIDENT_REFUND_PROCESSING` | `RETURNED`
- `INCIDENT_REFUND_PROCESSING` → `RETURNED`
- `COMPLETED` → (kết thúc)
- `RETURNED` → (kết thúc)
- `CANCELLED` → (kết thúc)

#### Tập chuyển trạng thái cho đơn IN_STORE (POS)

- `PENDING` → `CONFIRMED` | `PROCESSING` | `PREPARING` | `PREPARING_SHIPMENT` | `PENDING_PAYMENT` | `PENDING_ORDER_MANAGEMENT` | `CANCELLED`
- `PENDING_ORDER_MANAGEMENT` → `PROCESSING` | `CONFIRMED` | `CANCELLED`
- `CONFIRMED` → `PROCESSING` | `PREPARING` | `PREPARING_SHIPMENT` | `PENDING_PAYMENT` | `CANCELLED`
- `PROCESSING` → `PREPARING` | `PREPARING_SHIPMENT` | `PENDING_PAYMENT` | `CANCELLED`
- `PREPARING` → `PREPARING_SHIPMENT` | `PENDING_PAYMENT` | `CANCELLED`
- `PREPARING_SHIPMENT` → `CONFIRMED` | `PENDING_PAYMENT` | `CANCELLED`
- `PENDING_PAYMENT` → `DELIVERED` | `CANCELLED`
- `DELIVERED` → `COMPLETED` | `RETURN_REQUESTED` | `RETURNED`
- `RETURN_REQUESTED` → `RETURNED` | `COMPLETED`
- `PAYMENT_FAILED` → `PENDING_PAYMENT` | `CANCELLED`
- `CANCEL_REFUND_PENDING` → `INCIDENT_REFUND_PROCESSING` | `RETURNED`
- `INCIDENT_REFUND_PROCESSING` → `RETURNED`
- `COMPLETED`/`RETURNED`/`CANCELLED` → (kết thúc)

#### Liên kết quyền → khả năng set trạng thái (capability model)

- `canManageAll` (admin/global admin): được set hầu hết trạng thái (nhưng vẫn bị chặn huỷ trực tiếp nếu đơn PAID).
- `canManageCoordinator` (điều phối): thường được set các trạng thái “điều phối” như CONFIRMED/PROCESSING/SHIPPING/CANCEL*.
- `canManageWarehouse` (kho): được set PROCESSING/PREPARING/PREPARING_SHIPMENT/SHIPPING/PENDING_PAYMENT/CANCEL*.
- `canManageTask` (shipper/task): chủ yếu set SHIPPING/DELIVERED/RETURNED cho đơn được gán.
- `canManagePos` (POS): set các trạng thái bàn giao in-store (ví dụ CONFIRMED/PENDING_PAYMENT).
- Quy tắc đặc biệt:
  - Set `PREPARING_SHIPMENT` yêu cầu quyền “hoàn tất pick in-store” hoặc “warehouse manage” (để tránh set bừa).

## Use Case – Danh sách đầy đủ (theo yêu cầu)

> Danh sách use case bắt buộc phải có trong tài liệu:

- Đăng ký, đăng nhập
- Tìm kiếm, lọc
- Xem sản phẩm
- Mua hàng
- Quản lý giỏ hàng
- Theo dõi đơn hàng
- Quản lý sản phẩm
- Quản lý đơn hàng
- Thanh toán
- Quản lý nhân viên
- Bảo hành

## Use Case – Mô tả chi tiết

### UC-01: Đăng ký tài khoản

- Actor:
  - Khách vãng lai (tự đăng ký)
  - POS Staff/Staff (đăng ký nhanh khách tại quầy)
- Mô tả:
  - Tạo tài khoản khách hàng để mua online/lưu lịch sử.
- Input:
  - `fullName` (bắt buộc)
  - `phoneNumber` (bắt buộc, unique, định dạng `0` + 9 số)
  - `password` (bắt buộc, >= 8 ký tự, có hoa/thường/số/ký tự đặc biệt)
  - `email` (tuỳ chọn)
- Output:
  - User mới (không trả password), token đăng nhập (tuỳ thiết kế)
- Luồng chính:
  1. Guest mở Register và nhập thông tin.
  2. Backend validate định dạng và uniqueness.
  3. Backend hash password và lưu `User`.
  4. Trả kết quả thành công.
- Luồng phụ:
  - Nếu đăng ký nhanh tại POS:
    - Staff nhập SĐT + tên
    - Backend tạo user nếu chưa có, sinh mật khẩu tạm, trả cho staff thông báo khách.
- Trạng thái hệ thống:
  - `User` được tạo với `status=ACTIVE`.

### UC-02: Đăng nhập/Đăng xuất

- Actor: Khách hàng / Nhân viên / Admin
- Mô tả: xác thực bằng SĐT/email + mật khẩu.
- Input: identifier, password
- Output: token/session + user profile
- Luồng chính:
  1. User gửi thông tin đăng nhập.
  2. Backend tìm user, so khớp mật khẩu.
  3. Nếu đúng → cấp token và trả user.
  4. Logout → invalidate token/cookie (tuỳ cơ chế).
- Luồng phụ:
  - User LOCKED → từ chối.
  - AuthzState REVIEW_REQUIRED → từ chối truy cập.

### UC-03: Tìm kiếm, lọc sản phẩm

- Actor: Guest/Customer
- Mô tả: tìm sản phẩm theo từ khoá, hỗ trợ sửa lỗi gõ, đồng nghĩa, lọc theo category.
- Input:
  - `q` (>= 2 ký tự)
  - `category` (slug hoặc ObjectId)
  - `limit`
- Output: danh sách sản phẩm + thông tin route category + relevance.
- Luồng chính:
  1. User nhập từ khoá.
  2. Frontend gọi API search/autocomplete.
  3. Backend:
     - Chuẩn hoá tiếng Việt, sửa typo (ví dụ ipone→iphone)
     - Expand synonyms (laptop↔macbook…)
     - Dùng text index `$text` theo `PUBLIC_PRODUCT_STATUSES`
     - Fallback regex nếu text search rỗng
  4. Trả kết quả.
- Luồng phụ:
  - Category không hợp lệ → trả rỗng.
- Trạng thái hệ thống: read-only.

### UC-04: Xem sản phẩm

- Actor: Guest/Customer
- Mô tả: xem chi tiết sản phẩm, chọn variant/SKU, xem giá/tồn, chính sách hậu mãi.
- Input: productSlug/productId
- Output: product + variants + pricing + stock
- Luồng chính:
  1. User mở product detail.
  2. Backend trả thông tin product + variants.
  3. UI cho phép chọn variant.
  4. User “Add to cart”.
- Luồng phụ:
  - Product status không cho phép mua (`IN_STOCK` mới mua được) → disable mua.
  - Variant hết stock → disable.
- Trạng thái hệ thống: read-only (đến khi add-to-cart).

### UC-05: Quản lý giỏ hàng

- Actor: Customer
- Mô tả: thêm/xoá/sửa số lượng sản phẩm trong giỏ.
- Input: productId, variantId, quantity, price, sku, productType
- Output: cart updated (items + totals)
- Luồng chính:
  1. Customer thêm sản phẩm → backend upsert cart theo customerId.
  2. Customer chỉnh quantity:
     - quantity < 1 → remove
     - quantity tăng → validate stock (UI + backend)
  3. UI hiển thị tổng tiền (`totalAmount`) và tổng số lượng (`totalItems`).
- Luồng phụ:
  - Item không tồn tại → báo lỗi hoặc bỏ qua.
- Trạng thái hệ thống:
  - `Cart` thay đổi.

### UC-06: Mua hàng (Checkout tạo đơn)

- Actor: Customer
- Mô tả: tạo Order từ giỏ, định tuyến chi nhánh, reserve tồn, chuẩn bị thanh toán.
- Input:
  - items[]
  - fulfillmentType: HOME_DELIVERY hoặc CLICK_AND_COLLECT
  - shippingAddress (bắt buộc với HOME_DELIVERY)
  - preferredStoreId (bắt buộc với CLICK_AND_COLLECT)
  - paymentMethod, promotionCode (tuỳ)
- Output: Order mới + assignedStore + pickupCode (nếu click&collect)
- Luồng chính (HOME_DELIVERY):
  1. Customer nhập địa chỉ và xác nhận tạo đơn.
  2. Backend build snapshot item:
     - sku, price, base/original/cost, image…
  3. Backend chọn chi nhánh:
     - Điều kiện: có store ACTIVE + có province.
     - `routingService.findBestStore()` dùng Haversine + tồn kho theo store.
  4. Nếu store “đủ hàng”:
     - `reserveInventory(storeId, items)` tăng reserved.
  5. Tạo Order:
     - `orderNumber` dạng `ORD-YYYYMMDD-######`
     - status = PENDING
     - paymentStatus tuỳ phương thức
     - assignedStore snapshot
     - Store.capacity.currentOrders +1
  6. Trả Order.
- Luồng chính (CLICK_AND_COLLECT):
  1. Customer chọn store nhận.
  2. Backend validate store supports clickAndCollect.
  3. ReserveInventory tại store đó.
  4. Sinh pickupCode dạng `PXXXXXX`.
  5. Tạo Order fulfillmentType CLICK_AND_COLLECT.
- Luồng phụ:
  - Thiếu địa chỉ (HOME_DELIVERY) → reject.
  - preferredStoreId sai → reject.
  - Reserve thất bại (available < qty) → reject hoặc chuyển sang “đơn chờ xử lý” theo policy.
  - Nếu routing chỉ tìm được store partial stock:
    - Có thể gán store nhưng không reserve (đơn cần điều phối).
- Trạng thái hệ thống:
  - `Order` tạo mới.
  - `StoreInventory.reserved` có thể tăng.
  - `Store.capacity.currentOrders` tăng.

### UC-07: Theo dõi đơn hàng

- Actor: Customer (self) / Staff (branch/global/task)
- Mô tả: xem chi tiết và timeline (stage) của đơn.
- Input: orderId
- Output: Order detail + statusHistory + stage.
- Luồng chính (customer):
  1. Mở `/orders/:id`.
  2. Backend kiểm tra order thuộc customer.
  3. Trả dữ liệu, UI render stage.
- Luồng phụ:
  - Không thuộc sở hữu → 403.
  - Đơn safe-cancel → stage CANCELLED + refundStatus hiển thị.

### UC-08: Quản lý sản phẩm (Product Management)

- Actor: Admin / Product Manager / Warehouse Manager (tuỳ phân quyền)
- Mô tả:
  - Tạo mới sản phẩm, cập nhật thông tin, quản lý variants/SKU, giá bán, trạng thái bán, cấu hình hậu mãi (warranty/IMEI policy).
- Input:
  - Product: name, model, brand, productType, description/specs, status (COMING_SOON/IN_STOCK/…)
  - Variant: sku, color/attributes, pricing, stock, images
  - AfterSalesConfig: warrantyProvider, trackingMode, identifierPolicy, warrantyMonths, warrantyTerms
- Output:
  - Product/Variant được tạo/cập nhật, đồng bộ pricing & availability.
- Luồng chính (tạo sản phẩm):
  1. Admin mở trang quản lý sản phẩm (warehouse/products hoặc admin).
  2. Nhập thông tin product + chọn brand/type.
  3. Tạo variants:
     - SKU unique
     - Giá và stock khởi tạo
  4. Cấu hình hậu mãi:
     - Nếu sản phẩm NEW → mặc định BRAND warranty (tuỳ config)
     - Nếu STORE warranty và tracking serialized → yêu cầu IMEI/Serial khi bán
  5. Lưu product, UI hiển thị trạng thái.
- Luồng chính (cập nhật giá/trạng thái):
  1. Chọn product/variant, cập nhật sellingPrice/costPrice/stock/status.
  2. Backend normalize pricing (fallback lịch sử) và cập nhật `priceUpdatedAt`.
  3. Nếu status != IN_STOCK → hệ thống chặn mua (online/POS).
- Luồng phụ/ngoại lệ:
  - SKU trùng → reject.
  - Xoá sản phẩm (`product.delete`) là thao tác nhạy cảm:
    - yêu cầu Step-up OTP trước khi thực hiện.
- Trạng thái hệ thống:
  - `UniversalProduct`, `UniversalVariant` thay đổi.
  - Các màn hình bán hàng dựa vào `canPurchaseForProductStatus(status)`.

### UC-09: Quản lý đơn hàng (OMS)

- Actor: Order Manager / Admin / Branch Admin / Warehouse / POS / Cashier / Shipper (tuỳ scope)
- Mô tả:
  - Xem danh sách đơn theo filter, gán chi nhánh, gán shipper/carrier, cập nhật status theo state machine, xử lý huỷ/hoàn.
- Input:
  - Filter: status, fulfillmentType, date range, search (orderNumber/receipt/customer…)
  - Actions:
    - assignedStoreId
    - shipperId / carrier info (tracking)
    - targetStatus + note + returnReason
- Output:
  - Order updated + history + notification.
- Luồng chính:
  1. Staff vào trang quản lý đơn.
  2. Chọn đơn → xem chi tiết và lịch sử.
  3. Thực hiện:
     - Gán chi nhánh xử lý (nếu đơn chưa gán hoặc cần chuyển)
     - Gán shipper/carrier
     - Update status hợp lệ (dropdown chỉ các trạng thái có thể chuyển)
  4. Backend validate:
     - quyền theo scope (branch/global/task)
     - transition theo state machine
     - guard PAID order cancel
  5. Backend side-effects:
     - reserve/release/deduct/restore inventory
     - activate/void warranty
     - release devices nếu cần
     - cập nhật capacity
  6. Push statusHistory, gửi notification.
- Luồng phụ:
  - SHIPPING mà chưa gán shipper/carrier (online) → reject.
  - Đổi chi nhánh sau khi đã reserve:
    - release store cũ, reserve store mới trong transaction.

### UC-10: Thanh toán

- Actor: Customer / Cashier
- Mô tả:
  - Xử lý thanh toán cho đơn online (VNPay/SePay/COD) và đơn in-store (cash tại quầy).
  - Với payment gateway, backend phải xử lý webhook/IPN **idempotent** (có thể gọi lặp).
- Input / Output (tóm tắt):
  - VNPay:
    - Input: `orderId`, `amount`, (tuỳ chọn) `orderDescription`, `bankCode`, `language`
    - Output: `paymentUrl` để redirect
    - Side-effect IPN: cập nhật `paymentStatus` và `order.status`
  - SePay:
    - Input: `orderId`
    - Output: `qrUrl` + `orderCode` (nội dung chuyển khoản) + `expiresAt`
    - Side-effect webhook: xác nhận tiền về và set `PAID` nếu đủ tiền
  - COD:
    - Input: chọn `paymentMethod=COD` khi tạo đơn
    - Output: order tạo với paymentStatus chưa PAID
  - POS cash:
    - Input: `paymentReceived`
    - Output: set `PAID`, tính `changeGiven`, lưu `posInfo.cashier*`

#### Luồng chính – Thanh toán VNPay (online)

1. Customer chọn “VNPay” ở checkout/chi tiết đơn.
2. Backend xác thực:
   - Order tồn tại và thuộc về user hiện tại (owner check).
   - amount > 0 và khớp totalAmount (tuỳ policy).
3. Backend tạo `paymentUrl` (ký HMAC) và lưu `paymentInfo.vnpayTxnRef`.
4. Customer thanh toán trên VNPay.
5. VNPay gọi IPN về backend:
   - Nếu success (`RspCode=00`):
     - `order.paymentStatus = PAID`
     - `order.status = PENDING` (đơn quay lại luồng xử lý đơn)
     - Sinh `onlineInvoice.invoiceNumber` dạng `ONLyyyyMM######` (tự động)
     - Dọn cart: xoá các item tương ứng đã đặt
   - Nếu fail:
     - `order.paymentStatus = FAILED`
     - `order.status = PAYMENT_FAILED`
     - Lưu `paymentFailureReason/paymentFailureAt`
6. Customer được redirect về return page để xem kết quả.

#### Luồng phụ – VNPay

- IPN gọi lặp nhiều lần:
  - Backend kiểm tra đã xử lý chưa (tránh push statusHistory trùng).
- Signature không hợp lệ:
  - IPN trả mã lỗi (không cập nhật order).

#### Luồng chính – Thanh toán chuyển khoản QR (SePay)

1. Customer chọn “Chuyển khoản QR”.
2. Backend kiểm tra cấu hình tài khoản nhận (bank account/bank id/account name).
3. Backend sinh `orderCode` dạng `DH#########` và `qrUrl` (kèm TTL).
4. Customer chuyển khoản đúng nội dung = `orderCode`.
5. SePay webhook gọi backend:
   - Xác thực token (Authorization).
   - Trích `orderCode` từ nội dung chuyển khoản.
   - Nếu amount >= requiredAmount:
     - `paymentStatus = PAID`, `status = PENDING`
     - Sinh `onlineInvoice.invoiceNumber`
     - Dọn cart item tương ứng
   - Nếu amount < requiredAmount:
     - Không set PAID; ghi trạng thái “thiếu tiền” trong paymentInfo để xử lý thủ công.

#### Luồng phụ – SePay

- Không tìm thấy orderCode trong nội dung → ignore (không cập nhật).
- Đơn đã PAID → trả duplicated=true (idempotent).

#### Luồng chính – COD (online)

1. Customer tạo order với `paymentMethod = COD`.
2. Order tạo với:
   - `paymentStatus = PENDING/UNPAID` (tuỳ chuẩn hoá)
   - `status = PENDING`
3. Khi giao thành công (DELIVERED/COMPLETED):
   - Trừ tồn (deductInventory) + kích hoạt bảo hành
   - (Tuỳ nghiệp vụ) cập nhật paymentStatus=PAID nếu coi như đã thu tiền.

#### Luồng chính – POS cash (tại quầy)

1. Cashier mở đơn POS pending.
2. Nhập `paymentReceived`:
   - Nếu đủ tiền:
     - `paymentStatus = PAID`
     - `status = PROCESSING` (chờ nhập IMEI/assign device nếu cần)
     - Lưu `posInfo.cashierId/cashierName/paymentReceived/changeGiven`
3. Finalize:
   - Sinh `paymentInfo.invoiceNumber` dạng `INVyyyyMM######`
   - `order.status = DELIVERED`
   - kích hoạt WarrantyRecord

#### Trạng thái hệ thống (thay đổi dữ liệu)

- `Order.paymentStatus` chuyển: PENDING/UNPAID → PAID hoặc FAILED.
- `Order.status` chuyển tương ứng: PENDING_PAYMENT/PAYMENT_FAILED hoặc quay lại PENDING.
- Online payment thành công → sinh `onlineInvoice`; POS finalize → sinh `paymentInfo.invoiceNumber` và (tuỳ) `vatInvoice`.
- Dọn giỏ hàng (cart items) sau khi thanh toán thành công (VNPay/SePay) để tránh đặt lại trùng.

### UC-11: Quản lý nhân viên (RBAC + permission)

- Actor: Manager/Admin
- Mô tả: tạo/cập nhật nhân viên, gán chi nhánh, role, permission direct grants, step-up cho action nhạy cảm.
- Input:
  - user info, branchAssignments, roles, permission grants
- Output:
  - user + effective permissions + audit log
- Luồng chính:
  1. Tạo user nhân viên.
  2. Gán branchAssignments:
     - storeId + roles[] + isPrimary.
  3. Gán role (Role model) hoặc template.
  4. Cấp permission trực tiếp (ALLOW/DENY) theo scopeRef.
  5. Kiểm tra effective permissions ở UI (context/permissions).
  6. Với thao tác nhạy cảm → step-up OTP.
- Luồng phụ:
  - Nhân viên không có chi nhánh → bị chặn truy cập branch-scope.

### UC-12: Bảo hành (Warranty)

- Actor:
  - Customer/Guest (tra cứu)
  - Staff (kích hoạt gián tiếp qua finalize/delivered; tra cứu quản trị; cập nhật trạng thái)
- Mô tả:
  - Kích hoạt bảo hành khi đơn hoàn tất, quản lý theo IMEI/Serial và SĐT, tra cứu công khai.
- Input/Output:
  - Kích hoạt:
    - Input gián tiếp: order items + deviceAssignments/IMEI/Serial
    - Output: WarrantyRecord(s)
  - Tra cứu:
    - Input: identifier hoặc phone
    - Output: warranty info + remaining days + status
- Luồng chính – kích hoạt:
  1. Order đạt trạng thái kết thúc (DELIVERED/PICKED_UP/COMPLETED hoặc POS finalize).
  2. System resolve afterSalesConfig theo productId.
  3. Validate identifier policy:
     - IMEI required / Serial required / IMEI or Serial / IMEI and Serial…
  4. Create WarrantyRecord:
     - unique imeiNormalized/serialNumberNormalized
     - lookupKeys để tra cứu
  5. Sync Device:
     - serviceState UNDER_WARRANTY hoặc phù hợp
     - currentWarrantyId trỏ về record.
- Luồng chính – tra cứu công khai:
  1. User nhập IMEI/Serial hoặc SĐT.
  2. Backend chuẩn hoá và query WarrantyRecord (skipBranchIsolation).
  3. Trả kết quả và tính remainingWarrantyDays.
- Luồng phụ:
  - Quantity > 1 với serialized nhưng thiếu assignments → lỗi `DEVICE_ASSIGNMENT_REQUIRED`.
  - IMEI/Serial trùng → lỗi conflict.

## Luồng nghiệp vụ (Business Flow) chi tiết theo actor

> Mỗi luồng dưới đây mô tả:
> - Step-by-step
> - Điều kiện rẽ nhánh
> - Trạng thái hệ thống thay đổi (OrderStatus/PaymentStatus/Inventory/Warranty…)

### Luồng Guest

- Steps:
  1. Browse home/products/category.
  2. Search & filter.
  3. View product detail → chọn variant.
  4. Rẽ nhánh:
     - Muốn mua → login/register.
  5. Warranty-check:
     - nhập IMEI/Serial/SĐT → xem bảo hành.
- System states:
  - Không đổi dữ liệu (trừ đăng ký).

### Luồng Customer (Online)

- Steps:
  1. Login.
  2. Add-to-cart (Cart.items tăng).
  3. Cart review:
     - update qty / remove items.
  4. Checkout:
     - chọn HOME_DELIVERY hoặc CLICK_AND_COLLECT
     - nhập địa chỉ hoặc chọn store nhận
     - chọn payment method
  5. Create order:
     - Order.status = PENDING
     - Order.paymentStatus = PENDING/UNPAID
     - Order.assignedStore được set (nếu routing thành công)
     - StoreInventory.reserved tăng (nếu canReserve)
     - Store.capacity.currentOrders +1
  6. Payment branch:
     - VNPay:
       - paymentInfo.vnpayTxnRef được lưu
       - IPN: paymentStatus PAID → order tiến luồng xử lý
       - IPN: FAILED → order.status = PAYMENT_FAILED
     - SePay:
       - paymentInfo.sepayOrderCode + qrUrl + expiresAt
       - webhook: PAID nếu đủ tiền
     - COD:
       - chờ giao và thu
  7. Track order:
     - stage hiển thị theo statusStage
  8. Completion:
     - khi DELIVERED/COMPLETED:
       - routingService.deductInventory
       - activateWarrantyForOrder → WarrantyRecord
       - store capacity giảm
- Rẽ nhánh quan trọng:
  - Cancel trước khi PAID: có thể CANCELLED (nếu policy cho customer).
  - Cancel sau khi PAID: phải CANCEL_REFUND_PENDING (safe-cancel).
  - Return/Delivery failed: restore/release inventory, void warranty nếu đã active.

### Luồng Warehouse Staff

- Pick order (online/POS):
  1. Chọn active branch.
  2. Xem danh sách order cần pick.
  3. Get pick list:
     - hệ thống đề xuất locationCode và quantity theo SKU.
  4. Pick từng location:
     - Warehouse Inventory.quantity giảm
     - StockMovement OUTBOUND (reference ORDER)
  5. Khi pick đủ:
     - Order.status chuyển PREPARING_SHIPMENT (tuỳ quyền)
     - pickerInfo.pickedAt set
     - gửi notification cho POS/Order manager nếu cấu hình
- Stock-in:
  - Inventory.quantity tăng, StockMovement INBOUND.
- Cycle count:
  - ADJUSTMENT movement + cập nhật Inventory.

### Luồng POS Staff

- Steps:
  1. Chọn active branch.
  2. Search/chọn productType, chọn variant.
  3. Thêm vào POS cart, chỉnh qty (UI chặn vượt stock).
  4. Check customer by phone:
     - nếu có → fill name
     - nếu không → quick register
  5. Apply promotion (tuỳ).
  6. Create POS order:
     - orderSource = IN_STORE
     - fulfillmentType = IN_STORE
     - status = PENDING_ORDER_MANAGEMENT
     - paymentStatus = UNPAID
     - assignedStore = active branch
     - notification cho order manager

### Luồng Cashier

- Steps:
  1. Chọn active branch.
  2. Xem danh sách POS orders pending.
  3. Process payment:
     - paymentReceived >= totalAmount
     - paymentStatus = PAID
     - status = PROCESSING
     - posInfo.cashier* set
  4. Finalize:
     - nhập/assign IMEI/Serial hoặc chọn DeviceIds
     - validate policy + format + uniqueness
     - sinh invoiceNumber `INVyyyyMM######`
     - status = DELIVERED, deliveredAt set
     - activateWarrantyForOrder
  5. Issue VAT:
     - tạo vatInvoice (invoiceNumber, companyName, taxCode…)

### Luồng Shipper

- Steps:
  1. Xem đơn được gán (task scope).
  2. Update status:
     - SHIPPING → OUT_FOR_DELIVERY → DELIVERED
     - hoặc DELIVERY_FAILED/RETURNED
  3. Khi DELIVERED:
     - deductInventory nếu chưa
     - activate warranty
     - capacity giảm

### Luồng Manager/Admin

- Steps:
  1. Xem dashboard theo branch hoặc global (global admin).
  2. Xử lý “đơn chưa gán chi nhánh”:
     - assign store thủ công hoặc re-route
  3. Xử lý “đơn thiếu shipper/tracking”:
     - assign shipper hoặc carrierAssignment
  4. Quản lý huỷ/hoàn:
     - PAID → safe-cancel
  5. Quản lý nhân viên:
     - gán branch/role/permission
     - step-up trước thao tác nhạy cảm

## Thiết kế dữ liệu (Database) – Bảng/Collection bắt buộc

### `User`

- Quan hệ:
  - 1 User (customer) có nhiều Order.
  - 1 User (staff) có thể:
    - tạo POS order (posInfo.staffId)
    - là cashier (posInfo.cashierId)
    - là shipper (shipperInfo.shipperId)
    - cập nhật statusHistory.updatedBy
- Trường quan trọng:
  - phoneNumber unique; password hash; status; addresses; branchAssignments; systemRoles; stepUpConfig.

### `Product` (`UniversalProduct` + `UniversalVariant`)

- Quan hệ:
  - ProductType/Brand phân loại.
  - Variant SKU unique.
  - OrderItem lưu snapshot sku/price để ổn định giá lịch sử.
- Trường quan trọng:
  - afterSalesConfig quyết định chính sách bảo hành/IMEI.
  - status: COMING_SOON/IN_STOCK/OUT_OF_STOCK/DISCONTINUED/PRE_ORDER.

### `Order`

- Quan hệ:
  - assignedStore.storeId → Store
  - items.productId/variantId → Product/Variant
  - WarrantyRecord tham chiếu orderId/orderItemId
- Trường quan trọng:
  - status + statusStage + history
  - paymentMethod/paymentStatus/paymentInfo
  - inventoryDeductedAt (tránh trừ tồn lặp)
  - refundStatus + snapshots (safe-cancel/rollback)

### `Inventory`

- Inventory theo chi nhánh (StoreInventory):
  - phục vụ bán online + routing
  - có reserved/available
- Inventory theo vị trí (warehouse Inventory):
  - phục vụ pick/stock-in/transfer/cycle count
  - có StockMovement log
- Device inventory:
  - quản lý IMEI/Serial theo store

### `Branch` (`Store`)

- Trường quan trọng:
  - coordinates phục vụ routing theo khoảng cách
  - services và shippingZones phục vụ fulfillment
  - capacity phục vụ kiểm soát tải

### `Warranty` (`WarrantyRecord`)

- Trường quan trọng:
  - unique imeiNormalized/serialNumberNormalized
  - lookupKeys + customerPhoneNormalized để tra cứu
  - expiresAt, warrantyMonths, warrantyTerms, status

## Logic trọng yếu (phân tích logic chi tiết)

### RBAC + Permission + Scope (thực thi)

- Permission keys dùng trong frontend route guard (ví dụ):
  - customer: `cart.manage.self`, `promotion.apply.self`, `order.view.self`
  - POS: `pos.order.create`, `pos.order.read.self`, `pos.order.read.branch`
  - cashier: `pos.payment.process`, `pos.order.finalize`, `pos.vat.issue`
  - warehouse: `warehouse.read/write`, `inventory.read/write`, `transfer.*`, `device.*`
  - admin: `users.manage.*`, `store.manage`, `promotion.manage`, `analytics.read.*`, `order.audit.read`
- Scope enforcement:
  - BRANCH: dựa vào activeBranchId (x-active-branch-id)
  - TASK: dựa vào field assignee (ví dụ order.shipperInfo.shipperId)
  - GLOBAL: chỉ global admin có
- Step-up:
  - Khi API thuộc nhóm nhạy cảm, cần OTP token:
    - ví dụ: product.delete, order.status.manage, warehouse.write, promotion.manage…

### Routing đơn hàng theo chi nhánh (chi tiết)

- Input tối thiểu để auto-route HOME_DELIVERY:
  - shippingAddress.province
  - items (productId + variantSku + quantity)
- Output:
  - selected store + alternatives
  - routingDecision (selectionType, reason, distanceKm, stockSummary…)
- Quy tắc:
  - ưu tiên chi nhánh “đủ toàn bộ items” và “gần” (distanceKm thấp)
  - nếu không đủ:
    - chọn chi nhánh tốt nhất theo score (có thể partial)
    - fallback về default branch/headquarters
- Kết hợp reserve:
  - canFulfill=true → reserveInventory trong transaction createOrder.

### Warranty (chi tiết)

- Chuẩn hoá:
  - IMEI → digits-only, validate 15
  - Serial → uppercase, validate pattern
  - Phone → digits-only
- Unique:
  - 1 IMEI/Serial không được xuất hiện ở 2 WarrantyRecord khác nhau.
- Kích hoạt:
  - Khi order completed:
    - tạo WarrantyRecord cho từng deviceAssignment (serialized)
    - hoặc 1 record quantity=N nếu không serialized.

### Payment (chi tiết)

- VNPay:
  - Create URL: ký HMAC, lưu txnRef vào paymentInfo.
  - IPN:
    - verify chữ ký
    - success:
      - paymentStatus=PAID, status=PENDING
      - issue onlineInvoice
      - clean cart
    - fail:
      - paymentStatus=FAILED, status=PAYMENT_FAILED
- SePay:
  - Create QR:
    - sinh orderCode `DH#########`, TTL
  - Webhook:
    - xác thực token
    - parse orderCode từ content
    - amount đủ → PAID

### Tồn kho (chi tiết)

- Reserve/Release/Deduct/Restore:
  - Reserve: reserved += qty
  - Release: reserved -= qty
  - Deduct: quantity -= qty, reserved -= qty
  - Restore: quantity += qty
- Đồng bộ kho vị trí:
  - Pick order giảm Inventory theo location, log StockMovement.
- Device:
  - Khi bán xong, device.inventoryState=SOLD; khi đổi/huỷ có thể release về IN_STOCK.

## UI Logic (mô tả giao diện)

### Public routes

- `/` home: banner + products + videos.
- `/products`, `/dien-thoai`, `/may-tinh-bang`, `/macbook`, `/tai-nghe`, `/apple-watch`, `/phu-kien`:
  - list + filter theo loại.
- `/tim-kiem`: search results.
- `/products/:productSlug`: product detail + variant selector.
- `/warranty-check`: warranty lookup.
- `/login`, `/register`: auth.
- `/payment/vnpay/return`: trang kết quả thanh toán VNPay.

### Customer routes (có `ProtectedRoute`)

- `/cart`: quản lý giỏ.
- `/cart/checkout`: checkout + payment selection.
- `/orders/:id`: order detail + timeline.
- `/profile`: profile + address management.

### Operations routes (staff)

- `/order-manager/orders`: quản lý đơn.
- `/pos/dashboard`, `/pos/orders`, `/pos-staff/handover/:orderId`: POS.
- `/cashier/dashboard`, `/cashier/vat-invoices`: thu ngân.
- `/shipper/dashboard`: giao hàng.

### Warehouse routes

- `/warehouse-staff`: dashboard kho.
- `/warehouse-staff/receive-goods`: nhập kho.
- `/warehouse-staff/pick-orders`: pick đơn.
- `/warehouse-staff/transfer`: chuyển kho.
- `/warehouse-staff/devices`: thiết bị.

### Admin routes

- `/admin`: analytics dashboard.
- `/admin/promotions`: khuyến mãi.
- `/admin/homepage-editor`, `/admin/short-videos`: nội dung.
- `/admin/brands`, `/admin/product-types`: danh mục.
- `/admin/stores`: chi nhánh.
- `/admin/inventory-dashboard`, `/admin/stock-in`: tồn kho/nhập hàng.
- `/admin/devices`: thiết bị.
- `/admin/audit-logs`: audit.
- `/admin/employees`: nhân sự.

## Ghi chú triển khai (để dùng như tài liệu nguồn)

- Hệ thống là đa chi nhánh → mọi nghiệp vụ staff cần mô tả kèm “đang ở chi nhánh nào” và điều kiện scope.
- Các status quan trọng (order/payment/warranty/device) nên được đưa vào báo cáo như:
  - “bộ trạng thái” + “quy tắc chuyển trạng thái” + “side-effects dữ liệu”.
- Các điểm production-like cần nhấn mạnh:
  - idempotency (IPN/webhook gọi lặp)
  - transaction (reserve/re-assign/deduct/restore trong session)
  - audit (statusHistory, permission audit, order audit)
  - fail closed branch isolation
