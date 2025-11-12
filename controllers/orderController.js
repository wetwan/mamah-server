import Order from "../models/order.js";
import Product from "../models/product.js";

import { wss } from "../server.js";

const WS_OPEN = 1;

const pendingOrderTimers = new Map();

const broadcast = (message, filterFn) => {
  if (!wss.clients) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WS_OPEN && (!filterFn || filterFn(client))) {
      client.send(JSON.stringify(message));
    }
  });
};

const cleanupPendingOrder = (orderId) => {
  const DELAY_MS = 10 * 60 * 1000; // 10 minutes

  const timer = setTimeout(async () => {
    try {
      const order = await Order.findById(orderId);

      if (
        order &&
        order.status === "pending" &&
        order.paymentMethod === "card"
      ) {
        console.log(
          `🕒 Deleting pending order ${orderId} and rolling back stock...`
        );

        // Stock rollback
        for (const item of order.items) {
          const product = await Product.findById(item.product);
          if (product) {
            product.stock += item.quantity;
            await product.save();
            console.log(
              `   + Rolled back ${item.quantity} for product ${product.name}. New stock: ${product.stock}`
            );
          }
        }

        await Order.deleteOne({ _id: orderId });
        console.log(
          `✅ Pending order ${orderId} deleted successfully and stock reverted.`
        );

        // Notify admins about the cancelled order
        const cancellationMessage = JSON.stringify({
          type: "ORDER_CANCELLED",
          orderId: orderId,
          reason: "Payment timeout (10 mins)",
          timestamp: new Date().toISOString(),
        });

        wss.clients.forEach((client) => {
          if (
            client.readyState === WS_OPEN &&
            (client.userRole === "admin" ||
              client.userRole === "sales" ||
              client.userId?.toString() === order.user.toString())
          ) {
            client.send(cancellationMessage);
          }
        });
      } else if (order) {
        console.log(
          `Order ${orderId} is no longer pending or is not a card payment. Cleanup skipped.`
        );
      }
    } catch (error) {
      console.error(
        `❌ Error during cleanup of order ${orderId}:`,
        error.message
      );
    } finally {
      // Remove timer from tracking
      pendingOrderTimers.delete(orderId.toString());
    }
  }, DELAY_MS);

  // Store timer reference
  pendingOrderTimers.set(orderId.toString(), timer);
};

export const cancelPendingOrderCleanup = (orderId) => {
  const orderIdStr = orderId.toString();
  if (pendingOrderTimers.has(orderIdStr)) {
    clearTimeout(pendingOrderTimers.get(orderIdStr));
    pendingOrderTimers.delete(orderIdStr);
    console.log(`⏹️ Cancelled cleanup timer for order ${orderIdStr}`);
  }
};

