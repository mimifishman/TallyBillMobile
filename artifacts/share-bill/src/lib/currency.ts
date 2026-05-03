const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", ILS: "₪", JPY: "¥", CAD: "CA$", AUD: "A$",
  CHF: "Fr", CNY: "¥", HKD: "HK$", SGD: "S$", NZD: "NZ$", SEK: "kr",
  NOK: "kr", DKK: "kr", MXN: "MX$", BRL: "R$", INR: "₹", KRW: "₩",
  ZAR: "R", TRY: "₺", RUB: "₽", PLN: "zł", THB: "฿", MYR: "RM", PHP: "₱",
  SAR: "﷼", AED: "د.إ", EGP: "E£", NGN: "₦", CZK: "Kč", HUF: "Ft",
  RON: "lei", CLP: "CL$", COP: "CO$", ARS: "AR$", IDR: "Rp", TWD: "NT$",
  PKR: "₨", BDT: "৳", VND: "₫", UAH: "₴", QAR: "﷼", KWD: "KD", MAD: "MAD",
};

export function getCurrencySymbol(code: string | null | undefined): string {
  if (!code) return "";
  return CURRENCY_SYMBOLS[code] ?? code;
}

export function formatMoney(n: number, currency: string | null | undefined): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol ? `${symbol} ` : ""}${n.toFixed(2)}`;
}

export const PEOPLE_COLORS = [
  "#E84393", "#FF6B35", "#2D9CDB", "#9B59B6",
  "#27AE60", "#F39C12", "#E74C3C", "#1ABC9C",
];

export const CURRENCY_OPTIONS = [
  "USD", "EUR", "GBP", "ILS", "JPY", "CAD", "AUD", "CHF", "CNY", "HKD",
  "SGD", "NZD", "SEK", "NOK", "DKK", "MXN", "BRL", "INR", "KRW", "ZAR",
  "TRY", "PLN", "THB", "MYR", "PHP", "AED", "SAR",
];
