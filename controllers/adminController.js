import Admin from "../models/admin.js";
import generateToken from "../utils/generateToken.js";

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
    const Admin = new Admin({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
    });

    await Admin.save();

    res.status(201).json({
      success: true,
      Admin: {
        _id: Admin._id,
        Admin,
      },
      token: generateToken(Admin._id), // ✅ issue token after registration
      message: "Admin created successfully",
    });
  } catch (error) {
    console.error("❌ Error registering Admin:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
