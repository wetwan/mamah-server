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
    name: user.name,
    email: user.email,
  });

  user.stripeCustomerId = customer.id;
  await user.save();

  return customer.id;
};

// NOTE: Ensure jwt, User, and Order are imported at the top of the file.
// import jwt from "jsonwebtoken";
// import User from "../models/user.js";
// import Order from "../models/order.js";

export const createPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

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

    const decoded = jwt.verify(token, process.env.JWT_SERECT);

    const userFromToken = await User.findById(decoded.id).select("_id");

    if (!userFromToken) {
      return res.status(401).json({
        success: false,
        message: "Token is valid but user was not found.",
      });
    }

    const userId = userFromToken._id;

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

  
    if (order.user.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized order access" });
    }

    const amount = Math.round(order.totalPrice * 100);

    const orderUser = await User.findById(order.user);
    if (!orderUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found for order" });
    }

    const customerId = await getOrCreateStripeCustomer(orderUser);

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2024-06-20" }
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "ngn",
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: order._id.toString(),
        userId: order.user.toString(),
      },
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      customerId,
    });
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
    res.status(500).json({ error: error.message });
  }
};

// export const createPayment = async (req, res) => {
//   try {
//     // // 🛑 VALIDATION FIX: Ensure req.body is present and orderId exists
//     // if (!req.body || !req.orderId) {
//     //   return res.status(400).json({
//     //     success: false,
//     //     message: "Missing 'orderId' in request body. Payment cannot proceed.",
//     //   });
//     // }

//     const { orderId } = req.body;

//     const order = await Order.findById(orderId);
//     if (!order) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Order not found" });
//     }

//     // Amount must be an integer, typically in cents/kobo (lowest currency unit)
//     const amount = Math.round(order.totalPrice * 100);

//     const user = await User.findById(order.user);
//     if (!user) {
//       return res
//         .status(404)
//         .json({ success: false, message: "User not found" });
//     }

//     // Ensure customerId is retrieved or created
//     const customerId = await getOrCreateStripeCustomer(user);

//     // 🛑 STRIPE API VERSION FIX: Use a valid date format for API version
//     const ephemeralKey = await stripe.ephemeralKeys.create(
//       { customer: customerId },
//       // Check Stripe docs for the current recommended API version
//       { apiVersion: "2024-06-20" }
//     );

//     const paymentIntent = await stripe.paymentIntents.create({
//       amount,
//       currency: "ngn",
//       customer: customerId, // Associate PaymentIntent with customer
//       automatic_payment_methods: { enabled: true },
//       metadata: {
//         orderId: order._id.toString(),
//         userId: order.user.toString(),
//       },
//     });

//     res.status(200).json({
//       success: true,
//       clientSecret: paymentIntent.client_secret,
//       paymentIntentId: paymentIntent.id,
//       customerId,
//       ephemeralKey: ephemeralKey.secret, // Return the ephemeral key secret for mobile/client SDKs
//     });
//   } catch (error) {
//     console.error("❌ Stripe error:", error.message);
//     res.status(500).json({ error: error.message });
//   }
// };

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
      off_session: true, // charge automatically
      confirm: true,
    });

    res.status(200).json({
      success: true,
      message: "Payment charged successfully",
      paymentIntent,
    });
  } catch (error) {
    if (error.code === "authentication_required") {
      // Customer needs to re-authenticate
      return res.status(400).json({
        success: false,
        message: "Authentication required to complete payment.",
      });
    }

    console.error("❌ Charge error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
