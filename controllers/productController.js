import Product from "../models/product.js";
import { v2 as cloudinary } from "cloudinary";

import { wss } from "../server.js";

const WS_OPEN = 1;

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

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please upload at least one image.",
      });
    }

    if (req.files.length > 4) {
      return res.status(400).json({
        success: false,
        message: "Maximum 4 images allowed.",
      });
    }

    // ✅ Upload images
    const imageUrls = [];
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "products",
      });
      imageUrls.push(result.secure_url);
    }

    // ✅ Parse colors and sizes
    let parsedColors = [];
    if (colors) {
      const temp = JSON.parse(colors);
      parsedColors = temp.map((c) =>
        typeof c === "string"
          ? { name: c, available: true }
          : { ...c, available: c.available ?? true }
      );
    }

    const parsedSizes = sizes ? JSON.parse(sizes) : [];

    // ✅ Create product
    const product = await Product.create({
      name,
      description,
      price,
      category,
      colors: parsedColors,
      sizes: parsedSizes,
      stock: stock || 0,
      discount: discount || 0,
      images: imageUrls,
      postedby: req.admin._id,
    });

    const newProductMessage = JSON.stringify({
      type: "NEW_PRODUCT_CREATED",
      productId: product._id,
      productName: product.name,
      category: product.category,
      stockLevel: product.stock,
      postedBy: req.admin._id,
      timestamp: new Date().toISOString(),
    });

    // Broadcast the new product alert (useful for admin dashboards or caching services)
    if (wss.clients) {
      // Safety check
      wss.clients.forEach((client) => {
        if (client.readyState === WS_OPEN) {
          client.send(newProductMessage);
        }
      });
    }

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
    const {
      page = 1,
      limit = 12,
      cat,
      color,
      size,
      min,
      max,
      search,
      sort,
    } = req.query;

    const skip = (page - 1) * limit;

    const query = {};

    if (cat) query.category = cat;

    if (color) query.colors = { $in: [color] };

    if (size) query.sizes = { $in: [size] };

    if (min || max) {
      query.price = {};
      if (min) query.price.$gte = Number(min);
      if (max) query.price.$lte = Number(max);
    }
    const sortOption =
      sort === "a-z"
        ? { name: 1 }
        : sort === "z-a"
        ? { name: -1 }
        : sort === "low-high"
        ? { price: 1 }
        : sort === "high-low"
        ? { price: -1 }
        : { createdAt: -1 };

    if (search) {
      const s = search.toLowerCase().trim();
      query.$or = [
        { name: { $regex: s, $options: "i" } },
        { description: { $regex: s, $options: "i" } },
        { category: { $regex: s, $options: "i" } },
      ];
    }

    const products = await Product.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      count: products.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      products,
    });
  } catch (error) {
    console.error("Error fetching prodcuts:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSingleProduct = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("🔍 Fetching product with ID:", id);

    const product = await Product.findById(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Error fetching product:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addProductColor = async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, hex } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Color name required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    // Add new color
    product.colors.push({ name, hex, available: true });
    await product.save();

    res.status(200).json({
      success: true,
      message: "Color added successfully",
      colors: product.colors,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const toggleColorAvailability = async (req, res) => {
  try {
    const { productId, colorId } = req.params;
    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const color = product.colors.id(colorId);
    if (!color) {
      return res
        .status(404)
        .json({ success: false, message: "Color not found" });
    }

    color.available = !color.available;
    await product.save();

    res.status(200).json({
      success: true,
      message: `Color ${color.available ? "enabled" : "disabled"} successfully`,
      colors: product.colors,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProductDiscount = async (req, res) => {
  try {
    const { productId } = req.params;
    const { discount } = req.body;

    // Validate discount input
    if (discount === undefined) {
      return res.status(400).json({
        success: false,
        message: "Discount value is required",
      });
    }

    if (discount < 0 || discount > 100) {
      return res.status(400).json({
        success: false,
        message: "Discount must be between 0 and 100",
      });
    }

    // Find and update
    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    product.discount = discount;
    await product.save();

    res.status(200).json({
      success: true,
      message: "Product discount updated successfully",
      product: {
        _id: product._id,
        name: product.name,
        price: product.price,
        discount: product.discount,
        finalPrice: product.finalPrice,
      },
    });
  } catch (error) {
    console.error("❌ Error updating discount:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProductPrice = async (req, res) => {
  try {
    const { productId } = req.params;
    const { price } = req.body;

    // Validate discount input
    if (price === undefined) {
      return res.status(400).json({
        success: false,
        message: "price value is required",
      });
    }

    // Find and update
    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    product.price = price;
    product.discount = 0;
    await product.save();

    res.status(200).json({
      success: true,
      message: "Product price updated successfully",
      product: {
        _id: product._id,
        name: product.name,
        price: product.price,
        discount: product.discount,
        finalPrice: product.finalPrice,
      },
    });
  } catch (error) {
    console.error("❌ Error updating price:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addProductReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    // Check if user already reviewed
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    const review = {
      name: req.user.name,
      rating: Number(rating),
      comment,
      user: req.user._id,
    };

    product.reviews.push(review);
    product.numReviews = product.reviews.length;
    product.rating =
      product.reviews.reduce((acc, item) => item.rating + acc, 0) /
      product.reviews.length;

    await product.save();

    res.status(201).json({
      success: true,
      message: "✅ Review added successfully",
      reviews: product.reviews,
    });
  } catch (error) {
    console.error("❌ Error adding review:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId).populate(
      "reviews.user",
      "name email"
    );

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    res.status(200).json({
      success: true,
      count: product.reviews.length,
      reviews: product.reviews,
    });
  } catch (error) {
    console.error("❌ Error fetching reviews:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const { productId, reviewId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const review = product.reviews.find(
      (r) => r._id.toString() === reviewId.toString()
    );

    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    // ✅ Allow: Review owner or Admin
    const isOwner = review.user.toString() === req.user._id.toString();
    const isAdmin = req.admin;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this review",
      });
    }

    // Remove the review
    product.reviews = product.reviews.filter(
      (r) => r._id.toString() !== reviewId.toString()
    );

    // Recalculate rating & count
    product.numReviews = product.reviews.length;
    product.rating =
      product.numReviews > 0
        ? product.reviews.reduce((acc, item) => item.rating + acc, 0) /
          product.numReviews
        : 0;

    await product.save();

    res.status(200).json({
      success: true,
      message: "✅ Review deleted successfully",
      reviews: product.reviews,
    });
  } catch (error) {
    console.error("❌ Error deleting review:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
