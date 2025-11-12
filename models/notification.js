import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  title: String,
  message: String,
  relatedId: String, // orderId or productId
  userIds: [String], // who should see this notification
  createdAt: { type: Date, default: Date.now },
  isGlobal: { type: Boolean, default: false }, // true = all users see
});

export const Notification = mongoose.model("Notification", notificationSchema);
