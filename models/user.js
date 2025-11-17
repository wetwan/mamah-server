import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    country: { type: String },
    state: { type: String },
    poster: { type: String },
    phone: { type: String },
    address: { type: String },
    address2: { type: String },
    password: { type: String, required: true },
    stripeCustomerId: { type: String },
    role: { type: String, default: "shopper" },
    createdAt: { type: Date, default: Date.now },
    refreshToken: { type: String, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

const User = mongoose.model("User", userSchema);
export default User;
