import User from "../models/user.js";
import generateToken from "../utils/generateToken.js";
import validator from "validator";
import bcrypt from "bcrypt";

import { wss } from "../server.js";
import { Notification } from "../models/notification.js";
import jwt from "jsonwebtoken";
import Admin from "../models/admin.js";

const WS_OPEN = 1;

const broadcast = (message, filterFn) => {
  if (!wss.clients) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WS_OPEN && (!filterFn || filterFn(client))) {
      client.send(JSON.stringify(message));
    }
  });
};

export const registerUser = async (req, res) => {
  const { firstName, lastName, email, password, phone, address } = req.body;

  try {
    const missingFields = [];
    if (!firstName) missingFields.push("firstName");
    if (!lastName) missingFields.push("lastName");
    if (!address) missingFields.push("address");
    if (!phone) missingFields.push("phone");
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

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone,
      address,
      role: "shopper",
    });

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    user.refreshToken = refreshToken;

    await user.save();

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const notificationData = {
      type: "NEW_USER_CREATED",
      title: `New User: ${user.firstName} ${user.lastName}`,
      message: "User created successfully",
      relatedId: user._id.toString(),
      user: user._id,
      admin: Admin._id,
    };
    await Notification.create(notificationData);
    const message = {
      ...notificationData,
      timestamp: new Date().toISOString(),
    };
    broadcast(
      message,

      (client) =>
        client.userRole === "admin" ||
        client.userId?.toString() === user._id.toString()
    );
    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role: user.role,
    };

    res.status(201).json({
      success: true,
      user: userResponse,
      accessToken: generateToken(user._id),
      message: "User created successfully",
    });
  } catch (error) {
    console.error("❌ Error registering user:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const accessToken = generateToken(user._id);
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    user.refreshToken = refreshToken;
    await user.save();

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const notificationData = {
      type: "USER_LOGIN",
      title: `User login: ${user.firstName} ${user.lastName}`,
      message: "Logged in successfully",
      relatedId: user._id.toString(),
      user: user._id,
    };
    await Notification.create(notificationData);

    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role: user.role,
    };

  
    res.json({
      success: true,
      user: userResponse, 
      accessToken: accessToken,
      message: "Logged in successfully",
    });
  } catch (error) {
    console.error("❌ Error logging in user:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
