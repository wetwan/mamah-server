// import "./config/instrumental.js";
// import connectCloudinary from "./config/cloudinary.js";
// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import connectDB from "./config/db.js";
// import * as Sentry from "@sentry/node";
// import userRoute from "./routes/userRoutes.js";
// import adminRoute from "./routes/adminRoutes.js";
// import productRoute from "./routes/productRoutes.js";
// import CategoryRouter from "./routes/categoryRoutes.js";
// import orderRouter from "./routes/orderRoute.js";
// import { stripeWebhook } from "./controllers/stripeWebhook.js"; // Assuming this is now the correct import path for the controller
// import stripeRouter from "./routes/stripeRoute.js";

// dotenv.config();
// // initialize Express
// const app = express();
// await connectDB();
// connectCloudinary();

// app.use(cors());

// app.post(
//   "/api/stripe/webhook",
//   express.raw({ type: "application/json" }),
//   stripeWebhook
// );

// app.use(express.json());

// app.get("/", (req, res) => res.send("API Working"));

// app.use("/api/stripe", stripeRouter);
// app.use("/api/user", userRoute);
// app.use("/api/admin", adminRoute);
// app.use("/api/product", productRoute);
// app.use("/api/category", CategoryRouter);
// app.use("/api/order", orderRouter);

// const PORT = process.env.PORT || 5000;
// Sentry.setupExpressErrorHandler(app);

// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

import "./config/instrumental.js";
import connectCloudinary from "./config/cloudinary.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import * as Sentry from "@sentry/node";

import userRoute from "./routes/userRoutes.js";
import adminRoute from "./routes/adminRoutes.js";
import productRoute from "./routes/productRoutes.js";
import CategoryRouter from "./routes/categoryRoutes.js";
import orderRouter from "./routes/orderRoute.js";
import { stripeWebhook } from "./controllers/stripeWebhook.js";
import stripeRouter from "./routes/stripeRoute.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB first, then start server
(async () => {
  try {
    await connectDB();
    connectCloudinary();

    app.use(cors());
    app.post(
      "/api/stripe/webhook",
      express.raw({ type: "application/json" }),
      stripeWebhook
    );

    app.use(express.json());

    app.get("/", (req, res) => res.send("API Working"));
    app.use("/api/stripe", stripeRouter);
    app.use("/api/user", userRoute);
    app.use("/api/admin", adminRoute);
    app.use("/api/product", productRoute);
    app.use("/api/category", CategoryRouter);
    app.use("/api/order", orderRouter);

    Sentry.setupExpressErrorHandler(app);

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
})();
