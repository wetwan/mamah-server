import Order from "../models/order.js";
import Product from "../models/product.js";

export const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, shippingPrice, taxPrice } =
      req.body;

    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No order items provided" });
    }

    // Calculate total and validate products
    const populatedItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) throw new Error(`Product not found: ${item.product}`);

        // Check stock availability
        if (product.stock < item.quantity) {
          throw new Error(`Not enough stock for product: ${product.name}`);
        }

        return {
          product: product._id,
          quantity: item.quantity,
          price: product.finalPrice,
          color: item.color,
          size: item.size,
        };
      })
    );

    const itemsPrice = populatedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const totalPrice = itemsPrice + (shippingPrice || 0) + (taxPrice || 0);

    // ✅ Create the order
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

    // ✅ Reduce stock for each product after order creation
    await Promise.all(
      populatedItems.map(async (item) => {
        const product = await Product.findById(item.product);

        if (product) {
          product.stock -= item.quantity;

          // Optional: ensure stock doesn’t go negative
          if (product.stock < 0) product.stock = 0;

          await product.save();
        }
      })
    );

    res.status(201).json({
      success: true,
      message: "✅ Order created successfully",
      order,
    });
  } catch (error) {
    console.error("❌ Error creating order:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ GET ALL ORDERS OF LOGGED-IN USER
export const getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate("items.product", "name images price")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("❌ Error fetching user orders:", error.message);
    res.status(500).json({ success: false, message: error.message });
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
    const orders = await Order.find()
      .populate("user", "name email")
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
