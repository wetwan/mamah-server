import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Admin from "../models/admin.js";

export const protectUser = async (req, res, next) => {
  const token = req.headers.token;
  if (!token) {
    return res.json({ success: false, message: "Not authorized, Login again" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SERECT);
    req.user = await User.findById(decoded.id).select("-password");
    next();
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
export const protectAdmin = async (req, res, next) => {
  const token = req.headers.token;
  if (!token) {
    return res.json({ success: false, message: "Not authorized, Login again" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SERECT);
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
    const decoded = jwt.verify(token, process.env.JWT_SERECT);

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
