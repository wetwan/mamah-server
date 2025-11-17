import express from "express";
import {
  getExchangeRate,
  getPrice,
  getPrices,
} from "../controllers/currency.js";

const currencyRouter = express.Router();

currencyRouter.get("/:price", getPrice);
currencyRouter.post("/get-prices", getPrices);
currencyRouter.get("/exchange-rate", getExchangeRate);

export default currencyRouter;
