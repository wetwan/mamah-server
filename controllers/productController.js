import Product from "../models/product.js";
import { v2 as cloudinary } from "cloudinary";

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      description,
      colors,
      sizes,
      category,
      stock,
      discount,
    } = req.body;

    const missingFields = [];
    if (!name) missingFields.push("name");
    if (!description) missingFields.push("description");
    if (!price) missingFields.push("price");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing details: ${missingFields.join(", ")}`,
      });
    }

    // Validate images
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Please upload at least one image." });
    }
    if (req.files.length > 4) {
      return res
        .status(400)
        .json({ success: false, message: "Maximum 4 images allowed." });
    }

    // ✅ Upload images using file.path (not buffer)
    const imageUrls = [];
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "products",
      });
      imageUrls.push(result.secure_url);
    }

    // ✅ Create product
    const product = await Product.create({
      name,
      description,
      price,
      category,
      colors: colors ? JSON.parse(colors) : [],
      sizes: sizes ? JSON.parse(sizes) : [],
      stock: stock || 0,
      discount: discount || 0,
      images: imageUrls,
    });

    res.status(201).json({
      success: true,
      message: "✅ Product created successfully",
      product,
    });
  } catch (error) {
    console.error("❌ Error creating product:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    // const userId = req.user._id;
    // const prodcuts = await Product.find({ user: userId }); // fetch all prodcuts
    const prodcuts = await Product.find(); // fetch all prodcuts

    res.json({
      success: true,
      count: prodcuts.length,
      prodcuts,
    });
  } catch (error) {
    console.error("Error fetching prodcuts:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getSingleProduct = async (req, res) => {
  try {
    // const userId = req.user._id;
    const { id } = req.params; // product ID from URL

    const product = await Product.findById(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    // if (!product.user.equals(userId)) {
    //   res.status(401).json({
    //     success: false,
    //     message: "Not authorized to access this product",
    //   });
    // }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Error fetching product:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
