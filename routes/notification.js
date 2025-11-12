import express from "express";

import { protectAll } from "../middlewares/authMiddle.js";
import {
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../controllers/notification.js";

const noficationRouter = express.Router();

// Get all notifications for the logged-in user (marks them read)
noficationRouter.get("/", protectAll, getUserNotifications);

// Mark a single notification as read
noficationRouter.patch("/:id/read", protectAll, markNotificationAsRead);

// Mark all notifications as read
noficationRouter.patch("/read-all", protectAll, markAllNotificationsAsRead);

export default noficationRouter;
