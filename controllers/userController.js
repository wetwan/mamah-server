import User from "../models/user.js";
import generateToken from "../utils/generateToken.js";
import validator from "validator";
import bcrypt from "bcrypt";

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

    // Validate email
    if (!validator.isEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter a valid email" });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone,
      address,
    });

    await user.save();

    res.status(201).json({
      success: true,
      user,
      token: generateToken(user._id), // ✅ issue token after registration
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

    res.json({
      success: true,
      user,
      token: generateToken(user._id),
      message: "Logged in successfully",
    });
  } catch (error) {
    console.error("❌ Error logging in user:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
