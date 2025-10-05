import Product from "../models/product.js";
import { v2 as cloudinary } from "cloudinary";

// ✅ CREATE PRODUCT (max 4 images)
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

    // Validate fields
    const missingFields = [];
    if (!name) missingFields.push("name");
    if (!description) missingFields.push("description");
    if (!price) missingFields.push("price");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing details: ${missingFields.join(", ")}`,
        missingFields,
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

    // ✅ Upload images to Cloudinary properly
    const uploadToCloudinary = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "products" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(fileBuffer);
      });
    };

    const imageUrls = [];
    for (const file of req.files) {
      const imageUrl = await uploadToCloudinary(file.buffer);
      imageUrls.push(imageUrl);
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
