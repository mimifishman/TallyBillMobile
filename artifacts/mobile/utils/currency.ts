const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  ILS: "₪",
  JPY: "¥",
  CAD: "CA$",
  AUD: "A$",
  CHF: "Fr",
  CNY: "¥",
  HKD: "HK$",
  SGD: "S$",
  NZD: "NZ$",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  MXN: "MX$",
  BRL: "R$",
  INR: "₹",
  KRW: "₩",
  ZAR: "R",
  TRY: "₺",
  RUB: "₽",
  PLN: "zł",
  THB: "฿",
  MYR: "RM",
  PHP: "₱",
  SAR: "﷼",
  AED: "د.إ",
  EGP: "E£",
  NGN: "₦",
  CZK: "Kč",
  HUF: "Ft",
  RON: "lei",
  CLP: "CL$",
  COP: "CO$",
  ARS: "AR$",
  IDR: "Rp",
  TWD: "NT$",
  PKR: "₨",
  BDT: "৳",
  VND: "₫",
  UAH: "₴",
  QAR: "﷼",
  KWD: "KD",
  MAD: "MAD",
};

export function getCurrencySymbol(code: string | null | undefined): string {
  if (!code) return "";
  return CURRENCY_SYMBOLS[code] ?? code;
}

/**
 * Format a monetary amount as "<symbol> <grouped amount>" with thousands
 * separators and two decimals, e.g. "$ 1,234.50".
 *
 * Uses the mapped currency symbol plus plain number grouping rather than
 * Intl's `style: "currency"`, because number-style Intl.NumberFormat is
 * reliably supported on Hermes while currency-style / `narrowSymbol` is not.
 * Falls back to a hand-rolled grouping if Intl is unavailable.
 */
export function formatMoney(amount: number, code: string | null | undefined): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const symbol = getCurrencySymbol(code);
  let grouped: string;
  try {
    grouped = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Intl unavailable — group the integer part manually.
    const fixed = n.toFixed(2);
    const [intPart, decPart] = fixed.split(".");
    const sign = intPart!.startsWith("-") ? "-" : "";
    const digits = sign ? intPart!.slice(1) : intPart!;
    const withSep = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    grouped = `${sign}${withSep}.${decPart}`;
  }
  return `${symbol ? `${symbol} ` : ""}${grouped}`;
}
