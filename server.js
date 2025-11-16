// import "./config/instrumental.js";
// import connectCloudinary from "./config/cloudinary.js";
// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import connectDB from "./config/db.js";
// import * as Sentry from "@sentry/node";
// import http from "http";
// import { WebSocketServer } from "ws";
// import cron from "node-cron";
// import userRoute from "./routes/userRoutes.js";
// import adminRoute from "./routes/adminRoutes.js";
// import productRoute from "./routes/productRoutes.js";
// import CategoryRouter from "./routes/categoryRoutes.js";
// import orderRouter from "./routes/orderRoute.js";
// import { stripeWebhook } from "./controllers/stripeWebhook.js";
// import stripeRouter from "./routes/stripeRoute.js";
// import { Notification } from "./models/notification.js";

// import noficationRouter from "./routes/notification.js";
// import { authenticateWebSocket } from "./middlewares/webSocket.js";
// import { performScheduledOrderCleanup } from "./controllers/orderController.js";
// import { markUserOffline, markUserOnline } from "./utils/presence.js";
// import { redis } from "./config/redis.js";
// import presenceRoutes from "./routes/presenceRoutes.js";
// import pushNotificatonRouter from "./routes/pushNotification.js";

// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 5000;

// const server = http.createServer(app);
// export const wss = new WebSocketServer({ server });
// export const onlineClients = new Map();
// let connectedClients = 0;

// cron.schedule(
//   "*/15 * * * *",
//   () => {
//     performScheduledOrderCleanup();
//   },
//   {
//     scheduled: true,
//     timezone: "Etc/UTC", // Use a consistent timezone like UTC
//   }
// );

// (async () => {
//   const test = await redis.set("test", "hello");
//   const value = await redis.get("test");
//   console.log("Redis test value:", value); // should print "hello"
// })();

// wss.on("connection", async (ws, req) => {
//   ws.isAlive = true;
//   connectedClients++;
//   console.log(`✅ New WebSocket client connected (Total: ${connectedClients})`);

//   // Authenticate the user
//   const user = authenticateWebSocket(req);

//   await redis.set("test", "hello");
//   const value = await redis.get("test");
//   console.log(value);

//   if (user) {
//     // Assign user info to the WebSocket connection
//     ws.userId = user._id;
//     ws.userRole = user.role;
//     ws.userName = user.name;
//     ws.isAuthenticated = true;
//     onlineClients.set(user._id.toString(), ws);

//     if (!onlineClients.has(user._id.toString())) {
//       onlineClients.set(user._id.toString(), []);
//     }
//     onlineClients.get(user._id.toString()).push(ws);

//     await markUserOnline(user._id);

//     broadcastToAll(wss, {
//       type: "USER_ONLINE",
//       userId: user._id,
//       name: user.name,
//       timestamp: new Date().toISOString(),
//     });

//     console.log(`🟢 ${user.name} is now ONLINE`);

//     console.log(
//       `👤 User authenticated: ${user.name} (${user.role}) - ID: ${user._id}`
//     );
//   } else {
//     // Default to guest if authentication fails
//     ws.userRole = "guest";
//     ws.isAuthenticated = false;
//     console.log("👤 Guest connected (unauthenticated)");
//   }

//   // Send welcome message
//   ws.send(
//     JSON.stringify({
//       type: "CONNECTION_SUCCESS",
//       message: user
//         ? `Welcome back, ${user.name}!`
//         : "Connected as guest. Please login for full features.",
//       isAuthenticated: ws.isAuthenticated,
//       role: ws.userRole,
//       timestamp: new Date().toISOString(),
//     })
//   );

//   // Send recent notifications to authenticated users
//   if (ws.isAuthenticated && ws.userId) {
//     try {
//       const notifications = await Notification.find({
//         $or: [{ isGlobal: true }, { userIds: ws.userId }],
//       })
//         .sort({ createdAt: -1 })
//         .limit(50);

//       if (notifications.length > 0) {
//         ws.send(
//           JSON.stringify({
//             type: "NOTIFICATION_HISTORY",
//             count: notifications.length,
//             notifications: notifications,
//             timestamp: new Date().toISOString(),
//           })
//         );
//         console.log(`📨 Sent ${notifications.length} notifications to user`);
//       }
//     } catch (error) {
//       console.error("❌ Error fetching notifications:", error.message);
//     }
//   }

//   // Handle incoming messages from client
//   ws.on("message", async (message) => {
//     try {
//       const data = JSON.parse(message.toString());
//       console.log(`📨 Received from client:`, data);

//       switch (data.type) {
//         case "PING":
//           if (ws.userId) {
//             await refreshUserPresence(ws.userId);
//           }
//           ws.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
//           break;

//         case "SUBSCRIBE":
//           // Client can subscribe to specific channels
//           if (data.channel) {
//             ws.subscribedChannels = ws.subscribedChannels || new Set();
//             ws.subscribedChannels.add(data.channel);
//             ws.send(
//               JSON.stringify({
//                 type: "SUBSCRIBED",
//                 channel: data.channel,
//                 message: `Subscribed to ${data.channel}`,
//               })
//             );
//           }
//           break;

//         case "UNSUBSCRIBE":
//           if (data.channel && ws.subscribedChannels) {
//             ws.subscribedChannels.delete(data.channel);
//             ws.send(
//               JSON.stringify({
//                 type: "UNSUBSCRIBED",
//                 channel: data.channel,
//                 message: `Unsubscribed from ${data.channel}`,
//               })
//             );
//           }
//           break;

//         default:
//           console.log("Unknown message type:", data.type);
//       }
//     } catch (error) {
//       console.error("❌ Error processing WebSocket message:", error.message);
//       ws.send(
//         JSON.stringify({
//           type: "ERROR",
//           message: "Invalid message format",
//         })
//       );
//     }
//   });

