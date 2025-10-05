import jwt from "jsonwebtoken";
import User from "../model/user.js";
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
    req.user = await Admin.findById(decoded.id).select("-password");
    next();
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
