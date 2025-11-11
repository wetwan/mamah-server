import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Admin from "../models/admin.js";

const extractToken = (req) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    return req.headers.authorization.split(" ")[1];
  } else if (req.headers.token) {
    return req.headers.token; // fallback for custom header
  }
  return null;
};

export const protectUser = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.json({ success: false, message: "Not authorized, Login again" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    next();
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const protectAdmin = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.json({ success: false, message: "Not authorized, Login again" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = await Admin.findById(decoded.id).select("-password");
    next();
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const protectAll = async (req, res, next) => {
  try {
    const token = req.headers.token;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Not authorized, please log in" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try to find user or admin
    let user = await User.findById(decoded.id).select("-password");
    let admin = await Admin.findById(decoded.id).select("-password");

    if (!user && !admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied: invalid credentials",
      });
    }
    req.user = user || admin;

    next();
  } catch (error) {
    console.error("Auth Error:", error.message);
    res
      .status(401)
      .json({ success: false, message: "Token invalid or expired" });
  }
};
