import "./config/instrumental.js";
import connectCloudinary from "./config/cloudinary.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import * as Sentry from "@sentry/node";
import http from "http";
import { WebSocketServer } from "ws";
import cron from "node-cron";
import userRoute from "./routes/userRoutes.js";
import adminRoute from "./routes/adminRoutes.js";
import productRoute from "./routes/productRoutes.js";
import CategoryRouter from "./routes/categoryRoutes.js";
import orderRouter from "./routes/orderRoute.js";
import { stripeWebhook } from "./controllers/stripeWebhook.js";
import stripeRouter from "./routes/stripeRoute.js";
import { Notification } from "./models/notification.js";
import noficationRouter from "./routes/notification.js";
import { authenticateWebSocket } from "./middlewares/webSocket.js";
import { performScheduledOrderCleanup } from "./controllers/orderController.js";
import { markUserOffline, markUserOnline, refreshUserPresence } from "./utils/presence.js";
import { redis } from "./config/redis.js";
import presenceRoutes from "./routes/presenceRoutes.js";
import pushNotificatonRouter from "./routes/pushNotification.js";
import currencyRouter from "./routes/currencyRoute.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
export const wss = new WebSocketServer({ server });
export const onlineClients = new Map();
let connectedClients = 0;

cron.schedule(
  "*/15 * * * *",
  () => {
    performScheduledOrderCleanup();
  },
  {
    scheduled: true,
    timezone: "Etc/UTC",
  }
);

// Redis test
(async () => {
  const test = await redis.set("test", "hello");
  const value = await redis.get("test");
  console.log("Redis test value:", value);
})();

// ✅ FIX: Add helper function
const broadcastToAll = (wss, message) => {
  const messageStr = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(messageStr);
    }
  });
};

// ✅ FIX: Add await and simplify logic
wss.on("connection", async (ws, req) => {
  ws.isAlive = true;
  connectedClients++;

  // ✅ CRITICAL FIX: Add await here
  const user = await authenticateWebSocket(req);

  if (!user) {
    console.log("⚠️ Unauthenticated WebSocket connection attempt");
    ws.close(1008, "Authentication required");
    return;
  }

  // User is authenticated - set up connection
  ws.userId = user._id.toString();
  ws.userRole = user.role;
  ws.userName = user.name;
  ws.isAuthenticated = true;

  const userIdStr = user._id.toString();

  if (!onlineClients.has(userIdStr)) {
    onlineClients.set(userIdStr, []);
  }
  onlineClients.get(userIdStr).push(ws);

  await markUserOnline(user._id);

  broadcastToAll(wss, {
    type: "USER_ONLINE",
    userId: user._id,
    name: user.name,
    timestamp: new Date().toISOString(),
  });

  console.log(`🟢 ${user.name} is now ONLINE`);
  console.log(
    `👤 User authenticated: ${user.name} (${user.role}) - ID: ${
      user._id
    } (Total connections: ${onlineClients.get(userIdStr).length})`
  );

  ws.send(
    JSON.stringify({
      type: "CONNECTION_SUCCESS",
      message: `Welcome back, ${user.name}!`,
      isAuthenticated: true,
      role: ws.userRole,
      timestamp: new Date().toISOString(),
    })
  );

  // Send notification history
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

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`📨 Received from client:`, data);

      switch (data.type) {
        case "PING":
          if (ws.userId) {
            await refreshUserPresence(ws.userId);
          }
          ws.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
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

  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error.message);
  });

  ws.on("close", async (code, reason) => {
    connectedClients--;
    if (ws.userId) {
      const userIdStr = ws.userId.toString();
      const userConnections = onlineClients.get(userIdStr) || [];

      const remainingConnections = userConnections.filter(
        (client) => client !== ws
      );

      if (remainingConnections.length > 0) {
        onlineClients.set(userIdStr, remainingConnections);
        console.log(
          `🔌 User ${ws.userName} closed one connection, ${remainingConnections.length} remaining.`
        );
      } else {
        onlineClients.delete(userIdStr);
        await markUserOffline(ws.userId);

        broadcastToAll(wss, {
          type: "USER_OFFLINE",
          userId: ws.userId,
          timestamp: new Date().toISOString(),
        });
        console.log(`🔴 User ${ws.userName} is now OFFLINE`);
      }
    }
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

// Rest of your server setup remains the same
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
    app.use("/api/presence", presenceRoutes);
    app.use("/api/push", pushNotificatonRouter);
    app.use("/api/get-price", currencyRouter);

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