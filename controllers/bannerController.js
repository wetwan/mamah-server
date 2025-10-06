import Banner from "../models/banners.js";
import { v2 as cloudinary } from "cloudinary";

/**
 * ✅ CREATE BANNER (with Cloudinary image upload)
 */
export const createBanner = async (req, res) => {
  try {
    const { name } = req.body;

    // Validate
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Banner name is required" });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Banner image is required" });
    }

    // ✅ Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "banners",
    });

    // ✅ Create banner
    const banner = await Banner.create({
      name,
      image: uploadResult.secure_url,
    });

    res.status(201).json({
      success: true,
      message: "Banner created successfully",
      banner,
    });
  } catch (error) {
    console.error("❌ Error creating banner:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllBanners = async (req, res) => {
  try {
    const categories = await Banner.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error("❌ Error fetching categories:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSinglebanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);
    if (!banner) {
      return res
        .status(404)
        .json({ success: false, message: "banner not found" });
    }

    res.json({
      success: true,
      banner,
    });
  } catch (error) {
    console.error("Error fetching banner:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteBanner = async (req, res) => {
  try {
    const { bannerId } = req.params;

    const banner = await Banner.findById(bannerId);
    if (!banner) {
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });
    }

    // Remove the banner
    banner = banner.filter((r) => r._id.toString() !== bannerId.toString());

    await banner.save();

    res.status(200).json({
      success: true,
      message: "✅ Banner deleted successfully",
      banners: banner.banners,
    });
  } catch (error) {
    console.error("❌ Error deleting banner:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
