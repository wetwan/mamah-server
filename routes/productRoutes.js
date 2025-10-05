import express from "express";
import upload from "../middlewares/multer.js";
import { createProduct } from "../controllers/productController.js";

const productRoute = express.Router();


productRoute.post("/create", upload.array("images", 4), createProduct);


export default productRoute;
