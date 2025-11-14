import Admin from "../models/admin.js";
import { Notification } from "../models/notification.js";
import Order from "../models/order.js";
import Product from "../models/product.js";

import { wss } from "../server.js";
import { sendMessageToUser } from "../utils/websocketHelpers.js";

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

const CLEANUP_DELAY_MS = 15 * 60 * 1000; // 15 minutes for both timer and bulk cleanup

export const cleanupPendingOrder = (orderId) => {
  // 1. Set the timer
  const timer = setTimeout(async () => {
    try {
      const order = await Order.findById(orderId);

      if (
        order &&
        order.status === "pending" &&
        order.paymentMethod === "card"
      ) {
    
        for (const item of order.items) {
          const product = await Product.findById(item.product);
          if (product) {
            product.stock += item.quantity;
            await product.save();
          }
        }

        await Order.deleteOne({ _id: orderId });
    

        const notification = await Notification.create({
          type: "ORDER_CANCELLED",
          title: "❌ Order Cancelled: Payment Failed",
          message: `Pending card payment order #${orderId.slice(
            -4
          )} cancelled after 15 minutes.`,
          relatedId: orderId,
          user: order.user,
        });

        // Notify the user
        sendMessageToUser(order.user.toString(), {
          type: "ORDER_CANCELLED",
          orderId,
          message: notification.message,
          createdAt: new Date().toISOString(),
        });
      } else if (order) {
    
      }
    } catch (error) {
      console.error(
        `❌ Error during timer cleanup for order ${orderId}:`,
        error.message
      );
    } finally {
      pendingOrderTimers.delete(orderId.toString());
    }
  }, CLEANUP_DELAY_MS);

  pendingOrderTimers.set(orderId.toString(), timer);

};

export const cancelPendingOrderCleanup = (orderId) => {
  const id = orderId.toString();
  if (pendingOrderTimers.has(id)) {
    clearTimeout(pendingOrderTimers.get(id));
    pendingOrderTimers.delete(id);

  }
};

export const performScheduledOrderCleanup = async () => {
  console.log(
    "🧹 [Scheduled Cleanup] Starting bulk cleanup for expired pending orders..."
  );
  const expirationDate = new Date(Date.now() - CLEANUP_DELAY_MS);

  try {
    const expiredOrders = await Order.find({
      status: "pending",
      paymentMethod: "card",
      createdAt: { $lt: expirationDate },
    });

    if (expiredOrders.length === 0) {
  
      return;
    }

  

    for (const order of expiredOrders) {
      try {
        for (const item of order.items) {
          const product = await Product.findById(item.product);
          if (product) {
            product.stock += item.quantity;
            await product.save();
          }
        }

        await Order.deleteOne({ _id: order._id });

        cancelPendingOrderCleanup(order._id);

        await Notification.create({
          type: "ORDER_CANCELLED",
          title: "❌ Order Cancelled: Payment Failed",
          message: `Your pending card payment order #${orderId.slice(
            -4
          )} timed out after 15 minutes and was cancelled. Please re-order if necessary.`,
          relatedId: order._id.toString(),
          user: order.user,
        });

        const cancellationMessage = JSON.stringify({
          type: "ORDER_CANCELLED",
          orderId: order._id,
          message: "Scheduled payment timeout cleanup (15+ mins)",
          createdAt: new Date().toISOString(),
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
      }
    }

  } catch (error) {
    console.error(
      "❌ Error during scheduled bulk order cleanup:",
      error.message
    );
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

      const notification = await Notification.create({
        type: "NEW_ORDER",
        title: `New Order #${order._id.toString().slice(-4)}`,
        message: `Total: $${order.totalPrice}`,
        relatedId: order._id.toString(),
        user: req.user._id,
        admin: Admin._id,
      });

      sendMessageToUser(req.user._id.toString(), {
        type: "NEW_ORDER",
        orderId: order._id.toString(),
        message: notification.message,
        createdAt: new Date().toISOString(),
      });

      const admins = await Admin.find({ role: { $in: ["admin", "sales"] } });

      for (const admin of admins) {
        sendMessageToUser(admin._id.toString(), {
          type: "NEW_ORDER",
          orderId: order._id.toString(),
          message: `New order #${order._id.toString().slice(-4)} by ${
            req.user.name
          }`,
          createdAt: new Date().toISOString(),
        });
      }

      // Send inventory alert if needed
      if (lowStockAlerts.length > 0) {
        const alertNotification = await Notification.create({
          type: "INVENTORY_ALERT",
          title: "Inventory Alert",
          message: `${lowStockAlerts.length} product(s) are low in stock`,
          relatedId: order._id.toString(),
        });

        for (const admin of admins) {
          sendMessageToUser(admin._id.toString(), {
            type: "INVENTORY_ALERT",
            alerts: lowStockAlerts,
            orderId: order._id.toString(),
            message: alertNotification.message,
            createdAt: new Date().toISOString(),
          });
        }
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

    await Notification.create({
      type: "ORDER_STATUS_UPDATE",
      title: "✔️ Order status is updated",
      message: `Your order with the ${orderId.slice(-4)} is updated to ${
        order.status
      }.`,
      relatedId: order._id.toString(),
      user: order.user,
    });

    if (oldStatus !== status) {
      const message = JSON.stringify({
        type: "ORDER_STATUS_UPDATE",
        orderId: order._id,
        userId: order.user,
        oldStatus: oldStatus,
        newStatus: order.status,
        createdAt: new Date().toISOString(),
        admin,
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
        type: "NEW_ORDER_PAYMENT",
        title: `Transaction successful #${order._id.toString().slice(-4)}`,
        message: `Total: $${order.totalPrice}`,
        relatedId: order._id.toString(),
        user: req.user._id,
        admin: Admin._id,
      };

      await Notification.create(notificationData);

      const message = {
        ...notificationData,
        createdAt: new Date().toISOString(),
      };

      // Send message to the user and all admin/sales users
      await sendMessageToUser(order.user.toString(), message, [
        "admin",
        "sales",
      ]);
    }
    if (lowStockAlerts.length > 0) {
      const notificationData = {
        type: "INVENTORY_ALERT",
        title: "Inventory Alert",
        message: `${lowStockAlerts.length} product(s) are low in stock`,
        relatedId: order._id.toString(),
        user: req.user._id,
      };

      await Notification.create(notificationData);

      const message = {
        ...notificationData,
        alerts: lowStockAlerts,
        alertCount: lowStockAlerts.length,
        createdAt: new Date().toISOString(),
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
