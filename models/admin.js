import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, default: "sales" },
    refreshToken: { type: String, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

adminSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;
