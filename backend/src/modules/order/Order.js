import mongoose from "mongoose";

export const ORDER_STATUSES = [
  "PENDING",
  "PENDING_ORDER_MANAGEMENT", // ✅ POS Created, waiting for assignment
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PAYMENT_VERIFIED",
  "PAYMENT_FAILED",
  "CONFIRMED",
  "PROCESSING",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PREPARING_SHIPMENT",
  "SHIPPING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "PICKED_UP",
  "COMPLETED",
  "DELIVERY_FAILED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
  // ✅ SAFE-CANCEL: Dùng cho đơn đã thanh toán online – bắt buộc hoàn tiền
  "CANCEL_REFUND_PENDING",       // Hủy đơn – Cần hoàn tiền
  "INCIDENT_REFUND_PROCESSING",  // Sự cố đơn hàng – Đang xử lý hoàn tiền
];

export const ORDER_STATUS_STAGES = [
  "PENDING",
  "PENDING_ORDER_MANAGEMENT",
  "PENDING_PAYMENT",
  "PAYMENT_FAILED",
  "CONFIRMED",
  "PICKING",
  "PICKUP_COMPLETED",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
];

export const STATUS_TO_STAGE = Object.freeze({
  PENDING: "PENDING",
  PENDING_ORDER_MANAGEMENT: "PENDING_ORDER_MANAGEMENT",
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PAYMENT_CONFIRMED: "PENDING",
  PAYMENT_VERIFIED: "PENDING",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  CONFIRMED: "CONFIRMED",
  PROCESSING: "PICKING",
  PREPARING: "PICKING",
  READY_FOR_PICKUP: "PICKUP_COMPLETED",
  PREPARING_SHIPMENT: "PICKUP_COMPLETED",
  SHIPPING: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  PICKED_UP: "DELIVERED",
  COMPLETED: "DELIVERED",
  DELIVERY_FAILED: "CANCELLED",
  CANCELLED: "CANCELLED",
  RETURN_REQUESTED: "RETURNED",
  RETURNED: "RETURNED",
  // Safe-cancel statuses map to CANCELLED stage (visible to customer as cancelled)
  CANCEL_REFUND_PENDING: "CANCELLED",
  INCIDENT_REFUND_PROCESSING: "CANCELLED",
});

export const mapStatusToStage = (status) => {
  return STATUS_TO_STAGE[status] || "PENDING";
};

const PAYMENT_STATUSES = ["PENDING", "UNPAID", "PAID", "FAILED", "REFUNDED"];
const PAYMENT_METHODS = [
  "COD",
  "BANK_TRANSFER",
  "MOMO",
  "VNPAY",
  "CREDIT_CARD",
  "CASH",
  "INSTALLMENT",
];

const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UniversalProduct",
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UniversalVariant",
    },
    productType: {
      type: String,
      trim: true,
    },
    variantSku: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    productName: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    images: [{ type: String, trim: true }],
    variantColor: { type: String, trim: true },
    variantStorage: { type: String, trim: true },
    variantConnectivity: { type: String, trim: true },
    variantName: { type: String, trim: true },
    variantCpuGpu: { type: String, trim: true },
    variantRam: { type: String, trim: true },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    originalPrice: {
      type: Number,
      min: 0,
    },
    basePrice: {
      type: Number,
      min: 0,
    },
    costPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    subtotal: {
      type: Number,
      min: 0,
    },
    total: {
      type: Number,
      min: 0,
    },
    // ✅ ADDED: IMEI for POS orders
    imei: {
      type: String,
      trim: true,
    },
    serialNumber: {
      type: String,
      trim: true,
    },
    deviceAssignments: [
      {
        deviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Device",
        },
        imei: {
          type: String,
          trim: true,
        },
        serialNumber: {
          type: String,
          trim: true,
        },
        assignedAt: {
          type: Date,
          default: Date.now,
        },
        assignedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        mode: {
          type: String,
          enum: ["MANUAL", "AUTO"],
          default: "AUTO",
        },
      },
    ],
  },
  { _id: true }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ORDER_STATUSES,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    note: String,
  },
  { _id: false }
);

