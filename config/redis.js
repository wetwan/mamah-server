

import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// Check for the correct URL variable name
if (!process.env.UPSTASH_REDIS_URL) {
  console.error("❌ Missing UPSTASH_REDIS_URL environment variable.");
  process.exit(1);
}

// ioredis connects using the full URI
export const redis = new Redis(process.env.UPSTASH_REDIS_URL, {
  // You might still need tls: {} if the URL doesn't configure it,
  // but often the rediss:// prefix handles it. It's safer to keep it.
  tls: {},
});

redis.on("connect", () => console.log("✅ Connected to Upstash Redis"));
redis.on("error", (err) => console.error("❌ Redis Error:", err));
 
