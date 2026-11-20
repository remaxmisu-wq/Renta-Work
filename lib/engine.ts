// Motor de cálculo de Renta Work. Funciones puras, sin base de datos.
//
// Convención: interés simple = capital × tasa × días reales / 365.
// Cada posición liquida cada 6 meses desde su propia fecha de activación.
// Se liquida el importe truncado al centavo; la fracción queda en `carry`.

import { addMonths, daysBetween, minDate, type ISODate } from "./dates";
import { Decimal, centsToDecimal, floorCents, roundCents, TOKEN_CENTS } from "./money";

export const SETTLEMENT_MONTHS = 6;

export interface PositionState {
  outstandingCents: number; // capital pendiente
  rateBps: number; // 1200 = 12 %
  activationDate: ISODate;
  maturityDate: ISODate | null;
  settlementsCount: number; // liquidaciones ya hechas
  accrualFrom: ISODate; // desde cuándo se devenga sobre el capital actual
  carry: string; // interés devengado y no liquidado anterior a accrualFrom (USD, alta precisión)
}

/** Interés de un tramo, en USD con precisión completa. */
export function accrueUsd(outstandingCents: number, rateBps: number, from: ISODate, to: ISODate): Decimal {
  const days = Math.max(0, daysBetween(from, to));
  if (days === 0 || outstandingCents <= 0) return new Decimal(0);
  return centsToDecimal(outstandingCents).mul(rateBps).div(10_000).mul(days).div(365);
}

/** Fecha en que termina el período n (0 = primero). Respeta el vencimiento. */
export function periodEnd(p: Pick<PositionState, "activationDate" | "maturityDate">, n: number): ISODate {
  const end = addMonths(p.activationDate, SETTLEMENT_MONTHS * (n + 1));
  return p.maturityDate ? minDate(end, p.maturityDate) : end;
}

/** Próxima liquidación, o null si ya no quedan (vencida y liquidada). */
export function nextSettlementDate(p: PositionState): ISODate | null {
  if (p.maturityDate && p.accrualFrom >= p.maturityDate && p.settlementsCount > 0) {
    const lastEnd = periodEnd(p, p.settlementsCount - 1);
    if (lastEnd >= p.maturityDate) return null;
  }
  return periodEnd(p, p.settlementsCount);
}

/** Interés en curso (generado, no liquidado) a una fecha. */
export function accruedToDate(p: PositionState, asOf: ISODate): Decimal {
  let to = asOf;
  if (p.maturityDate) to = minDate(to, p.maturityDate);
  return new Decimal(p.carry).add(accrueUsd(p.outstandingCents, p.rateBps, p.accrualFrom, to));
}

export interface Settlement {
  periodIndex: number; // 0-based
  periodStart: ISODate;
  periodEnd: ISODate;
  amountCents: number;
  exactUsd: string;
  final: boolean; // al vencimiento
}

/**
 * Liquida todos los períodos vencidos hasta `asOf` (inclusive).
 * Devuelve las liquidaciones y el nuevo estado de la posición.
 */
export function settleDue(p: PositionState, asOf: ISODate): { settlements: Settlement[]; state: PositionState } {
  const settlements: Settlement[] = [];
  let s = { ...p };
  for (let guard = 0; guard < 1000; guard++) {
    const end = nextSettlementDate(s);
    if (!end || end > asOf) break;
    const start = s.settlementsCount === 0 ? s.activationDate : periodEnd(s, s.settlementsCount - 1);
    const exact = new Decimal(s.carry).add(accrueUsd(s.outstandingCents, s.rateBps, s.accrualFrom, end));
    const final = !!s.maturityDate && end >= s.maturityDate;
    const amountCents = final ? roundCents(exact) : floorCents(exact);
    const carry = final ? new Decimal(0) : exact.sub(centsToDecimal(amountCents));
    settlements.push({
      periodIndex: s.settlementsCount,
      periodStart: start,
      periodEnd: end,
      amountCents,
      exactUsd: exact.toString(),
      final,
    });
    s = { ...s, settlementsCount: s.settlementsCount + 1, accrualFrom: end, carry: carry.toString() };
    if (final || (s.outstandingCents === 0 && carry.isZero())) break;
  }
  return { settlements, state: s };
}

