import axios from "axios";
import currency from "currency.js";
import currencySymbol from "currency-symbol-map";
import { redis } from "../config/redis.js";

let cachedRates = null;
let lastRateFetch = 0;
const RATE_TTL = 60 * 60 * 1000;
const RATE_TTL_SEC = 3600;

let geoCache = new Map();
const GEO_TTL = 1000 * 60 * 10;
const MAX_GEO_CACHE_SIZE = 1000;

const RATE_KEY = "exchange_rates_ngn";

export const fetchRatesWithCache = async () => {

    try {
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

export const getCurrencyCode = (country) => {
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

export const getRates = async () => {
  const now = Date.now();
  const expired = now - lastRateFetch > RATE_TTL;

  if (!cachedRates || expired) {
    cachedRates = await fetchRatesWithCache();
    lastRateFetch = now;
  }

  return cachedRates;
};

export const getCountry = async (ip) => {
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

export const getClientIP = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "127.0.0.1"
  );
};

export function convertPrice(priceInNGN, exchangeRate, symbol) {
  const converted = priceInNGN * exchangeRate;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(converted);

  return {
    raw: converted,
    formatted: `${symbol}${formatted}`,
  };
}

export function createCurrencyObject(
  currencyInfo,
  itemsPrice,
  shippingPrice,
  taxPrice,
  totalPrice
) {
  return {
    code: currencyInfo.currency,
    symbol: currencyInfo.symbol,
    exchangeRate: currencyInfo.exchangeRate,
    country: currencyInfo.country,
    convertedItemsPrice: itemsPrice * currencyInfo.exchangeRate,
    convertedShippingPrice: shippingPrice * currencyInfo.exchangeRate,
    convertedTaxPrice: taxPrice * currencyInfo.exchangeRate,
    convertedTotalPrice: totalPrice * currencyInfo.exchangeRate,
  };
}

const convertSinglePrice = (price, rate, symbol, currencyCode) => {
  const converted = currency(price).multiply(rate).value;
  const formatted = currency(converted, {
    symbol,
    precision: 2,
  }).format();

  return {
    raw: converted,
    formatted,
  };
};

export const getPrice = async (req, res) => {
  try {
    const price = Number(req.params.price || req.query.price);
    if (!price) return res.status(400).json({ error: "Invalid price" });

    const ip = getClientIP(req);

    const countryCode = await getCountry(ip);
    const currencyCode = getCurrencyCode(countryCode);

    const rates = await getRates();
    const rate = rates[currencyCode] || 1;

    const symbol = currencySymbol(currencyCode) || currencyCode;
    const { raw, formatted } = convertSinglePrice(
      price,
      rate,
      symbol,
      currencyCode
    );

    return res.json({
      success: true,
      country: countryCode,
      currency: currencyCode,
      symbol,
      raw,
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

export const getPrices = async (req, res) => {
  try {
    const { prices } = req.body;

    if (!Array.isArray(prices) || prices.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid input. Expected array of prices.",
      });
    }

    if (prices.length > 100) {
      return res.status(400).json({
        success: false,
        error: "Maximum 100 prices per request.",
      });
    }

    // Validate all prices
    const validPrices = prices.every((p) => !isNaN(Number(p)) && Number(p) > 0);
    if (!validPrices) {
      return res.status(400).json({
        success: false,
        error: "All prices must be positive numbers.",
      });
    }

    const ip = getClientIP(req);
    const countryCode = await getCountry(ip);
    const currencyCode = getCurrencyCode(countryCode);

    const rates = await getRates();
    const rate = rates[currencyCode] || 1;
    const symbol = currencySymbol(currencyCode) || currencyCode;

    // Convert all prices
    const convertedPrices = prices.map((price) => {
      const numPrice = Number(price);
      const { raw, formatted } = convertSinglePrice(
        numPrice,
        rate,
        symbol,
        currencyCode
      );

      return {
        original: numPrice,
        converted: raw,
        formatted,
      };
    });

    return res.json({
      success: true,
      country: countryCode,
      currency: currencyCode,
      symbol,
      exchangeRate: rate,
      originalCurrency: "NGN",
      prices: convertedPrices,
      count: convertedPrices.length,
    });
  } catch (err) {
    console.error("Error converting prices:", err.message);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Batch conversion failed",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  }
};

export const getExchangeRate = async (req, res) => {
  try {
    const ip = getClientIP(req);
    const countryCode = await getCountry(ip);
    const currencyCode = getCurrencyCode(countryCode);

    const rates = await getRates();
    const rate = rates[currencyCode] || 1;
    const symbol = currencySymbol(currencyCode) || currencyCode;

    return res.json({
      success: true,
      country: countryCode,
      currency: currencyCode,
      symbol,
      rate,
      baseCurrency: "NGN",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error fetching exchange rate:", err.message);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch exchange rate",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  }
};

export const cleanup = async () => {
  geoCache.clear();
  cachedRates = null;

  try {
    await redis.quit();
    console.log("Redis connection closed");
  } catch (err) {
    console.error("Error closing Redis:", err);
  }
};

if (process.env.NODE_ENV !== "test") {
  process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down gracefully...");
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n🛑 Shutting down gracefully...");
    await cleanup();
    process.exit(0);
  });
}