const statusStageHistorySchema = new mongoose.Schema(
  {
    stage: {
      type: String,
      enum: ORDER_STATUS_STAGES,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    note: String,
  },
  { _id: false }
);

const carrierWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      trim: true,
    },
    eventType: {
      type: String,
      trim: true,
      required: true,
    },
    rawStatus: {
      type: String,
      trim: true,
    },
    mappedStatus: {
      type: String,
      enum: ORDER_STATUSES,
    },
    mappedStage: {
      type: String,
      enum: ORDER_STATUS_STAGES,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    payloadHash: {
      type: String,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const deliveryProofSchema = new mongoose.Schema(
  {
    proofType: {
      type: String,
      trim: true,
      default: "PHOTO",
    },
    deliveredAt: Date,
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    signedBy: {
      type: String,
      trim: true,
    },
    signatureImageUrl: {
      type: String,
      trim: true,
    },
    photos: [
      {
        type: String,
        trim: true,
      },
    ],
    geo: {
      lat: Number,
      lng: Number,
    },
    note: {
      type: String,
      trim: true,
    },
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    orderSource: {
      type: String,
      enum: ["ONLINE", "IN_STORE"],
      default: "ONLINE",
    },

    fulfillmentType: {
      type: String,
      enum: ["HOME_DELIVERY", "CLICK_AND_COLLECT", "IN_STORE"],
      default: "HOME_DELIVERY",
    },

    items: [orderItemSchema],

    shippingAddress: {
      fullName: { type: String, trim: true },
      phoneNumber: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      province: { type: String, trim: true },
      district: { type: String, trim: true },
      ward: { type: String, trim: true },
      detailAddress: { type: String, trim: true },
    },

    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "COD",
    },

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "PENDING",
    },

    paymentFailureReason: {
      type: String,
      trim: true,
    },

    paymentFailureAt: Date,

    paidAt: Date,

    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "PENDING",
    },

    statusStage: {
      type: String,
      enum: ORDER_STATUS_STAGES,
      default: "PENDING",
    },

    subtotal: {
      type: Number,
      min: 0,
      default: 0,
    },

    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
    },

    promotionDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },

    total: {
      type: Number,
      min: 0,
      default: 0,
    },

    totalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    assignedStore: {
      storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
      storeName: String,
      storeCode: String,
      storeAddress: String,
      storePhone: String,
      assignedAt: Date,
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    pickupInfo: {
      expectedPickupDate: Date,
      pickupCode: String,
      pickedUpAt: Date,
      pickedUpBy: {
        name: String,
        idCard: String,
        phone: String,
      },
    },

    shipperInfo: {
      shipperId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      shipperName: String,
      shipperPhone: String,
      assignedAt: Date,
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      pickupAt: Date,
      deliveredAt: Date,
      deliveryNote: String,
    },

    shippedByInfo: {
      shippedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      shippedByName: String,
      shippedAt: Date,
      shippedNote: String,
      items: [
        {
          sku: String,
          quantity: Number,
          locationCode: String,
        },
      ],
    },

    pickerInfo: {
      pickerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      pickerName: String,
      assignedAt: Date,
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      pickedAt: Date,
      note: String,
    },

    createdByInfo: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      userName: String,
      userRole: String
    },

    exchangeHistory: [
      {
        requestedAt: {
          type: Date,
          default: Date.now,
        },
        requestedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        requestedByName: String,
        reason: String,
        previousStatus: String,
        nextStatus: String,
        restoredItems: [
          {
            sku: String,
            locationCode: String,
            quantity: Number,
          },
        ],
      },
    ],

    carrierAssignment: {
      carrierCode: {
        type: String,
        trim: true,
      },
      carrierName: {
        type: String,
        trim: true,
      },
      trackingNumber: {
        type: String,
        trim: true,
      },
      externalOrderRef: {
        type: String,
        trim: true,
      },
      assignedAt: Date,
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      transferredAt: Date,
      note: {
        type: String,
        trim: true,
      },
      lastWebhookAt: Date,
    },

    installmentInfo: {
      provider: String,
      months: Number,
      monthlyPayment: Number,
      interestRate: Number,
      totalPayment: Number,
      applicationId: String,
      approvedAt: Date,
      status: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED"],
      },
    },

    tradeInInfo: {
      oldProductName: String,
      oldProductSku: String,
      oldProductCondition: String,
      estimatedValue: Number,
      finalValue: Number,
      evaluatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      evaluatedAt: Date,
      images: [String],
    },

    pointsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },

    appliedPromotion: {
      code: String,
      discountAmount: { type: Number, default: 0 },
    },

    paymentInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    posInfo: {
      staffId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      staffName: String,
      cashierId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      cashierName: String,
      storeLocation: String,
      receiptNumber: String,
      paymentReceived: Number,
      changeGiven: Number,
    },

    vatInvoice: {
      invoiceNumber: String,
      companyName: String,
      taxCode: String,
      companyAddress: String,
      issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      issuedAt: Date,
    },

    onlineInvoice: {
      invoiceNumber: String,
      issuedAt: Date,
      note: String,
    },

    statusHistory: [statusHistorySchema],
    statusStageHistory: [statusStageHistorySchema],
    carrierWebhookEvents: [carrierWebhookEventSchema],
    deliveryProof: deliveryProofSchema,

    confirmedAt: Date,
    shippedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,

    inventoryDeductedAt: Date,

    notes: String,
    note: String,
    returnReason: {
      type: {
        type: String,
        enum: ["CUSTOMER_REJECTED", "PRODUCT_DEFECT", "OTHER"],
      },
      label: {
        type: String,
        trim: true,
      },
      detail: {
        type: String,
        trim: true,
      },
    },
    cancelReason: String,

    trackingNumber: String,
    shippingProvider: String,

    // ✅ SAFE-CANCEL: Fields for paid-order protection
    refundStatus: {
      type: String,
      enum: ["NOT_REQUIRED", "PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "NOT_REQUIRED",
    },

    // Thời điểm hết hạn rollback (2 giờ sau khi admin thay đổi trạng thái)
    revertableUntil: {
      type: Date,
      default: null,
    },

    // Snapshot trạng thái trước khi admin thay đổi (dùng cho rollback)
    snapshots: [
      {
        status: { type: String },
        paymentStatus: { type: String },
        snapshotAt: { type: Date, default: Date.now },
        snapshotBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: { type: String },
      },
    ],

    // Flag: đơn bị admin can thiệp thủ công (dùng cho audit)
    cancelledByAdmin: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ statusStage: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ orderSource: 1 });
