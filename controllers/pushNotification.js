import webPush from "../config/webPush.js";

import dotenv from "dotenv";
import UserNotification from "../models/userNotifications.js";

dotenv.config();

// User allows notifications and sends subscription info
export const allowNotifications = async (req, res) => {
  try {
    const { userId, subscription } = req.body;
    if (!userId)
      return res
        .status(400)
        .json({ success: false, message: "Missing userId" });

    let userNotif = await UserNotification.findOne({ userId });
    if (!userNotif) {
      userNotif = await UserNotification.create({
        userId,
        allowed: true,
        subscription,
      });
    } else {
      userNotif.allowed = true;
      if (subscription) userNotif.subscription = subscription;
      userNotif.updatedAt = new Date();
      await userNotif.save();
    }

    return res
      .status(200)
      .json({ success: true, message: "User added to notification list" });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Pull all allowed users
export const getNotificationUsers = async (req, res) => {
  try {
    const users = await UserNotification.find({ allowed: true });
    return res.status(200).json({ success: true, users });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Send push notifications to allowed users (with subscription)
export const sendPushNotificationToAllowedUsers = async (payload) => {
  try {
    const users = await UserNotification.find({
      allowed: true,
      subscription: { $ne: null },
    });

    users.forEach(async (user) => {
      try {
        await webPush.sendNotification(
          user.subscription,
          JSON.stringify({
            title: payload.title,
            message: payload.message,
            url: payload.url || "/",
          })
        );
      } catch (err) {
        console.error("Push send error for user:", user.userId, err);
      }
    });

    console.log(`📨 Sent push notifications to ${users.length} users`);
  } catch (err) {
    console.error("Error sending push notifications:", err);
  }
};
