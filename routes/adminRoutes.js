import express from "express";
import { loginAdmin, registerAdmin } from "../controllers/adminController.js";

const adminRoute = express.Router();


adminRoute.post("/register", registerAdmin);

adminRoute.post("/login", loginAdmin);

export default adminRoute