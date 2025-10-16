import mongoose from "mongoose";

//connectv to mongodb database

const connectDB = async () => {
  try {
    if (mongoose.connection.readyState >= 1) {
      console.log("🟢 Already connected to MongoDB");
      return;
    }
    await mongoose.connect(`${process.env.MONgODB_URL}/mamah`);
    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
  //   mongoose.connection.on("connected", () => console.log("connected"));
};

export default connectDB;
