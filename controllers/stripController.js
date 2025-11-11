import dotenv from "dotenv";
import Stripe from "stripe";
import User from "../models/user.js";
import Order from "../models/order.js";
import jwt from "jsonwebtoken";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const getOrCreateStripeCustomer = async (user) => {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: user.name || `${user.firstName} ${user.lastName}`,
    email: user.email,
  });

  user.stripeCustomerId = customer.id;
  await user.save();

  return customer.id;
};

export const createPayment = async (req, res) => {
  try {
    const { orderId, amount: clientAmount } = req.body;

    console.log("🔐 Creating payment intent for order:", orderId);

    const finalAmount = clientAmount || order.totalPrice;

    if (!finalAmount) {
      return res
        .status(500)
        .json({ success: false, message: "Order total amount not found." });
    }
    const amountInCents = Math.round(finalAmount * 100);
    // Verify authentication token
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith("Bearer")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No authorization token provided." });
    }

    // Verify token and get user
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userFromToken = await User.findById(decoded.id);

    if (!userFromToken) {
      return res.status(401).json({
        success: false,
        message: "Token is valid but user was not found.",
      });
    }

    const userId = userFromToken._id;

    // Validate orderId
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Find order
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Verify order belongs to user
    if (order.user.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized order access" });
    }

    if (order.paymentIntentId) {
      try {
        const existingIntent = await stripe.paymentIntents.retrieve(
          order.paymentIntentId
        );

        // If the existing intent is still waiting for client confirmation, reuse it
        if (
          existingIntent.status === "requires_payment_method" ||
          existingIntent.status === "requires_confirmation"
        ) {
          console.log("💳 Reusing existing payment intent:", existingIntent.id);
          return res.status(200).json({
            success: true,
            clientSecret: existingIntent.client_secret,
          });
        }

        // If it succeeded, the order should have been marked as paid. If not, log/handle.
        if (existingIntent.status === "succeeded") {
          return res
            .status(400)
            .json({ success: false, message: "Order is already paid." });
        }

        // If canceled or failed, proceed to create a new one below.
      } catch (e) {
        // If Stripe can't find the old ID (e.g., deleted), or other error, ignore and proceed to create new.
        console.warn(
          "Could not retrieve old payment intent. Creating new one."
        );
      }
    }

    // 3. Create a brand new Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "ngn",
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        orderId: order._id.toString(),
        userId: order.user.toString(),
      },
    });

    console.log("✅ Payment intent created:", paymentIntent.id);
    console.log("✅ Client secret:", paymentIntent.client_secret);

    // Validate client secret format
    if (
      !paymentIntent.client_secret ||
      !paymentIntent.client_secret.startsWith("pi_")
    ) {
      console.error(
        "❌ Invalid client secret format:",
        paymentIntent.client_secret
      );
      return res.status(500).json({
        success: false,
        message: "Invalid payment configuration generated",
      });
    }

    // Save payment intent ID to order
    order.paymentIntentId = paymentIntent.id;
    await order.save();

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });

    console.log("clientSecret" + " " + paymentIntent.client_secret);
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token. Please log in again.",
      });
    }
    console.error("❌ Stripe error:", error.message);
    console.error("❌ Full error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const createPaymentSheet = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { amount } = req.body;

    const customer = await stripe.customers.create();

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: "2025-05-28.basil" }
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "ngn",
      customer: customer.id,
      payment_method_types: ["card"],
    });

    res.status(200).json({
      paymentIntentId: paymentIntent.id,
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer.id,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: error.message });
  }
};

export const chargeSavedCard = async (req, res) => {
  try {
    const user = req.user; // from protect middleware
    const { amount } = req.body;

    if (!user.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "No saved payment method found for user",
      });
    }

    // Retrieve the customer's default payment method
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No saved payment methods found.",
      });
    }

    const paymentMethodId = paymentMethods.data[0].id;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "ngn",
      customer: user.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
    });

    res.status(200).json({
      success: true,
      message: "Payment charged successfully",
      paymentIntent,
    });
  } catch (error) {
    if (error.code === "authentication_required") {
      return res.status(400).json({
        success: false,
        message: "Authentication required to complete payment.",
      });
    }

    console.error("❌ Charge error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
