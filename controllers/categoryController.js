import Category from "../models/categories.js";
import { v2 as cloudinary } from "cloudinary";

/**
 * ✅ CREATE CATEGORY (with Cloudinary image upload)
 */
export const createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    // Validate
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Category name is required" });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Category image is required" });
    }

    // ✅ Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "categories",
    });

    // ✅ Create category
    const category = await Category.create({
      name,
      image: uploadResult.secure_url,
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    console.error("❌ Error creating category:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });

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

export const getSinglecategory = async (req, res) => {
  try {
    // const userId = req.user._id;
    const { id } = req.params; // category ID from URL

    const category = await Category.findById(id);
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "category not found" });
    }
    // if (!category.user.equals(userId)) {
    //   res.status(401).json({
    //     success: false,
    //     message: "Not authorized to access this category",
    //   });
    // }

    res.json({
      success: true,
      category,
    });
  } catch (error) {
    console.error("Error fetching category:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
