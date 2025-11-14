// notify.js
import { isUserOnline } from "./presence";
import { sendMessageToUser } from "./websocketHelpers";
import { Notification } from "../models/notification.js"; // <-- FIX 7: Import model

/**
 * Persists a notification to the database for an offline user.
 */
const saveOfflineNotification = async (userId, text) => {
  try {
    console.log(`User ${userId} is offline, storing notification in DB`);
    await Notification.create({
      type: "MESSAGE", // Or a more specific type if available
      title: "New Message", // A sensible default title
      message: text,
      userIds: [userId],
      isGlobal: false,
      isRead: false,
      createdAt: new Date(),
      timestamp: new Date(),
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("Error saving offline notification:", error);
  }
};

export const notifyUser = async (userId, text) => {
  const online = await isUserOnline(userId); // Checks Redis

  if (online) {
    // User has a presence key, try to send via WebSocket
    const sent = await sendMessageToUser(userId, {
      type: "MESSAGE",
      content: text,
      timestamp: new Date().toISOString(),
    });

    if (!sent) {
      // --- FIX 7: Save to DB if WS send fails (stale presence) ---
      console.log(
        "User has a Redis entry but no active WebSocket. Storing in DB."
      );
      await saveOfflineNotification(userId, text);
    }
  } else {
    // --- FIX 7: Save to DB if user is fully offline ---
    await saveOfflineNotification(userId, text);
  }
};