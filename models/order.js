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
        price: {
          type: Number,
          required: true,
        },
        color: {
          type: String,
        },
        size: {
          type: String,
        },
      },
    ],

    shippingAddress: {
      fullName: { type: String, required: true },
      address1: { type: String, required: true },
      address2: { type: String, required: true },
      state: { type: String,  },
      postalCode: { type: String,  },
      country: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true, unique: true },
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

    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
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

const Order = mongoose.model("Order", orderSchema);

export default Order;
