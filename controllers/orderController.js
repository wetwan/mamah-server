import Order from "../models/order.js";
import Product from "../models/product.js";

import { wss } from "../server.js";

const WS_OPEN = 1;

export const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, shippingPrice, taxPrice } =
      req.body;

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

    const lowStockAlerts = [];
    const LOW_STOCK_THRESHOLD = 5;

    await Promise.all(
      populatedItems.map(async (item) => {
        const product = await Product.findById(item.product);
        if (product) {
          // Update stock, ensuring it doesn't go below 0
          product.stock = Math.max(0, product.stock - item.quantity);
          await product.save();

          // 🔔 Check for low/no stock after update
          if (product.stock <= LOW_STOCK_THRESHOLD) {
            lowStockAlerts.push({
              productId: product._id,
              productName: product.name,
              currentStock: product.stock,
            });
          }
        }
      })
    );

    const newOrderMessage = JSON.stringify({
      type: "NEW_ORDER",
      orderId: order._id,
      userId: order.user,
      totalPrice: order.totalPrice,
      status: order.status,
      timestamp: new Date().toISOString(),
    });

    // Broadcast the new order alert
    wss.clients.forEach((client) => {
      if (client.readyState === WS_OPEN) {
        client.send(newOrderMessage);
      }
    });

    // --- 🔔 WebSocket Notification Logic for Inventory ---
    if (lowStockAlerts.length > 0) {
      const message = JSON.stringify({
        type: "INVENTORY_ALERT",
        alertCount: lowStockAlerts.length,
        alerts: lowStockAlerts,
        timestamp: new Date().toISOString(),
      });

      wss.clients.forEach((client) => {
        // Assuming WS_OPEN is 1
        if (client.readyState === WS_OPEN) {
          client.send(message);
        }
      });
    }

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

// ✅ GET ALL ORDERS OF LOGGED-IN USER (With Search + Filter + Pagination)
export const getUserOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = req.query.q?.toLowerCase().trim();
    const statusFilter = req.query.status?.toLowerCase();

    // --- Base Filter (Always filter by logged-in user)
    let filter = { user: req.user._id };

    // ✅ Search (q)
    if (query) {
      filter.$or = [
        { _id: { $regex: query, $options: "i" } },
        { "shippingAddress.fullName": { $regex: query, $options: "i" } },
        { "shippingAddress.email": { $regex: query, $options: "i" } },
      ];
    }

    // ✅ Status Filter
    if (statusFilter && statusFilter !== "all") {
      filter.status = statusFilter;
    }

    // --- Total Count After Filter
    const total = await Order.countDocuments(filter);

    // --- Status Count Based on Filter
    const statusSummary = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = statusSummary.reduce((acc, cur) => {
      acc[cur._id] = cur.count;
      return acc;
    }, {});

    // --- Fetch Paginated Orders
    const orders = await Order.find(filter)
      .populate("items.product", "name images price")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      statusCounts,
      orders,
    });
  } catch (error) {
    console.error("❌ Error fetching user orders:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
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

    const oldStatus = order.status;

    order.status = status;

    if (status === "delivered") {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    }

    await order.save(); // Save the updated order

    // --- 🔔 WebSocket Notification Logic ---
    if (oldStatus !== status) {
      const message = JSON.stringify({
        type: "ORDER_STATUS_UPDATE",
        orderId: order._id,
        userId: order.user,
        oldStatus: oldStatus,
        newStatus: order.status,
        timestamp: new Date().toISOString(),
      });

      wss.clients.forEach((client) => {
        if (client.readyState === WS_OPEN) {
          client.send(message);
        }
      });
    }

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const query = req.query.q?.toLowerCase().trim();
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const statusFilter = req.query.status?.toLowerCase();

    // --- 1. Build Filter ---
    let filter = {};

    if (query) {
      filter.$or = [
        { _id: { $regex: query, $options: "i" } },
        { "shippingAddress.fullName": { $regex: query, $options: "i" } },
        { "shippingAddress.email": { $regex: query, $options: "i" } },
      ];
    }

    if (statusFilter && statusFilter !== "all") {
      filter.status = statusFilter;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
      }
    }

    // --- 2. Fetch Data (paginated or all) ---
    let orders, totalFiltered;
    let statusCounts = {};

    if (startDate || endDate) {
      // Fetch all orders if date range is provided (no pagination)
      orders = await Order.find(filter).sort({ createdAt: -1 });
      totalFiltered = orders.length;
      statusCounts = await getStatusCounts(filter);
      return res.status(200).json({
        success: true,
        count: orders.length,
        total: totalFiltered,
        currentPage: null,
        totalPages: null,
        statusCounts,
        orders,
      });
    } else {
      // Paginated response if no date range
      totalFiltered = await Order.countDocuments(filter);
      const totalPages = Math.ceil(totalFiltered / limit);
      orders = await Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      statusCounts = await getStatusCounts(filter);
      return res.status(200).json({
        success: true,
        count: orders.length,
        total: totalFiltered,
        currentPage: page,
        totalPages,
        statusCounts,
        orders,
      });
    }
  } catch (error) {
    console.error("❌ Error fetching orders:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Helper function to avoid duplicate code
const getStatusCounts = async (filter) => {
  const statusSummary = await Order.aggregate([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  return statusSummary.reduce((acc, cur) => {
    acc[cur._id] = cur.count;
    return acc;
  }, {});
};

export const getSingleorder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id)
      .populate("user", "firstName lastName email")
      .populate("items.product", "name images price");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("❌ Error getting order:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
