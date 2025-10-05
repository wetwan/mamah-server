import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  password: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, default: "sales" },
});

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;
