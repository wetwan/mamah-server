// your mongoose model

import { Notification } from "../models/notification.js";

export const getUserNotifications = async (req, res) => {
  try {
    const limit = 50;
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Fetch notifications for this user and global notifications
    const notifications = await Notification.find({
      $or: [
        { user: req.user._id }, // personal notifications
        { isGlobal: true }, // broadcast/global notifications
      ],
    })
      .sort({ timestamp: -1 }) // latest first
      .lean()
      .limit(limit);

    res.json({ success: true, notifications });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
