// config/webPush.js
import webPush from "web-push";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error(
    "❌ Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY environment variables."
  );
  process.exit(1);
}

webPush.setVapidDetails(
  process.env.VAPID_MAILTO_EMAIL || "mailto:you@domain.com", // Use a .env variable
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default webPush;