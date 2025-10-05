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

dotenv.config();
// initislize Express
const app = express();
await connectDB();
connectCloudinary();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("API Working"));
app.use(express.raw({ type: "application/json" }));

app.use("/api/user", userRoute);
app.use("/api/admin", adminRoute);
app.use("/api/product", productRoute);
app.use("/api/category", CategoryRouter);

const PORT = process.env.PORT || 5000;
Sentry.setupExpressErrorHandler(app);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
