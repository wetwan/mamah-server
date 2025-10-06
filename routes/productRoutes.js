import express from "express";
import upload from "../middlewares/multer.js";
import { createProduct, getAllProducts, getSingleProduct } from "../controllers/productController.js";

const productRoute = express.Router();


productRoute.post("/create", upload.array("images", 4), createProduct);
productRoute.get("/all",  getAllProducts);
productRoute.get("/:id",  getSingleProduct);


export default productRoute;
