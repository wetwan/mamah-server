import express from "express";

import { protectAll } from "../middlewares/authMiddle.js";
import {
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../controllers/notification.js";

const router = express.Router();

// Get all notifications for the logged-in user (marks them read)
router.get("/", protectAll, getUserNotifications);

// Mark a single notification as read
router.patch("/:id/read", protectAll, markNotificationAsRead);

// Mark all notifications as read
router.patch("/read-all", protectAll, markAllNotificationsAsRead);

export default router;
