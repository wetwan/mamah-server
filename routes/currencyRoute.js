import express from "express";
import { getPrice } from "../controllers/currency.js";

const currencyRouter = express.Router();

currencyRouter.get("/:price", getPrice);

export default currencyRouter;
