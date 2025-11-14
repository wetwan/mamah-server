import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Admin from "../models/admin.js";

const extractToken = (req) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    return req.headers.authorization.split(" ")[1];
  }

  if (req.headers.token) {
    return req.headers.token;
  }

  return null;
};

export const protectUser = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. Access Token missing.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select(
      "-password -refreshToken"
    ); // Exclude refreshToken from being loaded

    if (!req.user) {
      // 403: Token is valid but the user doesn't exist anymore
      return res.status(403).json({
        success: false,
        message: "Authorization failed: User not found.",
      });
    }

    next();
  } catch (error) {
    console.error("❌ Access Token Error in protectUser:", error.message);
    // 401: Token is invalid (signature mismatch) or expired.
    // The client needs to try refreshing the token.
    return res.status(401).json({
      success: false,
      message: "Access Token invalid or expired.",
      // This is a common pattern to signal client to request a new token
      isExpired: error.name === "TokenExpiredError",
    });
  }
};

export const protectAdmin = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. Access Token missing.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = await Admin.findById(decoded.id).select(
      "-password -refreshToken"
    );

    if (!req.admin) {
      return res.status(403).json({
        success: false,
        message: "Authorization failed: Admin not found.",
      });
    }

    next();
  } catch (error) {
    console.error("❌ Access Token Error in protectAdmin:", error.message);
    return res.status(401).json({
      success: false,
      message: "Access Token invalid or expired.",
      isExpired: error.name === "TokenExpiredError",
    });
  }
};

export const protectAll = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. Access Token missing.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = await User.findById(decoded.id).select(
      "-password -refreshToken"
    );
    let admin = await Admin.findById(decoded.id).select(
      "-password -refreshToken"
    );

    if (!user && !admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Account not found or deleted.",
      });
    }

    req.user = user || admin;

    next();
  } catch (error) {
    console.error("❌ Access Token Error in protectAll:", error.message);
    return res.status(401).json({
      success: false,
      message: "Access Token invalid or expired.",
      isExpired: error.name === "TokenExpiredError",
    });
  }
};
