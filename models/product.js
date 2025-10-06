import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    rating: {
      type: Number,
      required: true,
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    comment: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

const colorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  hex: { type: String, required: false }, // optional hex color
  available: { type: Boolean, default: true },
});

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    images: {
      type: [String],
      required: [true, "At least one image is required"],
    },
    colors: [colorSchema],
    sizes: [String],
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0, // percentage discount
      min: [0, "Discount cannot be negative"],
      max: [100, "Discount cannot exceed 100"],
    },
    category: {
      type: String,
      required: [true, "Product category is required"],
      trim: true,
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },

    postedby: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    reviews: [reviewSchema],
    averageRating: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be negative"],
      max: [5, "Rating cannot exceed 5"],
    },
    numOfReviews: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ✅ Virtual for discounted price
productSchema.virtual("finalPrice").get(function () {
  return this.discount > 0
    ? Math.round(this.price * (1 - this.discount / 100))
    : this.price;
});

// ✅ Virtual for stock status
productSchema.virtual("inStock").get(function () {
  return this.stock > 0;
});

// ✅ Automatically calculate average rating and review count
productSchema.pre("save", function (next) {
  if (this.reviews.length > 0) {
    const avg =
      this.reviews.reduce((sum, r) => sum + r.rating, 0) / this.reviews.length;
    this.averageRating = Math.round(avg * 10) / 10;
    this.numOfReviews = this.reviews.length;
  }
  next();
});

const Product = mongoose.model("Product", productSchema);
export default Product;
