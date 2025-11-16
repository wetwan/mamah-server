import axios from "axios";
import currency from "currency.js";
import currencySymbol from "currency-symbol-map"; // FIX: correct import
import countryToCurrency from "country-to-currency";

let cachedRates = null;
let lastRateFetch = 0;
const RATE_TTL = 60 * 60 * 1000; // 1 hour

let geoCache = new Map(); // ip → countryCode
const GEO_TTL = 1000 * 60 * 10; // 10 minutes

const getCurrencyCode = (country) => {
  const map = {
    NG: "NGN",
    US: "USD",
    GB: "GBP",
    CA: "CAD",
    KE: "KES",
    GH: "GHS",
    DE: "EUR",
    FR: "EUR",
    NL: "EUR",
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

  const { data } = await axios.get(`https://ipapi.co/${ip}/json/`);
  const country = data?.country || "NG";

  geoCache.set(ip, { country, time: Date.now() });

  return country;
};

export const getPrice = async (req, res) => {
  try {
    const price = Number(req.params.price || req.query.price);
    if (!price) return res.status(400).json({ error: "Invalid price" });

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip;

    const countryCode = await getCountry(ip);
    const currencyCode = getCurrencyCode(countryCode);

    const rates = await getRates();
    const rate = rates[currencyCode] || 1;

    const converted = currency(price).multiply(rate).value;
    const symbol = currencySymbol(currencyCode) || "";

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
    });
  } catch (err) {
    console.error("Error converting price:", err.message);
    res.status(500).json({ success: false, message: "Conversion failed" });
  }
};
