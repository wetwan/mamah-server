import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "ORDER_STATUS_UPDATE",
      "ORDER_CANCELLED",
      "INVENTORY_ALERT",
      "NEW_PRODUCT_CREATED",
      "NEW_ORDER",
      "USER_LOGIN",
      "NEW_PRODUCT_UPDATED",
      "NEW_USER_CREATED",
      "NEW_ORDER_PAYMENT",
      "ORDER_STATUS_UPDATE",
      
    ],
    required: true,
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: false,
  },
  title: String,
  message: String,
  relatedId: String, // orderId / productId etc
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isGlobal: { type: Boolean, default: false },
});

export const Notification = mongoose.model("Notification", notificationSchema);
