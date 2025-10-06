import express from "express";
import upload from "../middlewares/multer.js"; // your multer setup

import { protectAdmin, protectAll } from "../middlewares/authMiddle.js";
import {
  createBanner,
  deleteBanner,
  getAllBanners,
  getSinglebanner,
} from "../controllers/bannerController.js";

const bannerRouter = express.Router();

bannerRouter.post(
  "/create",
  upload.single("image"),
  protectAdmin,
  createBanner
);

bannerRouter.get("/", protectAll, getAllBanners);
bannerRouter.get("/:id", protectAll, getSinglebanner);
bannerRouter.delete("/:id", protectAdmin, deleteBanner);

export default bannerRouter;
