import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export const TOKEN_CENTS = 10_000; // USD 100

/** Centavos → "USD 1.234,56" */
export function usd(cents: number, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const ints = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = String(abs % 100).padStart(2, "0");
  const sign = neg ? "−" : opts.sign && cents > 0 ? "+" : "";
  return `${sign}USD ${ints},${dec}`;
}

/** Decimal en dólares → centavos truncados (hacia abajo). */
export function floorCents(usdAmount: Decimal): number {
  return usdAmount.mul(100).floor().toNumber();
}

export function roundCents(usdAmount: Decimal): number {
  return usdAmount.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function centsToDecimal(cents: number): Decimal {
  return new Decimal(cents).div(100);
}

/** "1.234,56" | "1234.56" | "1234" → centavos. */
export function parseUsdInput(s: string): number | null {
  const clean = s.trim().replace(/\s|USD|\$/gi, "");
  if (!clean) return null;
  let normalized = clean;
  if (clean.includes(",")) normalized = clean.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function pct(bps: number): string {
  const v = bps / 100;
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
