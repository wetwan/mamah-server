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

    const unreadCount = await Notification.countDocuments({
      $or: [{ user: req.user._id }, { isGlobal: true }],
      isRead: false,
    });

    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification)
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });

    // Optional: only allow marking if it belongs to the user or is global
    if (
      notification.user &&
      notification.user.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    notification.isRead = true;
    await notification.save();

    const unreadCount = await Notification.countDocuments({
      $or: [{ user: req.user._id }, { isGlobal: true }],
      isRead: false,
    });

    res.json({ success: true, notification , unreadCount});
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const markAllNotificationsAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { $or: [{ user: req.user._id }, { isGlobal: true }], isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
