import dotenv from "dotenv";

dotenv.config();

// Get the secret key from environment variables
const CRON_SECRET = process.env.CRON_JOB_SECRET_KEY;

/**
 * Middleware to authenticate requests coming from the scheduled cron job.
 * It checks for a match with the secret key in the 'X-Cron-Secret' header.
 * If the key is missing or invalid, it returns a 401 Unauthorized response.
 */
export const protectCron = (req, res, next) => {
  // 1. Get the secret key from a custom request header
  const providedSecret = req.header("X-Cron-Secret");

  // 2. Perform a simple, secure comparison
  // Ensure the environment variable is set and the provided key matches
  if (!CRON_SECRET) {
    console.error("CRON_JOB_SECRET_KEY is not set in environment variables!");
    return res.status(500).json({ 
        success: false, 
        message: "Server Configuration Error: Cleanup key is missing." 
    });
  }

  // Use simple string comparison for this type of API key
  if (providedSecret === CRON_SECRET) {
    // Authentication successful, proceed to the controller
    next();
  } else {
    // Authentication failed
    console.warn("Unauthorized attempt to hit cleanup endpoint.");
    return res.status(401).json({ 
        success: false, 
        message: "Unauthorized: Invalid or missing cron secret key." 
    });
  }
};