export const createOrder = async (req, res) => {
  let order = null;
  let isStockReduced = false;

  try {
    const { items, shippingAddress, paymentMethod, shippingPrice, taxPrice } =
      req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No order items provided",
      });
    }

    const populatedItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) throw new Error(`Product not found: ${item.product}`);
        if (product.stock < item.quantity)
          throw new Error(
            `NOT_ENOUGH_STOCK: Not enough stock for ${product.name}`
          );

        return {
          product: product._id,
          quantity: item.quantity,
          price: product.finalPrice,
          color: item.color || null,
          size: item.size || null,
        };
      })
    );

    const itemsPrice = populatedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const totalPrice = itemsPrice + (shippingPrice || 0) + (taxPrice || 0);

    let status =
      paymentMethod === "cash_on_delivery" ? "processing" : "pending";

    order = await Order.create({
      user: req.user._id,
      items: populatedItems,
      shippingAddress,
      paymentMethod: paymentMethod || "cash_on_delivery",
      itemsPrice,
      shippingPrice: shippingPrice || 0,
      taxPrice: taxPrice || 0,
      totalPrice,
      status,
      createdBy: req.user._id,
    });

    try {
      const lowStockAlerts = [];
      const LOW_STOCK_THRESHOLD = 5;

      if (paymentMethod !== "card") {
        await Promise.all(
          populatedItems.map(async (item) => {
            const product = await Product.findById(item.product);
            if (product) {
              product.stock = Math.max(0, product.stock - item.quantity);
              await product.save();

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
        isStockReduced = true;
      }

      if (paymentMethod === "card" && status === "pending") {
        cleanupPendingOrder(order._id.toString());
        console.log(
          `Card order ${order._id} created in 'pending' status. Stock reserved.`
        );
      }

      // New order notification
      await Notification.create({
        type: "NEW_ORDER",
        title: `New Order #${order._id.toString().slice(-4)}`,
        message: `Total: $${order.totalPrice}`,
        relatedId: order._id.toString(),
        user: req.user._id,
      });

      broadcast(
        {
          type: "NEW_ORDER",
          title: `New Order #${order._id.toString().slice(-4)}`,
          message: `Total: $${order.totalPrice}`,
          relatedId: order._id.toString(),
          timestamp: new Date().toISOString(),
        },
        (client) =>
          client.userRole === "admin" ||
          client.userRole === "sales" ||
          client.userId?.toString() === req.user._id.toString()
      );

      // Send inventory alert if needed
      if (lowStockAlerts.length > 0) {
        const alertData = {
          type: "INVENTORY_ALERT",
          title: "Inventory Alert",
          message: `${lowStockAlerts.length} product(s) are low in stock`,
          relatedId: order._id.toString(),
        };

        await Notification.create(alertData);
        broadcast(
          {
            ...alertData,
            alerts: lowStockAlerts,
            timestamp: new Date().toISOString(),
          },
          (client) => client.userRole === "admin" || client.userRole === "sales"
        );
      }

      return res.status(201).json({
        success: true,
        message: "✅ Order created successfully",
        order,
      });
    } catch (error) {
      console.error("❌ Secondary failure (Stock/WS):", error.message);

      if (isStockReduced && order) {
        for (const item of order.items) {
          const product = await Product.findById(item.product);
          if (product) {
            product.stock += item.quantity;
            await product.save();
          }
        }
      }

      if (order) {
        await Order.deleteOne({ _id: order._id });
        console.log(
          `✅ Rollback: Order ${order._id} deleted due to secondary failure.`
        );
      }

      throw error;
    }
  } catch (error) {
    console.error("❌ Error creating order:", error.message);

    if (error.message?.startsWith("NOT_ENOUGH_STOCK:")) {
      return res.status(400).json({
        success: false,
        message: error.message.replace("NOT_ENOUGH_STOCK: ", ""),
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Something went wrong while creating the order",
    });
  }
};

export const performScheduledOrderCleanup = async () => {
  console.log(
    "🧹 [Scheduled Cleanup] Starting bulk cleanup for expired pending orders..."
  );

  const EXPIRATION_THRESHOLD_MINUTES = 15;
  const expirationDate = new Date(
    Date.now() - EXPIRATION_THRESHOLD_MINUTES * 60 * 1000
  );

  try {
    const expiredOrders = await Order.find({
      status: "pending",
      paymentMethod: "card",
      createdAt: { $lt: expirationDate },
    });

    if (expiredOrders.length === 0) {
      console.log("✅ [Scheduled Cleanup] No expired pending orders found.");
      return;
    }

    console.log(
      `🚨 [Scheduled Cleanup] Found ${expiredOrders.length} expired orders to clean up.`
    );

    for (const order of expiredOrders) {
      try {
        // Perform stock rollback
        for (const item of order.items) {
          const product = await Product.findById(item.product);
          if (product) {
            product.stock += item.quantity;
            await product.save();
          }
        }

        // Delete the expired order
        await Order.deleteOne({ _id: order._id });

        // Clear any lingering individual timer if the server had restarted quickly
        if (pendingOrderTimers.has(order._id.toString())) {
          clearTimeout(pendingOrderTimers.get(order._id.toString()));
          pendingOrderTimers.delete(order._id.toString());
        }

        console.log(`   - Cleaned up and deleted expired order: ${order._id}`);

        // Notify admins
        const cancellationMessage = JSON.stringify({
          type: "ORDER_CANCELLED",
          orderId: order._id,
          reason: "Scheduled payment timeout cleanup (15+ mins)",
          timestamp: new Date().toISOString(),
        });

        wss.clients.forEach((client) => {
          if (
            client.readyState === WS_OPEN &&
            (client.userRole === "admin" ||
              client.userRole === "sales" ||
              client.userId?.toString() === order.user.toString())
          ) {
            client.send(cancellationMessage);
          }
        });
      } catch (innerError) {
        console.error(
          `❌ Error processing individual expired order ${order._id}:`,
          innerError.message
        );
        // Continue to the next order even if one fails
      }
    }

    console.log("✅ [Scheduled Cleanup] Bulk cleanup process finished.");
  } catch (error) {
    console.error(
      "❌ Error during scheduled bulk order cleanup:",
      error.message
    );
  }
};

export const getUserOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = req.query.q?.toLowerCase().trim();
    const statusFilter = req.query.status?.toLowerCase();

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
      page: page,
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
    // const authHeader = req.headers["authorization"];
    // const token = authHeader && authHeader.split(" ")[1];

    // if (!token) {
    //   return res
    //     .status(401)
    //     .json({ success: false, message: "No token provided" });
    // }
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
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate)
        filter.createdAt.$lte = new Date(
          new Date(endDate).setHours(23, 59, 59, 999)
        );
    }

    // --- 2. If status filter OR date filter is applied → return ALL (no pagination) ---
    if ((statusFilter && statusFilter !== "all") || startDate || endDate) {
      const orders = await Order.find(filter).sort({ createdAt: -1 });
      const totalFiltered = orders.length;
      const statusCounts = await getStatusCounts(filter);

      return res.status(200).json({
        success: true,
        count: orders.length,
        total: totalFiltered,
        currentPage: null,
        totalPages: null, // no pagination
        statusCounts,
        orders,
      });
    }

    // --- 3. Otherwise → Paginated Response ---
    const totalFiltered = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalFiltered / limit);

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const statusCounts = await getStatusCounts(filter);

    return res.status(200).json({
      success: true,
      count: orders.length,
      total: totalFiltered,
      currentPage: page,
      totalPages,
      statusCounts,
      orders,
    });
  } catch (error) {
    console.error("❌ Error fetching orders:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

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

export const getSingleOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).populate(
      "items.product",
      "name images price"
    );

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

export const updateOrderToPaid = async (req, res) => {
  const orderId = req.params.id;
  const { paymentIntentId } = req.body;

  try {
    const order = await Order.findById(orderId).populate("items.product");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Verify this is a card payment order and it's pending
    if (order.paymentMethod !== "card" || order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message:
          "Order status or payment method invalid for card payment update.",
      });
    }

    const lowStockAlerts = [];
    const LOW_STOCK_THRESHOLD = 5;

    // Update product stock
    await Promise.all(
      order.items.map(async (item) => {
        const product = await Product.findById(item.product._id);
        if (product) {
          if (product.stock < item.quantity) {
            throw new Error(
              `Insufficient stock for ${product.name}. Cannot fulfill order.`
            );
          }

          product.stock = Math.max(0, product.stock - item.quantity);
          await product.save();

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

    // Update order status to processing (NOT pending)
    order.status = "processing";
    order.isPaid = true;
    order.paidAt = new Date();
    order.paymentResult = {
      id: paymentIntentId,
      status: "succeeded",
    };
    await order.save();

    if (order) {
      const notificationData = {
        type: "NEW_ORDER",
        title: `New Order #${order._id.toString().slice(-4)}`,
        message: `Total: $${order.totalPrice}`,
        relatedId: order._id.toString(),
        user: req.user._id,
      };

      await Notification.create(notificationData);

      const message = {
        ...notificationData,
        timestamp: new Date().toISOString(),
      };

      // Send to admins, sales, and the user who created the order
      broadcast(
        message,
        (client) =>
          client.userRole === "admin" ||
          client.userRole === "sales" ||
          client.userId?.toString() === order.user.toString()
      );
    }
    if (lowStockAlerts.length < 6) {
      const notificationData = {
        type: "INVENTORY_ALERT",
        title: `Inventory Alert`,
        message: `${alerts.length} product(s) are low in stock`,
        relatedId: order._id.toString(),
        user,
      };

      await Notification.create(notificationData);

      const message = {
        ...notificationData,
        alerts,
        alertCount: alerts.length,
        timestamp: new Date().toISOString(),
      };

      broadcast(
        message,
        (client) => client.userRole === "admin" || client.userRole === "sales"
      );
    }

    res.status(200).json({
      success: true,
      message: "Order successfully paid and processed.",
      order,
    });
  } catch (error) {
    console.error("❌ Error processing payment:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to finalize payment.",
    });
  }
};
