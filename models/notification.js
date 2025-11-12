import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  title: String,
  message: String,
  relatedId: String, // productId, orderId, etc.
  userIds: [String], // specific users; empty = global
  createdAt: { type: Date, default: Date.now },
  isGlobal: { type: Boolean, default: true }, // true = all users see
});

export const Notification = mongoose.model("Notification", notificationSchema);
