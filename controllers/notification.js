// your mongoose model

import { Notification } from "../models/notification.js";
import User from "../models/user.js";

export const getUserNotifications = async (req, res) => {
  try {
    const limit = 10;
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userCreatedAt = req.user.createdAt;

    const notifications = await Notification.find({
      $and: [
        { timestamp: { $gte: userCreatedAt } },
        {
          $or: [{ user: req.user._id }, { isGlobal: true }],
        },
      ],
    })
      .sort({ timestamp: -1 })
      .lean()
      .limit(limit);

    const unreadCount = await Notification.countDocuments({
      $and: [
        { timestamp: { $gte: userCreatedAt } },
        {
          $or: [{ user: req.user._id }, { isGlobal: true }],
        },
        { readBy: { $ne: req.user._id } },
      ],
    });

    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    if (!notification.isGlobal) {
      if (
        notification.user &&
        notification.user.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized",
        });
      }
    }

    if (!notification.readBy.includes(req.user._id)) {
      notification.readBy.push(req.user._id);
      await notification.save();
    }

    const unreadCount = await Notification.countDocuments({
      $and: [
        { timestamp: { $gte: user.createdAt } },
        {
          $or: [{ user: req.user._id }, { isGlobal: true }],
        },
        { readBy: { $ne: req.user._id } },
      ],
    });

    res.json({ success: true, notification, unreadCount });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const notifications = await Notification.find({
      $or: [{ user: req.user._id }, { isGlobal: true }],
      readBy: { $ne: req.user._id },
      timestamp: { $gte: user.createdAt }, // only notifications since they joined
    });

    await Promise.all(
      notifications.map(async (n) => {
        n.readBy.push(req.user._id);
        await n.save();
      })
    );

    const unreadCount = await Notification.countDocuments({
      $and: [
        { timestamp: { $gte: user.createdAt } },
        { $or: [{ user: req.user._id }, { isGlobal: true }] },
        { readBy: { $ne: req.user._id } },
      ],
    });

    res.json({
      success: true,
      message: "All notifications marked as read for this user",
      unreadCount,
    });
  } catch (err) {
    console.error("Error marking all notifications as read:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
