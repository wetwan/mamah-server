import express from "express";
import { isUserOnline } from "../utils/presence.js";


const presenceRoutes = express.Router();

presenceRoutes.get("/:id", async (req, res) => {
  const userId = req.params.id;
  try {
    const online = await isUserOnline(userId);
    res.json({ userId, online });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch presence" });
  }
});

export default presenceRoutes;
