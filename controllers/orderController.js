import Admin from "../models/admin.js";
import { Notification } from "../models/notification.js";
import Order from "../models/order.js";
import Product from "../models/product.js";

import { wss } from "../server.js";
import { sendMessageToUser } from "../utils/websocketHelpers.js";

import currencySymbol from "currency-symbol-map";
import {
  getClientIP,
  getCountry,
  getCurrencyCode,
  getRates,
} from "./currency.js";

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

    const ip = getClientIP(req);
    const countryCode = await getCountry(ip);
    const currencyCode = getCurrencyCode(countryCode);
    const rates = await getRates();
    const exchangeRate = rates[currencyCode] || 1;
    const symbol = currencySymbol(currencyCode) || currencyCode;

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
      currency: {
        code: currencyCode,
        symbol: symbol,
        exchangeRate: exchangeRate,
        country: countryCode,
        // Store prices in both NGN and user's currency
        convertedItemsPrice: itemsPrice * exchangeRate,
        convertedShippingPrice: (shippingPrice || 0) * exchangeRate,
        convertedTaxPrice: (taxPrice || 0) * exchangeRate,
        convertedTotalPrice: totalPrice * exchangeRate,
      },
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

      const formattedTotal = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(order.currency.convertedTotalPrice);

      const notification = await Notification.create({
        type: "NEW_ORDER",
        title: `New Order #${order._id.toString().slice(-4)}`,
        message: `Total: ${symbol}${formattedTotal}`,
        relatedId: order._id.toString(),
        user: req.user._id,
        admin: Admin._id,
      });

      sendMessageToUser(req.user._id.toString(), {
        type: "NEW_ORDER",
        orderId: order._id.toString(),
        message: notification.message,
        // currency: {
        //   code: currencyCode,
        //   symbol: symbol,
        //   formattedTotal: `${symbol}${formattedTotal}`,
        // },
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
          // amount: `${symbol}${formattedTotal}`,
          // currency: {
          //   code: currencyCode,
          //   symbol: symbol,
          // },

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
        displayCurrency: {
          code: currencyCode,
          symbol: symbol,
          formattedTotal: `${symbol}${formattedTotal}`,
        },
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

    const formatted = orders.map((order) => ({
      ...order.toObject(),
      displayPrices: order.getDisplayPrices(),
      formattedTotal: order.formattedTotal,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      statusCounts,
      orders: formatted,
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

    const order = await Order.findById(orderId)
      .populate("user", "name email")
      .populate("items.product", "name images");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const validStatuses = [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const oldStatus = order.status;

    order.status = status;

    if (status === "delivered") {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    }

    await order.save(); // Save the updated order

    const displayPrices = order.getDisplayPrices();
    const formattedTotal = order.formatPrice(displayPrices.total);
    const currencySymbol = order.currency?.symbol || "₦";
    const currencyCode = order.currency?.code || "NGN";

    const statusMessages = {
      processing: "Your order is being processed",
      shipped: "Your order has been shipped",
      delivered: "Your order has been delivered",
      cancelled: "Your order has been cancelled",
    };

    const notification = await Notification.create({
      type: "ORDER_STATUS_UPDATE",
      title: `Order #${order._id.toString().slice(-4)} ${
        statusMessages[status] || "updated"
      }`,
      message: statusMessages[status] || `Order status updated to ${status}`,
      relatedId: order._id.toString(),
      user: order.user._id,
    });

    sendMessageToUser(order.user._id.toString(), {
      type: "ORDER_STATUS_UPDATE",
      orderId: order._id.toString(),
      oldStatus,
      newStatus: status,
      message: notification.message,
      currency: {
        code: currencyCode,
        symbol: currencySymbol,
        formattedTotal,
      },
      orderDetails: {
        status: order.status,
        isDelivered: order.isDelivered,
        deliveredAt: order.deliveredAt,
      },
      createdAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: {
        ...order.toObject(),
        displayPrices,
        formattedTotal,
      },
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
    const currency = req.query.currency;

    // --- 1. Build Filter ---
    let filter = {};
    if (currency) query["currency.code"] = currency;

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
    const skip = (page - 1) * limit;

    // --- 2. If status filter OR date filter is applied → return ALL (no pagination) ---
    if (
      (statusFilter && statusFilter !== "all") ||
      startDate ||
      endDate ||
      search ||
      currency
    ) {
      const orders = await Order.find(filter).sort(
        { createdAt: -1 }
          .populate("user", "name email")
          .populate("items.product", "name images")
      );
      const statusCounts = await getStatusCounts(filter);

      return res.status(200).json({
        success: true,
        count: orders.length,
        total: orders.length,
        currentPage: null,
        totalPages: null,
        statusCounts,
        orders,
      });
    }

    // --- 3. Otherwise → Paginated Response ---
    const totalFiltered = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalFiltered / limit);

    const orders = await Order.find(filter)
      .populate("user", "name email")
      .populate("items.product", "name images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const statusCounts = await getStatusCounts(filter);

    const revenueByCurrency = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$currency.code",
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalPrice" },
          avgOrderValue: { $avg: "$totalPrice" },
        },
      },
    ]);
    const formattedOrders = orders.map((order) => ({
      ...order.toObject(),
      formattedTotal: order.formattedTotal,
    }));

    return res.status(200).json({
      success: true,
      count: orders.length,
      total: totalFiltered,
      currentPage: page,
      totalPages,
      statusCounts,
      orders: formattedOrders,
      analytics: {
        revenueByCurrency,
        totalRevenue: revenueByCurrency.reduce((s, r) => s + r.totalRevenue, 0),
      },
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

    const displayPrices = order.getDisplayPrices();
    const formattedTotal = order.formatPrice(displayPrices.total);
    const currencySymbol = order.currency?.symbol || "₦";
    const currencyCode = order.currency?.code || "NGN";

    if (order) {
      const notificationData = {
        type: "NEW_ORDER_PAYMENT",
        title: `Transaction successful #${order._id.toString().slice(-4)}`,
        message: `Total: ${formattedTotal}`,
        relatedId: order._id.toString(),
        user: req.user._id,
        admin: Admin._id,
      };

      await Notification.create(notificationData);

      const userMessage = {
        ...notificationData,
        currency: {
          code: currencyCode,
          symbol: currencySymbol,
          formattedTotal,
          originalTotal: `₦${order.totalPrice.toFixed(2)}`, // Always show NGN
        },
        orderDetails: {
          orderId: order._id.toString(),
          status: order.status,
          isPaid: order.isPaid,
          paidAt: order.paidAt,
        },
        createdAt: new Date().toISOString(),
      };

      // Send to user
      await sendMessageToUser(order.user.toString(), userMessage, [
        "admin",
        "sales",
      ]);

      // Send notification to admins with both currencies
      const admins = await Admin.find({ role: { $in: ["admin", "sales"] } });

      for (const admin of admins) {
        sendMessageToUser(admin._id.toString(), {
          type: "NEW_ORDER_PAYMENT",
          title: `Payment Received #${order._id.toString().slice(-4)}`,
          message: `Order by ${req.user.name || "Customer"}`,
          amount: formattedTotal,
          currency: {
            code: currencyCode,
            symbol: currencySymbol,
            originalAmount: `₦${order.totalPrice.toFixed(2)}`,
            exchangeRate: order.currency?.exchangeRate || 1,
          },
          orderDetails: {
            orderId: order._id.toString(),
            customerName: req.user.name,
            status: order.status,
            paymentMethod: order.paymentMethod,
          },
          createdAt: new Date().toISOString(),
        });
      }
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

export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("items.product");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check authorization
    const isOwner = order.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this order",
      });
    }

    // Can't cancel delivered orders
    if (order.status === "delivered") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel delivered orders",
      });
    }

    // Already cancelled
    if (order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Order is already cancelled",
      });
    }

    // Restore stock if order was paid and processed
    if (
      order.isPaid &&
      (order.status === "processing" || order.status === "shipped")
    ) {
      await Promise.all(
        order.items.map(async (item) => {
          const product = await Product.findById(item.product._id);
          if (product) {
            product.stock += item.quantity;
            await product.save();
            console.log(
              `✅ Restored ${item.quantity} units to ${product.name}`
            );
          }
        })
      );
    }

    // Update order status
    order.status = "cancelled";
    await order.save();

    // Get currency info
    const displayPrices = order.getDisplayPrices();
    const formattedTotal = order.formatPrice(displayPrices.total);
    const currencySymbol = order.currency?.symbol || "₦";
    const currencyCode = order.currency?.code || "NGN";

    // Create notification
    const notification = await Notification.create({
      type: "ORDER_CANCELLED",
      title: `Order #${order._id.toString().slice(-4)} Cancelled`,
      message: `Your order of ${formattedTotal} has been cancelled`,
      relatedId: order._id.toString(),
      user: order.user,
    });

    // Notify user
    sendMessageToUser(order.user.toString(), {
      type: "ORDER_CANCELLED",
      orderId: order._id.toString(),
      message: notification.message,
      currency: {
        code: currencyCode,
        symbol: currencySymbol,
        formattedTotal,
        refundNote: order.isPaid
          ? "Refund will be processed within 5-7 business days"
          : null,
      },
      createdAt: new Date().toISOString(),
    });

    // Notify admins
    const admins = await Admin.find({ role: { $in: ["admin", "sales"] } });
    for (const admin of admins) {
      sendMessageToUser(admin._id.toString(), {
        type: "ORDER_CANCELLED",
        orderId: order._id.toString(),
        message: `Order #${order._id.toString().slice(-4)} was cancelled`,
        cancelledBy: isAdmin ? "Admin" : "Customer",
        customerName: req.user.name,
        amount: formattedTotal,
        currency: {
          code: currencyCode,
          symbol: currencySymbol,
          originalAmount: `₦${order.totalPrice.toFixed(2)}`,
        },
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: "Order cancelled successfully",
      order: {
        ...order.toObject(),
        displayPrices,
        formattedTotal,
      },
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel order",
    });
  }
};
