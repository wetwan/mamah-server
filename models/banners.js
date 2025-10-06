import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Banner name is required"],
      trim: true,
      unique: true,
    },
    image: {
      type: String, // URL from Cloudinary or elsewhere
      required: [true, "Banner image is required"],
    },

    link: { String },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// 🔧 Auto-generate slug before saving
bannerSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    // Replace spaces & special characters with hyphens
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // remove invalid chars
      .replace(/\s+/g, "-") // replace spaces with dashes
      .replace(/-+/g, "-"); // collapse multiple dashes
  }
  next();
});

const Banner = mongoose.model("Banner", bannerSchema);

export default Banner;
