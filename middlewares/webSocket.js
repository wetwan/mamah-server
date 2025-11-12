import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Admin from "../models/admin.js";

/**
 * Authenticates WebSocket connections using JWT token from query params or cookies
 * @param {Object} req - HTTP request object from WebSocket handshake
 * @returns {Object|null} - User object with _id and role, or null if authentication fails
 */
export const authenticateWebSocket = async (req) => {
  try {
    let token = null;

    // Method 1: Extract token from query string (e.g., ws://localhost:5000?token=abc123)
    const url = new URL(req.url, `http://${req.headers.host}`);
    token = url.searchParams.get("token");

    // Method 2: Extract token from cookies (if available)
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(";").reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split("=");
        acc[key] = value;
        return acc;
      }, {});
      token = cookies.token || cookies.authToken; // Adjust cookie name as needed
    }

    // Method 3: Extract token from Authorization header
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      console.log("⚠️ No token found in WebSocket connection request");
      return null;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      console.log("⚠️ Invalid token structure");
      return null;
    }

    // Attempt to find user in User collection
    let user = await User.findById(decoded.id).select("-password");

    // If not found, try Admin collection
    if (!user) {
      user = await Admin.findById(decoded.id).select("-password");
    }

    if (!user) {
      console.log("⚠️ User not found for token");
      return null;
    }

    // Return user with essential info
    return {
      _id: user._id,
      role: user.role || "user",
      email: user.email,
      name: user.name,
    };
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      console.error("❌ Invalid JWT token:", error.message);
    } else if (error.name === "TokenExpiredError") {
      console.error("❌ JWT token expired:", error.message);
    } else {
      console.error("❌ WebSocket authentication error:", error.message);
    }
    return null;
  }
};

/**
 * Middleware to check if WebSocket client has admin role
 * @param {Object} ws - WebSocket client object
 * @returns {boolean} - True if admin, false otherwise
 */
export const isWSAdmin = (ws) => {
  return ws.userRole === "admin";
};

/**
 * Middleware to check if WebSocket client has sales role
 * @param {Object} ws - WebSocket client object
 * @returns {boolean} - True if sales, false otherwise
 */
export const isWSSales = (ws) => {
  return ws.userRole === "sales";
};

/**
 * Middleware to check if WebSocket client has admin or sales role
 * @param {Object} ws - WebSocket client object
 * @returns {boolean} - True if admin or sales, false otherwise
 */
export const isWSAdminOrSales = (ws) => {
  return ws.userRole === "admin" || ws.userRole === "sales";
};

/**
 * Send message to specific user via WebSocket
 * @param {WebSocketServer} wss - WebSocket server instance
 * @param {string} userId - Target user ID
 * @param {Object} message - Message object to send
 */
export const sendToUser = (wss, userId, message) => {
  const messageStr = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (
      client.readyState === 1 && // WebSocket.OPEN
      client.userId?.toString() === userId.toString()
    ) {
      client.send(messageStr);
    }
  });
};

/**
 * Broadcast message to all admins and sales staff
 * @param {WebSocketServer} wss - WebSocket server instance
 * @param {Object} message - Message object to send
 */
export const broadcastToStaff = (wss, message) => {
  const messageStr = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (
      client.readyState === 1 &&
      (client.userRole === "admin" || client.userRole === "sales")
    ) {
      client.send(messageStr);
    }
  });
};

/**
 * Broadcast message to all connected clients
 * @param {WebSocketServer} wss - WebSocket server instance
 * @param {Object} message - Message object to send
 */
export const broadcastToAll = (wss, message) => {
  const messageStr = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(messageStr);
    }
  });
};