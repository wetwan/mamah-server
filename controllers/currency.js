import axios from "axios";
import currency from "currency.js";
import currencySymbol from "currency-symbol-map";
import countryToCurrency from "country-to-currency";
import { redis } from "../config/redis.js";

let cachedRates = null;
let lastRateFetch = 0;
const RATE_TTL = 60 * 60 * 1000;
const RATE_TTL_SEC = 3600;

let geoCache = new Map();
const GEO_TTL = 1000 * 60 * 10;
const MAX_GEO_CACHE_SIZE = 1000;

const RATE_KEY = "exchange_rates_ngn";

const fetchRatesWithCache = async () => {
  try {
    // Check Redis cache first
    const cached = await redis.get(RATE_KEY);
    if (cached) {
      console.log("📦 Serving rates from Redis cache");
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn("Redis read failed, fetching fresh rates:", err.message);
  }

  const { data } = await axios.get(
    "https://api.exchangerate-api.com/v4/latest/NGN"
  );

  try {
    await redis.set(RATE_KEY, JSON.stringify(data.rates), {
      EX: RATE_TTL_SEC,
    });
  } catch (err) {
    console.warn("Failed to cache rates in Redis:", err.message);
  }

  return data.rates;
};

const getCurrencyCode = (country) => {
  const map = {
    NG: "NGN",
    US: "USD",
    GB: "GBP",
    CA: "CAD",
    AU: "AUD",
    KE: "KES",
    GH: "GHS",
    ZA: "ZAR",
    // European countries using EUR
    DE: "EUR",
    FR: "EUR",
    NL: "EUR",
    IT: "EUR",
    ES: "EUR",
    PT: "EUR",
    IE: "EUR",
    AT: "EUR",
    BE: "EUR",
    FI: "EUR",
    GR: "EUR",
  };
  return map[country] || "USD";
};

const getRates = async () => {
  const now = Date.now();
  const expired = now - lastRateFetch > RATE_TTL;

  if (!cachedRates || expired) {
    const { data } = await axios.get(
      "https://api.exchangerate-api.com/v4/latest/NGN"
    );
    cachedRates = data.rates;
    lastRateFetch = now;
  }

  return cachedRates;
};

const getCountry = async (ip) => {
  if (geoCache.has(ip)) {
    const entry = geoCache.get(ip);
    if (Date.now() - entry.time < GEO_TTL) return entry.country;
  }

  if (geoCache.size >= MAX_GEO_CACHE_SIZE) {
    const keysToDelete = Array.from(geoCache.keys()).slice(0, 100);
    keysToDelete.forEach((key) => geoCache.delete(key));
  }

  try {
    const { data } = await axios.get(`https://ipapi.co/${ip}/json/`);
    const country = data?.country_code || data?.country || "NG";

    geoCache.set(ip, { country, time: Date.now() });

    return country;
  } catch (err) {
    console.error(`Geo lookup failed for ${ip}:`, err.message);
    return "NG"; // Default to Nigeria on error
  }
};

export const getPrice = async (req, res) => {
  try {
    const price = Number(req.params.price || req.query.price);
    if (!price) return res.status(400).json({ error: "Invalid price" });

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.headers["x-real-ip"] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      "127.0.0.1";

    const countryCode = await getCountry(ip);
    const currencyCode = getCurrencyCode(countryCode);

    const rates = await getRates();
    const rate = rates[currencyCode] || 1;

    const converted = currency(price).multiply(rate).value;
    const symbol = currencySymbol(currencyCode) || currencyCode;

    const formatted = currency(converted, {
      symbol,
      precision: 2,
    }).format();

    res.json({
      country: countryCode,
      currency: currencyCode,
      symbol,
      raw: converted,
      formatted,
      originalPrice: price,
      originalCurrency: "NGN",
      exchangeRate: rate,
    });
  } catch (err) {
    console.error("Error converting price:", err.message);
    res.status(500).json({ success: false, message: "Conversion failed" });
  }
};

export const cleanup = async () => {
  geoCache.clear();
  cachedRates = null;
  
  try {
    await redis.quit();
    console.log('Redis connection closed');
  } catch (err) {
    console.error('Error closing Redis:', err);
  }
};

// Graceful shutdown handlers
if (process.env.NODE_ENV !== 'test') {
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await cleanup();
    process.exit(0);
  });
}
