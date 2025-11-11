import express from "express";
import {
  protectAdmin,
  protectAll,
  protectUser,
} from "../middlewares/authMiddle.js";
import {
  createOrder,
  getAllOrders,
  getSingleOrder,
  getUserOrders,
  updateOrderStatus,
  updateOrderToPaid,
} from "../controllers/orderController.js";

const orderRouter = express.Router();

orderRouter.post("/create", protectAll, createOrder);
orderRouter.get("/my-orders", protectUser, getUserOrders);
orderRouter.get("/all", protectAdmin, getAllOrders);
orderRouter.get("/:id", getSingleOrder);
orderRouter.put("/:orderId/status", protectAdmin, updateOrderStatus);
orderRouter.post("/:id/pay", protectUser, updateOrderToPaid);

export default orderRouter;
