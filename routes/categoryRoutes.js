import express from "express";
import upload from "../middlewares/multer.js"; // your multer setup
import {
  createCategory,
  getAllCategories,
} from "../controllers/categoryController.js";

const CategoryRouter = express.Router();

CategoryRouter.post("/create", upload.single("image"), createCategory);

CategoryRouter.get("/", getAllCategories);

export default CategoryRouter;
