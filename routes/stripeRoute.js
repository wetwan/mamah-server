import express from "express";

import { protectAll } from "../middlewares/authMiddle.js";
import {
  chargeSavedCard,
  createPayment,
} from "../controllers/stripController.js";
import { stripeWebhook } from "../controllers/stripeWebhook.js";

const stripeRouter = express.Router();

stripeRouter.post("/create-payment", protectAll, createPayment);

stripeRouter.post("/charge-saved", protectAll, chargeSavedCard);

export default stripeRouter;
