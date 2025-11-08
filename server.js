import "./config/instrumental.js";
import connectCloudinary from "./config/cloudinary.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import * as Sentry from "@sentry/node";
import http from "http";
import { WebSocketServer } from "ws";

import userRoute from "./routes/userRoutes.js";
import adminRoute from "./routes/adminRoutes.js";
import productRoute from "./routes/productRoutes.js";
import CategoryRouter from "./routes/categoryRoutes.js";
import orderRouter from "./routes/orderRoute.js";
import { stripeWebhook } from "./controllers/stripeWebhook.js";
import stripeRouter from "./routes/stripeRoute.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
export const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
    console.log("✅ New WebSocket client connected");

    // NOTE: authenticateUser(req) must be able to read authentication 
    // data (e.g., token from cookies or query string) from the handshake request.
    const user = authenticateUser(req); 

    if (user) {
        // Assign role if authenticated
        ws.userRole = user.role;
        console.log(`User connected with role: ${user.role}`);
    } else {
        // Default to 'guest' if unauthenticated
        ws.userRole = "guest";
        console.log("Guest connected.");
    }


    ws.send("Welcome to the WebSocket server!");

    // The 'message' listener is now only for processing incoming data.
    ws.on("message", (message) => {
        const msg = message.toString();
        console.log(`Received: ${msg}`);
        // Echo back to the sender
        ws.send(`Server received: ${msg}`);

        // DO NOT re-authenticate here. The role is already set.
    });

    ws.on("close", () => {
        console.log("❌ WebSocket client disconnected");
    });
});

// Connect to MongoDB first, then start server
(async () => {
  try {
    await connectDB();
    connectCloudinary();

    app.use(cors());
    app.post(
      "/api/stripe/webhook",
      express.raw({ type: "application/json" }),
      stripeWebhook
    );

    app.use(express.json());
   
    app.get("/", (req, res) => res.send("API Working"));
    app.use("/api/stripe", stripeRouter);
    app.use("/api/user", userRoute);
    app.use("/api/admin", adminRoute);
    app.use("/api/product", productRoute);
    app.use("/api/category", CategoryRouter);
    app.use("/api/order", orderRouter);

    Sentry.setupExpressErrorHandler(app);

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}. HTTP and WS active.`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
})();