orderSchema.index({ fulfillmentType: 1 });
orderSchema.index({ "assignedStore.storeId": 1 });
orderSchema.index({ "shipperInfo.shipperId": 1 });
orderSchema.index({ "carrierAssignment.trackingNumber": 1 });
orderSchema.index({ "carrierWebhookEvents.eventId": 1 });

orderSchema.pre("validate", function normalizeCustomerAndSource(next) {
  if (!this.customerId && this.userId) {
    this.customerId = this.userId;
  }

  if (!this.userId && this.customerId) {
    this.userId = this.customerId;
  }

  if (!this.orderSource) {
    this.orderSource = this.fulfillmentType === "IN_STORE" ? "IN_STORE" : "ONLINE";
  }

  if (!this.fulfillmentType) {
    this.fulfillmentType = this.orderSource === "IN_STORE" ? "IN_STORE" : "HOME_DELIVERY";
  }

  if (this.orderSource === "IN_STORE" && !this.assignedStore?.storeId) {
    this.invalidate(
      "assignedStore.storeId",
      "IN_STORE orders must include assignedStore.storeId",
    );
  }

  next();
});

orderSchema.pre("save", function normalizeTotals(next) {
  const items = Array.isArray(this.items) ? this.items : [];

  if (!this.carrierAssignment) {
    this.carrierAssignment = {};
  }

  if (!this.carrierAssignment.trackingNumber && this.trackingNumber) {
    this.carrierAssignment.trackingNumber = this.trackingNumber;
  }
  if (!this.trackingNumber && this.carrierAssignment.trackingNumber) {
    this.trackingNumber = this.carrierAssignment.trackingNumber;
  }

  if (!this.carrierAssignment.carrierName && this.shippingProvider) {
    this.carrierAssignment.carrierName = this.shippingProvider;
  }
  if (!this.shippingProvider && this.carrierAssignment.carrierName) {
    this.shippingProvider = this.carrierAssignment.carrierName;
  }

  for (const item of items) {
    if (!item.name && item.productName) {
      item.name = item.productName;
    }

    if (!item.productName && item.name) {
      item.productName = item.name;
    }

    if (!item.subtotal || this.isModified("items")) {
      item.subtotal = toSafeNumber(item.price) * toSafeNumber(item.quantity, 1);
    }

    if (!item.total || this.isModified("items")) {
      item.total = item.subtotal;
    }
  }

  const subtotal = items.reduce((sum, item) => {
    return sum + toSafeNumber(item.price) * toSafeNumber(item.quantity, 1);
  }, 0);

  this.subtotal = subtotal;

  const shippingFee = toSafeNumber(this.shippingFee);
  const discount = toSafeNumber(this.discount) + toSafeNumber(this.promotionDiscount);
  const computedTotal = Math.max(0, subtotal + shippingFee - discount);

  this.total = computedTotal;
  this.totalAmount = computedTotal;

  if (this.paymentStatus === "PAID" && !this.paidAt) {
    this.paidAt = new Date();
  }

  if (this.paymentStatus === "FAILED") {
    if (!this.paymentFailureAt) {
      this.paymentFailureAt = new Date();
    }

    if (!this.paymentFailureReason) {
      const paymentInfo = this.paymentInfo || {};
      const failCode = paymentInfo.vnpayFailReason || paymentInfo.vnpayResponseCode;
      if (failCode) {
        this.paymentFailureReason = String(failCode);
      }
    }

    if (this.status === "PENDING_PAYMENT") {
      this.status = "PAYMENT_FAILED";
    }
  }

  const computedStage = mapStatusToStage(this.status);
  if (!this.statusStage || this.isModified("status")) {
    this.statusStage = computedStage;
  }

  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    this.statusHistory = [
      {
        status: this.status,
        updatedBy: this.customerId || this.userId,
        updatedAt: new Date(),
        note: "Order created",
      },
    ];
  }

  if (!Array.isArray(this.statusStageHistory)) {
    this.statusStageHistory = [];
  }

  const latestStatusEntry = Array.isArray(this.statusHistory)
    ? this.statusHistory[this.statusHistory.length - 1]
    : null;
  const latestStageEntry = this.statusStageHistory[this.statusStageHistory.length - 1];
  const stageChanged = latestStageEntry?.stage !== this.statusStage;

  if (this.statusStage && (this.statusStageHistory.length === 0 || stageChanged)) {
    this.statusStageHistory.push({
      stage: this.statusStage,
      updatedBy: latestStatusEntry?.updatedBy || this.customerId || this.userId,
      updatedAt: latestStatusEntry?.updatedAt || new Date(),
      note: latestStatusEntry?.note || "Status stage synchronized",
    });
  }

  next();
});

