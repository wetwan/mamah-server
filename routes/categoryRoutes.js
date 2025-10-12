import express from "express";
import upload from "../middlewares/multer.js"; // your multer setup
import {
  createCategory,
  getAllCategories,
  getSinglecategory,
} from "../controllers/categoryController.js";
import { protectAdmin, protectAll } from "../middlewares/authMiddle.js";

const CategoryRouter = express.Router();

CategoryRouter.post(
  "/create",
  upload.single("image"),
  protectAdmin,
  createCategory
);

CategoryRouter.get("/",  getAllCategories);
CategoryRouter.get("/:id", getSinglecategory);

export default CategoryRouter;
