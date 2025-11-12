import express from "express";
import upload from "../middlewares/multer.js";
import {
  addProductColor,
  addProductReview,
  createProduct,
  deleteReview,
  getAllProducts,
  getProductReviews,
  getSingleProduct,
  toggleColorAvailability,
  toggleSizeAvailability,
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
productRoute.get("/all", getAllProducts);
productRoute.get("/:id",  getSingleProduct);

// change color
productRoute.post("/:id/color", protectAdmin, addProductColor);
productRoute.patch(
  "/:id/color/:colorId/toggle",
  protectAdmin,
  toggleColorAvailability
);
productRoute.patch(
  "/:id/size/:colorId/toggle",
  protectAdmin,
  toggleSizeAvailability
);

// change pricing
productRoute.patch("/:id/discount", protectAdmin, updateProductDiscount);
productRoute.patch("/:id/price", protectAdmin, updateProductPrice);

// reviews

productRoute.post("/:productId/review", protectUser, addProductReview);
productRoute.get("/:productId/reviews", protectAll, getProductReviews);
productRoute.delete("/:productId/review/:reviewId", protectAll, deleteReview);

export default productRoute;