/**
 * Cambia el capital pendiente en una fecha (rescate, devolución parcial).
 * Primero devenga lo generado hasta ese día.
 */
export function changeOutstanding(p: PositionState, on: ISODate, newOutstandingCents: number): PositionState {
  const carry = accruedToDate(p, on);
  return { ...p, carry: carry.toString(), accrualFrom: on, outstandingCents: newOutstandingCents };
}

export interface TokenSplit {
  tokens: number;
  amountCents: number;
  remainderCents: number;
  limitedByCap: boolean;
}

/** Cuántos tokens enteros entran en un saldo, limitado opcionalmente por cupo y por un máximo pedido. */
export function splitIntoTokens(
  availableCents: number,
  opts: { capRemainingCents?: number | null; maxTokens?: number } = {},
): TokenSplit {
  const byBalance = Math.floor(Math.max(0, availableCents) / TOKEN_CENTS);
  let tokens = byBalance;
  let limitedByCap = false;
  if (opts.maxTokens !== undefined) tokens = Math.min(tokens, Math.max(0, Math.floor(opts.maxTokens)));
  if (opts.capRemainingCents !== undefined && opts.capRemainingCents !== null) {
    const byCap = Math.floor(Math.max(0, opts.capRemainingCents) / TOKEN_CENTS);
    if (byCap < tokens) {
      tokens = byCap;
      limitedByCap = true;
    }
  }
  const amountCents = tokens * TOKEN_CENTS;
  return { tokens, amountCents, remainderCents: availableCents - amountCents, limitedByCap };
}

/** Barra de próximo token: cuánto del remanente se acumuló hacia el siguiente. */
export function nextTokenProgress(availableCents: number) {
  const fullTokens = Math.floor(Math.max(0, availableCents) / TOKEN_CENTS);
  const towardNext = Math.max(0, availableCents) % TOKEN_CENTS;
  return { fullTokens, towardNextCents: towardNext, missingCents: TOKEN_CENTS - towardNext, ratio: towardNext / TOKEN_CENTS };
}

/** TEA teórica de reinvertir todo cada 6 meses: (1 + TNA/2)² − 1. */
export function theoreticalEffectiveAnnual(rateBps: number): number {
  const r = rateBps / 10_000 / 2;
  return (1 + r) ** 2 - 1;
}

export interface CashFlow {
  date: ISODate;
  amount: number; // + entra al inversor, − sale del inversor
}

/** XIRR (tasa anual efectiva) con Newton y respaldo por bisección. null si no se puede calcular. */
export function xirr(flows: CashFlow[]): number | null {
  const fs = flows.filter((f) => f.amount !== 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (fs.length < 2) return null;
  if (!fs.some((f) => f.amount > 0) || !fs.some((f) => f.amount < 0)) return null;
  const t0 = fs[0].date;
  const ts = fs.map((f) => daysBetween(t0, f.date) / 365);
  if (ts[ts.length - 1] < 30 / 365) return null;
  const npv = (r: number) => fs.reduce((acc, f, i) => acc + f.amount / (1 + r) ** ts[i], 0);
  const dnpv = (r: number) => fs.reduce((acc, f, i) => acc - (ts[i] * f.amount) / (1 + r) ** (ts[i] + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const v = npv(r);
    const d = dnpv(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  // Bisección
  let lo = -0.99;
  let hi = 10;
  let flo = npv(lo);
  if (flo * npv(hi) > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9) return mid;
    if (fm * flo < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** Equivalencia orientativa en m². */
export function m2Equivalent(capitalCents: number, pricePerM2Cents: number): number | null {
  if (!pricePerM2Cents) return null;
  return capitalCents / pricePerM2Cents;
}
