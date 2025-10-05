import Admin from "../models/admin.js";
import generateToken from "../utils/generateToken.js";
import validator from "validator";
import bcrypt from "bcrypt";

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

    // Check if Admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res
        .status(400)
        .json({ success: false, message: "Admin already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create Admin
    const admin = new Admin({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: Admin.role,
    });

    await admin.save();

    res.status(201).json({
      success: true,
      admin,
      token: generateToken(Admin._id), // ✅ issue token after registration
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

    res.json({
      success: true,
      admin,
      token: generateToken(admin._id),
      message: "Logged in successfully",
    });
  } catch (error) {
    console.error("❌ Error logging in admin:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
