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
import { Notification } from "./models/notification.js";
import { authenticateWebSocket } from "./middleware/wsAuth.js";
import noficationRouter from "./routes/notification.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
export const wss = new WebSocketServer({ server });
let connectedClients = 0;


wss.on("connection", async (ws, req) => {
  connectedClients++;
  console.log(`✅ New WebSocket client connected (Total: ${connectedClients})`);

  // Authenticate the user
  const user = await authenticateWebSocket(req);

  if (user) {
    // Assign user info to the WebSocket connection
    ws.userId = user._id;
    ws.userRole = user.role;
    ws.userName = user.name;
    ws.isAuthenticated = true;
    console.log(
      `👤 User authenticated: ${user.name} (${user.role}) - ID: ${user._id}`
    );
  } else {
    // Default to guest if authentication fails
    ws.userRole = "guest";
    ws.isAuthenticated = false;
    console.log("👤 Guest connected (unauthenticated)");
  }

  // Send welcome message
  ws.send(
    JSON.stringify({
      type: "CONNECTION_SUCCESS",
      message: user
        ? `Welcome back, ${user.name}!`
        : "Connected as guest. Please login for full features.",
      isAuthenticated: ws.isAuthenticated,
      role: ws.userRole,
      timestamp: new Date().toISOString(),
    })
  );

  // Send recent notifications to authenticated users
  if (ws.isAuthenticated && ws.userId) {
    try {
      const notifications = await Notification.find({
        $or: [{ isGlobal: true }, { userIds: ws.userId }],
      })
        .sort({ createdAt: -1 })
        .limit(50);

      if (notifications.length > 0) {
        ws.send(
          JSON.stringify({
            type: "NOTIFICATION_HISTORY",
            count: notifications.length,
            notifications: notifications,
            timestamp: new Date().toISOString(),
          })
        );
        console.log(`📨 Sent ${notifications.length} notifications to user`);
      }
    } catch (error) {
      console.error("❌ Error fetching notifications:", error.message);
    }
  }

  // Handle incoming messages from client
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`📨 Received from client:`, data);

      // Handle different message types
      switch (data.type) {
        case "PING":
          ws.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
          break;

        case "SUBSCRIBE":
          // Client can subscribe to specific channels
          if (data.channel) {
            ws.subscribedChannels = ws.subscribedChannels || new Set();
            ws.subscribedChannels.add(data.channel);
            ws.send(
              JSON.stringify({
                type: "SUBSCRIBED",
                channel: data.channel,
                message: `Subscribed to ${data.channel}`,
              })
            );
          }
          break;

        case "UNSUBSCRIBE":
          if (data.channel && ws.subscribedChannels) {
            ws.subscribedChannels.delete(data.channel);
            ws.send(
              JSON.stringify({
                type: "UNSUBSCRIBED",
                channel: data.channel,
                message: `Unsubscribed from ${data.channel}`,
              })
            );
          }
          break;

        default:
          console.log("Unknown message type:", data.type);
      }
    } catch (error) {
      console.error("❌ Error processing WebSocket message:", error.message);
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Invalid message format",
        })
      );
    }
  });

  // Handle connection errors
  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error.message);
  });

  // Handle disconnection
  ws.on("close", (code, reason) => {
    connectedClients--;
    console.log(
      `❌ WebSocket client disconnected (Total: ${connectedClients})`
    );
    console.log(`   Code: ${code}, Reason: ${reason || "No reason provided"}`);
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("💀 Terminating inactive WebSocket connection");
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
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

    app.get("/api/ws-status", (req, res) => {
      res.json({
        success: true,
        connectedClients: wss.clients.size,
        timestamp: new Date().toISOString(),
      });
    });

    app.use("/api/stripe", stripeRouter);
    app.use("/api/user", userRoute);
    app.use("/api/admin", adminRoute);
    app.use("/api/product", productRoute);
    app.use("/api/category", CategoryRouter);
    app.use("/api/order", orderRouter);
    app.use("/api/notify", noficationRouter);

    Sentry.setupExpressErrorHandler(app);

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 HTTP API: http://localhost:${PORT}`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
})();
