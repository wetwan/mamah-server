import express from "express";
import upload from "../middlewares/multer.js";
import {
  addProductColor,
  createProduct,
  getAllProducts,
  getSingleProduct,
  toggleColorAvailability,
  updateProductDiscount,
  updateProductPrice,
} from "../controllers/productController.js";
import {
  protectAdmin,
  protectAll,
  protectUser,
} from "../middlewares/authMiddle.js";

const productRoute = express.Router();

productRoute.post(
  "/create",
  upload.array("images", 4),
  protectAdmin,
  createProduct
);
productRoute.get("/all", protectAdmin || protectUser, getAllProducts);
productRoute.get("/:id", protectAdmin || protectUser, getSingleProduct);

// change color
productRoute.post("/:id/color", protectAdmin, addProductColor);
productRoute.patch(
  "/:id/color/:colorId/toggle",
  protectAdmin,
  toggleColorAvailability
);

// change pricing
productRoute.patch("/:id/discount", protectAdmin, updateProductDiscount);
productRoute.patch("/:id/price", protectAdmin, updateProductPrice);

export default productRoute;
