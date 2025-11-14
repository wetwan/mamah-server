import express from "express";
import {
  allowNotifications,
  getNotificationUsers,
} from "../controllers/pushNotification.js";

const pushNotificatonRouter = express.Router();

// User allows notifications
pushNotificatonRouter.post("/allow", allowNotifications);

// Get all users allowed notifications
pushNotificatonRouter.get("/allowed-users", getNotificationUsers);

export default pushNotificatonRouter;
