import mongoose from "mongoose";

const userNotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  allowed: { type: Boolean, default: true }, 
  subscription: { type: Object, default: null }, 
  updatedAt: { type: Date, default: Date.now },
});

const UserNotification = mongoose.model(
  "UserNotification",
  userNotificationSchema
);

export default UserNotification;
