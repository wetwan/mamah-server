import express from "express";

import { protectAll, protectUser } from "../middlewares/authMiddle.js";
import {
  chargeSavedCard,
  createPayment,
  createPaymentSheet,
} from "../controllers/stripController.js";
import { stripeWebhook } from "../controllers/stripeWebhook.js";

const stripeRouter = express.Router();

stripeRouter.post("/create-payment", createPayment);
stripeRouter.post("/payment-sheet", createPaymentSheet);
stripeRouter.post("/:id/order", createPayment);

stripeRouter.post("/charge-saved", protectAll, chargeSavedCard);

export default stripeRouter;
  