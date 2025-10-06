import express from "express";
import { protectAdmin, protectAll, protectUser } from "../middlewares/authMiddle.js";
import {
  createOrder,
  getAllOrders,
  getUserOrders,
  updateOrderStatus,
} from "../controllers/orderController.js";

const orderRouter = express.Router();

orderRouter.post("/create", protectAll, createOrder);
orderRouter.get("/my-orders", protectUser, getUserOrders);
orderRouter.get("/all", protectAdmin, getAllOrders);
orderRouter.put("/:orderId/status", protectAdmin, updateOrderStatus);

export default orderRouter;
