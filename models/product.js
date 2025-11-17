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
  hex: { type: String, required: false },
  available: { type: Boolean, default: true },
});
const sizeSchema = new mongoose.Schema({
  name: { type: String, required: true },
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
    sizes: [sizeSchema],
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

// formatted price
productSchema.methods.formatPrice = function (amount) {
  const symbol = this.currency?.symbol || "₦";
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${symbol}${formatted}`;
};

productSchema.methods.getDisplayPrice = function (
  exchangeRate = 1,
  symbol = "₦",
  currencyCode = "NGN"
) {
  const isNGN = currencyCode === "NGN";
  const basePrice = this.price;
  const finalPrice = this.finalPrice;

  const convertedBase = isNGN ? basePrice : basePrice * exchangeRate;
  const convertedFinal = isNGN ? finalPrice : finalPrice * exchangeRate;

  return {
    currency: currencyCode,
    symbol: symbol,

    // Prices in target currency
    price: convertedBase,
    finalPrice: convertedFinal,
    savings: convertedBase - convertedFinal,

    // Original NGN prices (for reference)
    originalPrice: basePrice,
    originalFinalPrice: finalPrice,

    // Formatted strings
    formatted: this.formatPrice(convertedFinal, symbol, currencyCode),
    formattedOriginal: isNGN ? null : `₦${finalPrice.toFixed(2)}`,
    formattedBased: isNGN ? null : `₦${price.toFixed(2)}`,

    // Exchange rate
    exchangeRate: exchangeRate,

    // Discount info
    hasDiscount: this.discount > 0,
    discountPercent: this.discount,
  };
};

productSchema.methods.toCurrency = function (currencyInfo) {
  const { currency, symbol, exchangeRate } = currencyInfo;

  return {
    ...this.toObject(),
    displayPrice: this.getDisplayPrice(exchangeRate, symbol, currency),
  };
};

productSchema.statics.convertToCurrency = function (products, currencyInfo) {
  return products.map((product) => {
    const productObj = product.toObject ? product.toObject() : product;
    const displayPrice = product.getDisplayPrice(
      currencyInfo.exchangeRate,
      currencyInfo.symbol,
      currencyInfo.currency
    );

    return {
      ...productObj,
      displayPrice,
    };
  });
};

productSchema.index({ category: 1, price: 1 });
productSchema.index({ name: "text", description: "text" });
productSchema.index({ averageRating: -1 });
productSchema.index({ createdAt: -1 });

const Product = mongoose.model("Product", productSchema);
export default Product;
