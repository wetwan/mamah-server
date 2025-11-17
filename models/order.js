import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        color: {
          type: String,
        },
        size: {
          type: String,
        },
        price: { type: Number, required: true },
      },
    ],

    shippingAddress: {
      fullName: { type: String, required: true },
      address1: { type: String, required: true },
      address2: { type: String },
      state: { type: String },
      postalCode: { type: String },
      country: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true }, // ✅ remove `unique: true` if it's there
    },

    paymentMethod: {
      type: String,
      enum: ["card", "paypal", "bank", "cash_on_delivery"],
      default: "cash_on_delivery",
    },

    paymentResult: {
      id: { type: String },
      status: { type: String },
      update_time: { type: String },
      email_address: { type: String },
    },

    itemsPrice: { type: Number, required: true }, // subtotal
    shippingPrice: { type: Number, default: 0 },
    taxPrice: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true },
    currency: {
      code: {
        type: String,
        default: "NGN",
        required: true,
      },
      symbol: {
        type: String,
        default: "₦",
        required: true,
      },
      exchangeRate: {
        type: Number,
        default: 1,
        required: true,
      },
      country: {
        type: String,
        default: "NG",
      },
      // Converted prices in user's currency
      convertedItemsPrice: {
        type: Number,
        default: 0,
      },
      convertedShippingPrice: {
        type: Number,
        default: 0,
      },
      convertedTaxPrice: {
        type: Number,
        default: 0,
      },
      convertedTotalPrice: {
        type: Number,
        default: 0,
      },
    },

    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },

    paymentIntentId: {
      type: String,
    },

    isPaid: {
      type: Boolean,
      default: false,
    },

    paidAt: {
      type: Date,
    },

    isDelivered: {
      type: Boolean,
      default: false,
    },

    deliveredAt: {
      type: Date,
    },

    // Optional: track who created it (admin or user)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "creatorModel",
    },
    creatorModel: {
      type: String,
      enum: ["User", "Admin"],
    },
  },
  { timestamps: true }
);

// ✅ Automatically calculate totalPrice before saving
orderSchema.pre("save", function (next) {
  if (this.items && this.items.length > 0) {
    this.itemsPrice = this.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    this.totalPrice =
      this.itemsPrice + (this.shippingPrice || 0) + (this.taxPrice || 0);
  }
  next();
});

orderSchema.virtual("formattedTotal").get(function () {
  const total = this.currency?.convertedTotalPrice || this.totalPrice;
  const symbol = this.currency?.symbol || "₦";

  return `${symbol}${total.toFixed(2)}`;
});

orderSchema.methods.getDisplayPrices = function () {
  const useConverted = this.currency?.code !== "NGN";

  return {
    currency: this.currency?.code || "NGN",
    symbol: this.currency?.symbol || "₦",
    items: useConverted ? this.currency.convertedItemsPrice : this.itemsPrice,
    shipping: useConverted
      ? this.currency.convertedShippingPrice
      : this.shippingPrice,
    tax: useConverted ? this.currency.convertedTaxPrice : this.taxPrice,
    total: useConverted ? this.currency.convertedTotalPrice : this.totalPrice,
    exchangeRate: this.currency?.exchangeRate || 1,
    originalTotal: this.totalPrice,
  };
};

orderSchema.methods.formatPrice = function (amount) {
  const symbol = this.currency?.symbol || "₦";
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${symbol}${formatted}`;
};

const Order = mongoose.model("Order", orderSchema);

export default Order;
