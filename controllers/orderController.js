import Order from "../models/order.js";
import Product from "../models/product.js";

export const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, shippingPrice, taxPrice } =
      req.body;

    // 🧩 Validate order items
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No order items provided",
      });
    }

    // 🧮 Validate and populate product data
    const populatedItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) throw new Error(`Product not found: ${item.product}`);

        // Check stock
        if (product.stock < item.quantity) {
          throw new Error(`Not enough stock for ${product.name}`);
        }

        // ✅ Allow optional color and size
        return {
          product: product._id,
          quantity: item.quantity,
          price: product.finalPrice,
          color: item.color || null,
          size: item.size || null,
        };
      })
    );

    // 💰 Calculate totals
    const itemsPrice = populatedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const totalPrice = itemsPrice + (shippingPrice || 0) + (taxPrice || 0);

    // 🏗️ Create the order document
    const order = await Order.create({
      user: req.user._id,
      items: populatedItems,
      shippingAddress,
      paymentMethod: paymentMethod || "cash_on_delivery",
      itemsPrice,
      shippingPrice: shippingPrice || 0,
      taxPrice: taxPrice || 0,
      totalPrice,
      createdBy: req.user._id,
      creatorModel: req.user.role === "admin" ? "Admin" : "User",
    });

    // 📦 Update stock
    await Promise.all(
      populatedItems.map(async (item) => {
        const product = await Product.findById(item.product);
        if (product) {
          product.stock = Math.max(0, product.stock - item.quantity);
          await product.save();
        }
      })
    );

    // ✅ Done
    res.status(201).json({
      success: true,
      message: "✅ Order created successfully",
      order,
    });
  } catch (error) {
    console.error("❌ Error creating order:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Something went wrong while creating the order",
    });
  }
};

// ✅ GET ALL ORDERS OF LOGGED-IN USER
export const getUserOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const orders = await Order.find({ user: req.user._id })
      .populate("items.product", "name images price")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments();

    res.status(200).json({
      success: true,
      count: orders.length,
      total, // total number of products
      currentPage: page, // current page number
      totalPages: Math.ceil(total / limit),
      orders,
    });
  } catch (error) {
    console.error("❌ Error fetching user orders:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }
    const { orderId } = req.params;
    const { status } = req.body;

    const allowedStatus = [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${allowedStatus.join(", ")}`,
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    order.status = status;

    if (status === "delivered") {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: "✅ Order status updated successfully",
      order,
    });
  } catch (error) {
    console.error("❌ Error updating order status:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const orders = await Order.find()
      .populate("user", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("❌ Error fetching all orders:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getSingleorder = async (req, res) => {
  try {
    // const userId = req.user._id;
    const { id } = req.params; // order ID from URL

    const order = await Order.findById(id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "order not found" });
    }
    // if (!order.user.equals(userId)) {
    //   res.status(401).json({
    //     success: false,
    //     message: "Not authorized to access this order",
    //   });
    // }

    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Error fetching order:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
