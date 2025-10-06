import Stripe from "stripe";
import Order from "../models/order.js";
import dotenv from "dotenv";

dotenv.config();



const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,                     // raw body from express.raw
      sig,                          // Stripe-Signature header
      process.env.STRIPE_WEBHOOK_SECRET // webhook secret from stripe listen
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle events
  switch (event.type) {
    case "payment_intent.succeeded":
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.orderId;

      console.log("💰 Payment succeeded for order:", orderId);

      if (orderId) {
        await Order.findByIdAndUpdate(orderId, { status: "paid" });
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.sendStatus(200);
};