orderSchema.methods.getCustomerId = function getCustomerId() {
  return this.customerId || this.userId;
};

orderSchema.methods.appendStatusHistory = function appendStatusHistory(
  status,
  updatedBy,
  note = ""
) {
  if (!Array.isArray(this.statusHistory)) {
    this.statusHistory = [];
  }

  this.statusHistory.push({
    status,
    updatedBy: updatedBy || this.getCustomerId(),
    updatedAt: new Date(),
    note,
  });
};

orderSchema.methods.cancel = async function cancelOrder(updatedBy, reason = "") {
  this.status = "CANCELLED";
  this.cancelledAt = new Date();
  this.cancelReason = reason || this.cancelReason || "Cancelled by user";

  this.appendStatusHistory(
    "CANCELLED",
    updatedBy || this.getCustomerId(),
    this.cancelReason
  );

  return this.save();
};

orderSchema.methods.issueOnlineInvoice = async function issueOnlineInvoice() {
  if (this.onlineInvoice?.invoiceNumber) {
    return this.onlineInvoice;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const lastInvoice = await this.constructor
    .findOne({
      "onlineInvoice.invoiceNumber": new RegExp(`^ONL${year}${month}`),
    })
    .sort({ "onlineInvoice.invoiceNumber": -1 });

  let seq = 1;
  if (lastInvoice?.onlineInvoice?.invoiceNumber) {
    const lastSeq = parseInt(lastInvoice.onlineInvoice.invoiceNumber.slice(-6), 10);
    if (!Number.isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  this.onlineInvoice = {
    invoiceNumber: `ONL${year}${month}${String(seq).padStart(6, "0")}`,
    issuedAt: new Date(),
    note: "Auto-generated for online order",
  };

  await this.save();
  return this.onlineInvoice;
};

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
