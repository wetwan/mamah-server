import Admin from "../models/admin.js";
import generateToken from "../utils/generateToken.js";
import validator from "validator";
import bcrypt from "bcrypt";
const WS_OPEN = 1;
import jwt from "jsonwebtoken";
import { wss } from "../server.js";
import { Notification } from "../models/notification.js";

const broadcast = (message, filterFn) => {
  if (!wss.clients) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WS_OPEN && (!filterFn || filterFn(client))) {
      client.send(JSON.stringify(message));
    }
  });
};

export const registerAdmin = async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  try {
    const missingFields = [];
    if (!firstName) missingFields.push("firstName");
    if (!lastName) missingFields.push("lastName");
    if (!email) missingFields.push("email");
    if (!password) missingFields.push("password");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing details: ${missingFields.join(", ")}`,
        missingFields,
      });
    }

    if (!validator.isEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter a valid email" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res
        .status(400)
        .json({ success: false, message: "Admin already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const admin = new Admin({
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    const refreshToken = jwt.sign(
      { id: admin._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    admin.refreshToken = refreshToken;

    await admin.save();
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const notificationData = {
      type: "NEW_USER_CREATED",
      title: `New admin: ${admin.firstName} ${admin.lastName}`,
      message: "Admin created successfully",
      relatedId: admin._id.toString(),
    };
    await Notification.create(notificationData);

    const message = {
      ...notificationData,
      timestamp: new Date().toISOString(),
    };
    broadcast(message, (client) => client.userRole === "admin");

    const adminResponse = {
      _id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      role: admin.role,
    };

    res.status(201).json({
      success: true,
      admin: adminResponse,
      accessToken: generateToken(admin._id),
      message: "Admin created successfully",
    });
  } catch (error) {
    console.error("❌ Error registering Admin:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const accessToken = generateToken(admin._id);
    const refreshToken = jwt.sign(
      { id: admin._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    admin.refreshToken = refreshToken;
    await admin.save();

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const notificationData = {
      type: "USER_LOGIN",
      title: `Admin login: ${admin.firstName} ${admin.lastName}`,
      message: "Logged in successfully",
      relatedId: admin._id.toString(),
    };

    await Notification.create(notificationData);

    const adminResponse = {
      _id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      role: admin.role,
    };

    res.json({
      success: true,
      admin: adminResponse,
      accessToken: accessToken,
      message: "Logged in successfully",
    });
  } catch (error) {
    console.error("❌ Error logging in admin:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
