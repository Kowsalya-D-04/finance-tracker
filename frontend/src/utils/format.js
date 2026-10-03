// Formatting helpers shared by all pages.

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const CURRENCIES = [
  { code: "INR", label: "Indian Rupee (₹)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "AED", label: "UAE Dirham (AED)" },
  { code: "SGD", label: "Singapore Dollar (S$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "CAD", label: "Canadian Dollar (C$)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
];

export const PAYMENT_METHODS = ["Cash", "UPI", "Credit Card", "Debit Card", "Bank Transfer", "Wallet", "Other"];

const formatters = {};

// INR uses Indian digit grouping (₹1,00,000); other currencies use their own locale.
const SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "AED ", SGD: "S$", AUD: "A$", CAD: "C$", JPY: "¥" };

// Short axis labels: ₹1.2L / ₹3Cr for rupees (lakh, crore), $12k / $1.5M for other currencies.
function compactMoney(value, currency) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sym = SYMBOLS[currency] || `${currency} `;
  const trim = (x) => String(Number(x.toFixed(1)));
  const units = currency === "INR"
    ? [[1e7, "Cr"], [1e5, "L"], [1e3, "k"]]
    : [[1e9, "B"], [1e6, "M"], [1e3, "k"]];
  for (const [size, label] of units) {
    if (abs >= size) return `${n < 0 ? "-" : ""}${sym}${trim(abs / size)}${label}`;
  }
  return `${n < 0 ? "-" : ""}${sym}${trim(abs)}`;
}

export function formatMoney(value, currency = "INR", { compact = false, decimals } = {}) {
  if (compact) return compactMoney(value, currency);
  const key = `${currency}-${compact}-${decimals}`;
  if (!formatters[key]) {
    formatters[key] = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: decimals ?? (compact ? 1 : 2),
      minimumFractionDigits: decimals ?? (compact ? 0 : 0),
    });
  }
  return formatters[key].format(Number(value) || 0);
}

export function formatDate(value, opts = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!value) return "—";
  const d = typeof value === "string" && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleDateString("en-IN", opts);
}

export function timeAgo(iso) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [name, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function monthOptions() {
  return MONTHS.map((name, i) => ({ value: i + 1, label: name }));
}

export function yearOptions(span = 4) {
  const y = new Date().getFullYear();
  return Array.from({ length: span * 2 + 1 }, (_, i) => y - span + i);
}

// Pull the readable message out of an Axios error.
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!err?.response) return "Cannot reach the server. Check that the backend is running on port 5000.";
  return err.response.data?.message || fallback;
}

export function fieldErrors(err) {
  return err?.response?.data?.errors || {};
}
