// pushNotifications.js
import webPush from "../config/webPush.js"; // <-- FIX 3: Import centralized config
import { redis } from "../config/redis.js";
import { wss, onlineClients } from "../server.js";
import { Notification } from "../models/notification.js";
import UserSubscription from "../models/userNotifications.js"; // model for push subscriptions

import dotenv from "dotenv";

dotenv.config();

// --- FIX 3: Removed redundant VAPID setup ---
// webPush.setVapidDetails(...) is no longer here

/**
 * Send a notification to a single user
 * @param {string} userId
 * @param {object} payload {title, message, url, type, forcePush}
 */
export const sendUserNotification = async (userId, payload) => {
  // 1. Save notification to DB (always)
  const notification = await Notification.create({
    type: payload.type || "INFO",
    title: payload.title,
    message: payload.message,
    relatedId: payload.relatedId || null,
    userIds: [userId],
    isGlobal: false,
    createdAt: new Date(),
    timestamp: new Date(),
    isRead: false,
    updatedAt: new Date(),
  });

  // 2. Send via WebSocket if online
  const wsConnections = onlineClients.get(userId.toString()) || [];
  let sentViaWs = false;

  wsConnections.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "NEW_NOTIFICATION", // Use a specific type
          notification: notification, // Send the full notification object
        })
      );
      sentViaWs = true;
    }
  });

  // --- FIX 6: Only send push if not sent via WebSocket, or if forced ---
  if (!sentViaWs || payload.forcePush) {
    console.log(`User ${userId} is offline or tab is hidden. Sending push.`);

    // 3. Send push notification
    const subscriptions = await UserSubscription.find({ userId });
    subscriptions.forEach((sub) => {
      webPush
        .sendNotification(
          sub.subscription,
          JSON.stringify({
            title: payload.title,
            message: payload.message,
            url: payload.url || "/",
          })
        )
        .catch((err) => console.error("Push send error:", err));
    });
  } else {
    console.log(`User ${userId} received notification via WebSocket.`);
  }
};