//   // Handle connection errors
//   ws.on("error", (error) => {
//     console.error("❌ WebSocket error:", error.message);
//   });

//   // Handle disconnection
//   ws.on("close", async (code, reason) => {
//     connectedClients--;
//     if (ws.userId) {
//       await markUserOffline(ws.userId);
//       onlineClients.delete(ws.userId.toString());
//       broadcastToAll(wss, {
//         type: "USER_OFFLINE",
//         userId: ws.userId,
//         timestamp: new Date().toISOString(),
//       });

//       console.log(`🔴 User ${ws.userName} is now OFFLINE`);
//     }
//   });
// });

// const heartbeatInterval = setInterval(() => {
//   wss.clients.forEach((ws) => {
//     if (ws.isAlive === false) {
//       console.log("💀 Terminating inactive WebSocket connection");
//       return ws.terminate();
//     }

//     ws.isAlive = false;
//     ws.ping();
//     async (notification) => {
//       // 1️⃣ Send to online users via WebSocket
//       wss.clients.forEach((ws) => {
//         if (ws.readyState === ws.OPEN) {
//           ws.send(JSON.stringify(notification));
//         }
//       });

//       // 2️⃣ Send push notifications to allowed users
//       await sendPushNotificationToAllowedUsers({
//         title: notification.title,
//         message: notification.message,
//         url: notification.url,
//       });
//     };
//   });
// }, 30000);

// wss.on("close", () => {
//   clearInterval(heartbeatInterval);
// });

// // Connect to MongoDB first, then start server
// (async () => {
//   try {
//     await connectDB();
//     connectCloudinary();

//     app.use(cors());
//     app.post(
//       "/api/stripe/webhook",
//       express.raw({ type: "application/json" }),
//       stripeWebhook
//     );

//     app.use(express.json());

//     app.get("/", (req, res) => res.send("API Working"));

//     app.get("/api/ws-status", (req, res) => {
//       res.json({
//         success: true,
//         connectedClients: wss.clients.size,
//         timestamp: new Date().toISOString(),
//       });
//     });

//     app.use("/api/stripe", stripeRouter);
//     app.use("/api/user", userRoute);
//     app.use("/api/admin", adminRoute);
//     app.use("/api/product", productRoute);
//     app.use("/api/category", CategoryRouter);
//     app.use("/api/order", orderRouter);
//     app.use("/api/notify", noficationRouter);
//     app.use("/api/presence", presenceRoutes);
//     app.use("/api/push", pushNotificatonRouter);

//     Sentry.setupExpressErrorHandler(app);

//     server.listen(PORT, () => {
//       console.log(`🚀 Server running on port ${PORT}`);
//       console.log(`📡 HTTP API: http://localhost:${PORT}`);
//       console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
//     });
//   } catch (error) {
//     console.error("❌ Failed to start server:", error);
//     process.exit(1);
//   }
// })();

// server.js
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
import { markUserOffline, markUserOnline } from "./utils/presence.js";
import { redis } from "./config/redis.js";
import presenceRoutes from "./routes/presenceRoutes.js";
import pushNotificatonRouter from "./routes/pushNotification.js";
import currencyRouter from "./routes/currencyRoute.js";
// (We would also need to update this import if pushNotification.js is renamed)

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
    timezone: "Etc/UTC", // Use a consistent timezone like UTC
  }
);

// Redis test runs once on startup, not on every connection
(async () => {
  const test = await redis.set("test", "hello");
  const value = await redis.get("test");
  console.log("Redis test value:", value); // should print "hello"
})();

wss.on("connection", async (ws, req) => {
  ws.isAlive = true;
  connectedClients++;
  console.log(`✅ New WebSocket client connected (Total: ${connectedClients})`);

  // Authenticate the user
  const user = authenticateWebSocket(req);

  // --- FIX 4: Removed redundant Redis test from this block ---

  if (user) {
    // Assign user info to the WebSocket connection
    ws.userId = user._id;
    ws.userRole = user.role;
    ws.userName = user.name;
    ws.isAuthenticated = true;

    // --- FIX 1 (Helper): Store all connections for a user (e.g., multiple tabs) ---
    const userIdStr = user._id.toString();
    if (!onlineClients.has(userIdStr)) {
      onlineClients.set(userIdStr, []); // Initialize as an array
    }
    onlineClients.get(userIdStr).push(ws); // Add this specific connection

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

        // ... (other cases)

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

  // --- FIX 1: Corrected disconnect logic ---
  ws.on("close", async (code, reason) => {
    connectedClients--;
    if (ws.userId) {
      const userIdStr = ws.userId.toString();
      const userConnections = onlineClients.get(userIdStr) || [];

      // Filter out the connection that just closed
      const remainingConnections = userConnections.filter(
        (client) => client !== ws
      );

      if (remainingConnections.length > 0) {
        // User still has other connections open (e.g., other tabs)
        onlineClients.set(userIdStr, remainingConnections);
        console.log(
          `🔌 User ${ws.userName} closed one connection, ${remainingConnections.length} remaining.`
        );
      } else {
        // This was the user's last connection
        onlineClients.delete(userIdStr);
        await markUserOffline(ws.userId); // Now mark as offline in Redis

        broadcastToAll(wss, {
          type: "USER_OFFLINE",
          userId: ws.userId,
          timestamp: new Date().toISOString(),
        });
        console.log(`🔴 User ${ws.userName} is now OFFLINE`);
      }
    } else {
      console.log("👻 Guest connection closed");
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

    // --- FIX 2: Removed broken, non-functional async block that was here ---
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
