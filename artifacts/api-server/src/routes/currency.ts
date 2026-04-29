import { Router } from "express";

const router = Router();

const CURRENCY_MAP: Record<string, string> = {
  US: "USD", IL: "ILS", GB: "GBP", EU: "EUR", DE: "EUR", FR: "EUR",
  IT: "EUR", ES: "EUR", JP: "JPY", CA: "CAD", AU: "AUD", NZ: "NZD",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", MX: "MXN", BR: "BRL",
  IN: "INR", CN: "CNY", KR: "KRW", SG: "SGD", HK: "HKD", ZA: "ZAR",
  RU: "RUB", TR: "TRY", PL: "PLN", CZ: "CZK", HU: "HUF", TH: "THB",
  MY: "MYR", PH: "PHP", NG: "NGN", EG: "EGP", SA: "SAR", AE: "AED",
};

router.get("/", async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "";
    if (!ip || ip === "127.0.0.1" || ip === "::1") {
      res.json({ currency: "USD", countryCode: "US" });
      return;
    }
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    const data = await response.json() as { countryCode?: string };
    const countryCode = data.countryCode || "US";
    const currency = CURRENCY_MAP[countryCode] || "USD";
    res.json({ currency, countryCode });
  } catch {
    res.json({ currency: "USD", countryCode: "US" });
  }
});

export default router;
