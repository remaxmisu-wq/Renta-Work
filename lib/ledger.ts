// Operaciones de Renta Work sobre la base de datos.
// Toda modificación de saldos pasa por un movimiento persistido y trazable.

import crypto from "node:crypto";
import { getDb, tx } from "./db";
import { addMonths, formatDate, today, type ISODate } from "./dates";
import {
  accruedToDate, changeOutstanding, nextSettlementDate, settleDue, splitIntoTokens, type PositionState,
} from "./engine";
import { Decimal, TOKEN_CENTS, usd } from "./money";

// ───────────────────────── Tipos ─────────────────────────

export type MovementType =
  | "compra_aporte" | "compra_comision" | "saldo_inicial_importado" | "liquidacion" | "reinversion"
  | "cobro_intereses" | "rescate" | "devolucion_capital" | "reverso" | "ajuste";
export type MovementStatus = "pendiente" | "aprobada" | "completada" | "rechazada";

export interface Holder {
  id: number;
  user_id: number | null;
  name: string;
  kind: "token" | "prestamo";
  consent: "ninguno" | "agregado" | "anonimo" | "completo";
  consent_at: string | null;
  auto_reinvest: number;
  is_demo: number;
}

export interface PositionRow {
  id: number;
  holder_id: number;
  emission_id: number | null;
  origin: "aporte" | "comision" | "reinversion" | "saldo_importado";
  tokens: number;
  principal_cents: number;
  outstanding_cents: number;
  rate_bps: number;
  activation_date: string;
  maturity_date: string | null;
  settlements_count: number;
  accrual_from: string;
  carry: string;
  status: "activa" | "vencida" | "cancelada";
  note: string | null;
}

export interface Movement {
  id: number;
  uid: string;
  holder_id: number;
  position_id: number | null;
  type: MovementType;
  status: MovementStatus;
  description: string;
  effective_date: string;
  amount_cents: number;
  tokens: number;
  capital_delta: number;
  tokens_delta: number;
  available_delta: number;
  external_flow: number;
  capital_after: number | null;
  tokens_after: number | null;
  available_after: number | null;
  reference: string | null;
  commission_id: number | null;
  emission_id: number | null;
  reverses_id: number | null;
  idempotency_key: string | null;
  data: string | null;
  notice: string | null;
  created_by: number | null;
  decided_by: number | null;
  decided_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Emission {
  id: number;
  project_id: number | null;
  name: string;
  rate_bps: number;
  term_months: number | null;
  term_status: "propuesta" | "confirmado";
  cap_cents: number | null;
  cap_includes_reinvestments: number;
  early_redemption_terms: string | null;
  exit_terms: string | null;
  open: number;
  is_demo: number;
}

export class RwError extends Error {}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  compra_aporte: "Compra de tokens por aporte",
  compra_comision: "Compra desde comisión",
  saldo_inicial_importado: "Saldo inicial importado",
  liquidacion: "Liquidación de intereses",
  reinversion: "Reinversión",
  cobro_intereses: "Cobro de intereses",
  rescate: "Rescate de tokens",
  devolucion_capital: "Devolución de capital",
  reverso: "Reverso",
  ajuste: "Corrección",
};

export const STATUS_LABELS: Record<MovementStatus, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  completada: "Completada",
  rechazada: "Rechazada",
};

// ───────────────────────── Utilidades ─────────────────────────

export function realOperationsEnabled(): boolean {
  return process.env.OPERACIONES_REALES === "true";
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

function newUid(date: ISODate): string {
  return `RW-${date.replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function audit(actorId: number | null, action: string, entity: string | null, entityId: number | null, data?: unknown) {
  getDb()
    .prepare("INSERT INTO audit_log (actor_id, action, entity, entity_id, data) VALUES (?,?,?,?,?)")
    .run(actorId, action, entity, entityId, data === undefined ? null : JSON.stringify(data));
}

export function getHolder(id: number): Holder {
  const h = getDb().prepare("SELECT * FROM holders WHERE id = ?").get(id) as Holder | undefined;
  if (!h) throw new RwError("Titular inexistente.");
  return h;
}

export function getHolderByUser(userId: number): Holder | undefined {
  return getDb().prepare("SELECT * FROM holders WHERE user_id = ?").get(userId) as Holder | undefined;
}

export function getEmission(id: number): Emission {
  const e = getDb().prepare("SELECT * FROM emissions WHERE id = ?").get(id) as Emission | undefined;
  if (!e) throw new RwError("Emisión inexistente.");
  return e;
}

/** Emisión abierta. Los titulares de demostración operan sólo sobre la emisión de demostración. */
export function currentEmission(demo = false): Emission | undefined {
  return getDb()
    .prepare("SELECT * FROM emissions WHERE open = 1 AND is_demo = ? ORDER BY id DESC LIMIT 1")
    .get(demo ? 1 : 0) as Emission | undefined;
}

export function getMovement(id: number): Movement {
  const m = getDb().prepare("SELECT * FROM movements WHERE id = ?").get(id) as Movement | undefined;
  if (!m) throw new RwError("Movimiento inexistente.");
  return m;
}

function toState(p: PositionRow): PositionState {
  return {
    outstandingCents: p.outstanding_cents,
    rateBps: p.rate_bps,
    activationDate: p.activation_date,
    maturityDate: p.maturity_date,
    settlementsCount: p.settlements_count,
    accrualFrom: p.accrual_from,
    carry: p.carry,
  };
}

export { toState as positionState };

function saveState(id: number, s: PositionState, status?: PositionRow["status"]) {
  getDb()
    .prepare(
      "UPDATE positions SET outstanding_cents=?, settlements_count=?, accrual_from=?, carry=?, status=COALESCE(?, status) WHERE id=?",
    )
    .run(s.outstandingCents, s.settlementsCount, s.accrualFrom, s.carry, status ?? null, id);
}

// ───────────────────────── Saldos ─────────────────────────

export interface Balances {
  capitalCents: number;
  tokens: number;
  availableCents: number;
}

/** Saldos definitivos: suma de movimientos completados. */
export function ledgerBalances(holderId: number): Balances {
  const r = getDb()
    .prepare(
      `SELECT COALESCE(SUM(capital_delta),0) c, COALESCE(SUM(tokens_delta),0) t, COALESCE(SUM(available_delta),0) a
       FROM movements WHERE holder_id = ? AND status = 'completada'`,
    )
    .get(holderId) as { c: number; t: number; a: number };
  return { capitalCents: r.c, tokens: r.t, availableCents: r.a };
}

/** Disponible menos lo comprometido en solicitudes de cobro abiertas. */
export function freeAvailableCents(holderId: number): number {
  const reserved = getDb()
    .prepare(
      `SELECT COALESCE(SUM(amount_cents),0) s FROM movements
       WHERE holder_id = ? AND type = 'cobro_intereses' AND status IN ('pendiente','aprobada')`,
    )
    .get(holderId) as { s: number };
  return ledgerBalances(holderId).availableCents - reserved.s;
}

function freeTokens(holderId: number): number {
  const reserved = getDb()
    .prepare(
      `SELECT COALESCE(SUM(tokens),0) s FROM movements
       WHERE holder_id = ? AND type = 'rescate' AND status IN ('pendiente','aprobada')`,
    )
    .get(holderId) as { s: number };
  return ledgerBalances(holderId).tokens - reserved.s;
}

// ───────────────────────── Cupo ─────────────────────────

export interface CapUsage {
  capCents: number | null;
  usedCents: number;
  reservedCents: number; // solicitudes abiertas
  remainingCents: number | null;
  newMoneyCents: number;
  reinvestedCents: number;
}

export function capUsage(emissionId: number): CapUsage {
  const e = getEmission(emissionId);
  const db = getDb();
  const sums = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN origin IN ('aporte','comision') THEN principal_cents END),0) nm,
         COALESCE(SUM(CASE WHEN origin = 'reinversion' THEN principal_cents END),0) rv
       FROM positions WHERE emission_id = ? AND status != 'cancelada'`,
    )
    .get(emissionId) as { nm: number; rv: number };
  const reserved = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents),0) s FROM movements
       WHERE emission_id = ? AND type IN ('compra_aporte','compra_comision') AND status IN ('pendiente','aprobada')`,
    )
    .get(emissionId) as { s: number };
  const used = sums.nm + (e.cap_includes_reinvestments ? sums.rv : 0);
  return {
    capCents: e.cap_cents,
    usedCents: used,
    reservedCents: reserved.s,
    remainingCents: e.cap_cents === null ? null : Math.max(0, e.cap_cents - used - reserved.s),
    newMoneyCents: sums.nm,
    reinvestedCents: sums.rv,
  };
}

// ───────────────────────── Movimientos ─────────────────────────

interface NewMovement {
  holderId: number;
  positionId?: number | null;
  type: MovementType;
  status: MovementStatus;
  description: string;
  effectiveDate: ISODate;
  amountCents?: number;
  tokens?: number;
  capitalDelta?: number;
  tokensDelta?: number;
  availableDelta?: number;
  externalFlow?: number;
  reference?: string | null;
  commissionId?: number | null;
  emissionId?: number | null;
  reversesId?: number | null;
  idempotencyKey?: string | null;
  data?: unknown;
  notice?: string | null;
  createdBy?: number | null;
}

function insertMovement(m: NewMovement): Movement {
  const db = getDb();
  if (m.idempotencyKey) {
    const existing = db.prepare("SELECT * FROM movements WHERE idempotency_key = ?").get(m.idempotencyKey) as Movement | undefined;
    if (existing) return existing;
  }
  let after: Balances | null = null;
  if (m.status === "completada") {
    const b = ledgerBalances(m.holderId);
    after = {
      capitalCents: b.capitalCents + (m.capitalDelta ?? 0),
      tokens: b.tokens + (m.tokensDelta ?? 0),
      availableCents: b.availableCents + (m.availableDelta ?? 0),
    };
  }
  const info = db
    .prepare(
      `INSERT INTO movements (uid, holder_id, position_id, type, status, description, effective_date, amount_cents, tokens,
        capital_delta, tokens_delta, available_delta, external_flow, capital_after, tokens_after, available_after,
        reference, commission_id, emission_id, reverses_id, idempotency_key, data, notice, created_by, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      newUid(m.effectiveDate), m.holderId, m.positionId ?? null, m.type, m.status, m.description, m.effectiveDate,
      m.amountCents ?? 0, m.tokens ?? 0,
      m.status === "completada" ? m.capitalDelta ?? 0 : 0,
      m.status === "completada" ? m.tokensDelta ?? 0 : 0,
      m.status === "completada" ? m.availableDelta ?? 0 : 0,
      m.status === "completada" ? m.externalFlow ?? 0 : 0,
      after?.capitalCents ?? null, after?.tokens ?? null, after?.availableCents ?? null,
      m.reference ?? null, m.commissionId ?? null, m.emissionId ?? null, m.reversesId ?? null, m.idempotencyKey ?? null,
      m.data === undefined ? null : JSON.stringify(m.data), m.notice ?? null, m.createdBy ?? null,
      m.status === "completada" ? new Date().toISOString() : null,
    );
  return getMovement(Number(info.lastInsertRowid));
}

/** Pasa un movimiento existente a completado aplicando sus deltas. */
function finalizeMovement(
  id: number,
  deltas: { capital?: number; tokens?: number; available?: number; external?: number; positionId?: number; effectiveDate: ISODate; data?: unknown },
  actorId: number | null,
) {
  const m = getMovement(id);
  const b = ledgerBalances(m.holder_id);
  getDb()
    .prepare(
      `UPDATE movements SET status='completada', capital_delta=?, tokens_delta=?, available_delta=?, external_flow=?,
        capital_after=?, tokens_after=?, available_after=?, position_id=COALESCE(?, position_id), effective_date=?,
        data=COALESCE(?, data), decided_by=?, decided_at=datetime('now'), completed_at=datetime('now') WHERE id=?`,
    )
    .run(
      deltas.capital ?? 0, deltas.tokens ?? 0, deltas.available ?? 0, deltas.external ?? 0,
      b.capitalCents + (deltas.capital ?? 0), b.tokens + (deltas.tokens ?? 0), b.availableCents + (deltas.available ?? 0),
      deltas.positionId ?? null, deltas.effectiveDate, deltas.data === undefined ? null : JSON.stringify(deltas.data),
      actorId, id,
    );
}

function maturityFor(e: Emission, activation: ISODate): ISODate | null {
  return e.term_months ? addMonths(activation, e.term_months) : null;
}

function createPosition(p: {
  holderId: number; emissionId: number | null; origin: PositionRow["origin"]; tokens: number; principalCents: number;
  rateBps: number; activationDate: ISODate; maturityDate: ISODate | null; note?: string;
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO positions (holder_id, emission_id, origin, tokens, principal_cents, outstanding_cents, rate_bps,
        activation_date, maturity_date, accrual_from, note) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(p.holderId, p.emissionId, p.origin, p.tokens, p.principalCents, p.principalCents, p.rateBps, p.activationDate,
      p.maturityDate, p.activationDate, p.note ?? null);
  return Number(info.lastInsertRowid);
}

function assertTokenHolder(h: Holder) {
  if (h.kind !== "token") throw new RwError("Este titular registra un préstamo preexistente: no compra ni reinvierte tokens.");
}

// ───────────────────────── Comisiones (puente con rendiciones) ─────────────────────────

export interface Commission {
  id: number;
  user_id: number;
  rendicion_ref: string;
  description: string | null;
  amount_cents: number;
  status: "pendiente" | "disponible" | "cerrada";
  collected_cents: number;
  invested_cents: number;
  reserved_cents: number;
}

export function commissionFreeCents(c: Commission): number {
  return c.amount_cents - c.collected_cents - c.invested_cents - c.reserved_cents;
}

export function availableCommissions(userId: number): Commission[] {
  return (getDb().prepare("SELECT * FROM commissions WHERE user_id = ? AND status = 'disponible' ORDER BY id DESC").all(userId) as Commission[])
    .filter((c) => commissionFreeCents(c) > 0);
}

/** El agente decide cuánto cobrar y cuánto invertir de una comisión disponible en USD. */
export function splitCommission(input: {
  commissionId: number; userId: number; collectCents: number; investTokens: number; idempotencyKey: string;
}) {
  return tx(() => {
    const db = getDb();
    const c = db.prepare("SELECT * FROM commissions WHERE id = ?").get(input.commissionId) as Commission | undefined;
    if (!c || c.user_id !== input.userId) throw new RwError("Comisión inexistente.");
    if (c.status !== "disponible") throw new RwError("Sólo se puede invertir una comisión efectivamente disponible.");
    const investCents = input.investTokens * TOKEN_CENTS;
    if (input.collectCents < 0 || investCents < 0) throw new RwError("Importes inválidos.");
    if (input.collectCents + investCents > commissionFreeCents(c))
      throw new RwError(`La suma supera lo disponible de la comisión (${usd(commissionFreeCents(c))}).`);
    const holder = getHolderByUser(input.userId);
    let movement: Movement | null = null;
    if (input.investTokens > 0) {
      if (!holder) throw new RwError("Tu usuario todavía no tiene un portfolio Renta Work.");
      movement = requestInvestment({
        holderId: holder.id, tokens: input.investTokens, source: "comision", commissionId: c.id,
        actorId: input.userId, idempotencyKey: input.idempotencyKey,
      });
    }
    if (input.collectCents > 0) {
      db.prepare("UPDATE commissions SET collected_cents = collected_cents + ? WHERE id = ?").run(input.collectCents, c.id);
    }
    audit(input.userId, "comision.dividir", "commission", c.id, { collect: input.collectCents, investTokens: input.investTokens });
    return movement;
  });
}

// ───────────────────────── Solicitudes ─────────────────────────

/** Solicitud de inversión (aporte por transferencia o desde comisión). Queda pendiente: no altera saldos. */
export function requestInvestment(input: {
  holderId: number; tokens: number; source: "aporte" | "comision"; commissionId?: number; emissionId?: number;
  actorId: number; idempotencyKey: string;
}): Movement {
  return tx(() => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM movements WHERE idempotency_key = ?").get(input.idempotencyKey) as Movement | undefined;
    if (existing) return existing;
    const h = getHolder(input.holderId);
    assertTokenHolder(h);
    if (!Number.isInteger(input.tokens) || input.tokens < 1) throw new RwError("Elegí al menos 1 token (USD 100).");
    const e = input.emissionId ? getEmission(input.emissionId) : currentEmission(!!h.is_demo);
    if (!e || !e.open) throw new RwError("No hay una emisión abierta.");
    const cap = capUsage(e.id);
    if (cap.remainingCents === null) throw new RwError("El cupo de la emisión todavía no está definido.");
    const amount = input.tokens * TOKEN_CENTS;
    if (amount > cap.remainingCents)
      throw new RwError(`El cupo disponible alcanza para ${Math.floor(cap.remainingCents / TOKEN_CENTS)} tokens.`);
    let commissionRef: string | null = null;
    if (input.source === "comision") {
      const c = db.prepare("SELECT * FROM commissions WHERE id = ?").get(input.commissionId ?? -1) as Commission | undefined;
      if (!c || c.status !== "disponible") throw new RwError("La comisión no está disponible.");
      if (amount > commissionFreeCents(c)) throw new RwError("La comisión no alcanza para esa cantidad de tokens.");
      db.prepare("UPDATE commissions SET reserved_cents = reserved_cents + ? WHERE id = ?").run(amount, c.id);
      commissionRef = c.rendicion_ref;
    }
    const m = insertMovement({
      holderId: h.id,
      type: input.source === "comision" ? "compra_comision" : "compra_aporte",
      status: "pendiente",
      description:
        input.source === "comision"
          ? `Solicitud: ${input.tokens} token${input.tokens > 1 ? "s" : ""} con comisión ${commissionRef}`
          : `Solicitud: ${input.tokens} token${input.tokens > 1 ? "s" : ""} por aporte`,
      effectiveDate: today(),
      amountCents: amount,
      tokens: input.tokens,
      reference: commissionRef,
      commissionId: input.commissionId ?? null,
      emissionId: e.id,
      idempotencyKey: input.idempotencyKey,
      createdBy: input.actorId,
    });
    audit(input.actorId, "solicitud.inversion", "movement", m.id, { tokens: input.tokens, source: input.source });
    return m;
  });
}

export function requestPayout(input: { holderId: number; amountCents: number; actorId: number; idempotencyKey: string }): Movement {
  return tx(() => {
    const existing = getDb().prepare("SELECT * FROM movements WHERE idempotency_key = ?").get(input.idempotencyKey) as Movement | undefined;
    if (existing) return existing;
    const h = getHolder(input.holderId);
    if (input.amountCents <= 0) throw new RwError("Ingresá un importe mayor a cero.");
    const free = freeAvailableCents(h.id);
    if (input.amountCents > free) throw new RwError(`Podés solicitar hasta ${usd(free)}.`);
    const m = insertMovement({
      holderId: h.id, type: "cobro_intereses", status: "pendiente",
      description: `Solicitud de cobro de intereses`, effectiveDate: today(), amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey, createdBy: input.actorId,
    });
    audit(input.actorId, "solicitud.cobro", "movement", m.id, { amount: input.amountCents });
    return m;
  });
}

export function requestRedemption(input: { holderId: number; tokens: number; actorId: number; idempotencyKey: string }): Movement {
  return tx(() => {
    const existing = getDb().prepare("SELECT * FROM movements WHERE idempotency_key = ?").get(input.idempotencyKey) as Movement | undefined;
    if (existing) return existing;
    const h = getHolder(input.holderId);
    assertTokenHolder(h);
    if (!Number.isInteger(input.tokens) || input.tokens < 1) throw new RwError("Elegí al menos 1 token.");
    const free = freeTokens(h.id);
    if (input.tokens > free) throw new RwError(`Podés solicitar el rescate de hasta ${free} tokens.`);
    const m = insertMovement({
      holderId: h.id, type: "rescate", status: "pendiente",
      description: `Solicitud de rescate de ${input.tokens} token${input.tokens > 1 ? "s" : ""}`,
      effectiveDate: today(), amountCents: input.tokens * TOKEN_CENTS, tokens: input.tokens,
      idempotencyKey: input.idempotencyKey, createdBy: input.actorId,
    });
    audit(input.actorId, "solicitud.rescate", "movement", m.id, { tokens: input.tokens });
    return m;
  });
}

const OPEN: MovementStatus[] = ["pendiente", "aprobada"];

export function approveMovement(id: number, adminId: number) {
  return tx(() => {
    const m = getMovement(id);
    if (m.status !== "pendiente") throw new RwError("Sólo se aprueban solicitudes pendientes.");
    getDb().prepare("UPDATE movements SET status='aprobada', decided_by=?, decided_at=datetime('now') WHERE id=?").run(adminId, id);
    audit(adminId, "solicitud.aprobar", "movement", id);
  });
}

export function rejectMovement(id: number, adminId: number, reason: string) {
  return tx(() => {
    const m = getMovement(id);
    if (!OPEN.includes(m.status)) throw new RwError("La solicitud ya fue resuelta.");
    if (m.commission_id && m.type === "compra_comision") {
      getDb().prepare("UPDATE commissions SET reserved_cents = reserved_cents - ? WHERE id = ?").run(m.amount_cents, m.commission_id);
    }
    getDb()
      .prepare("UPDATE movements SET status='rechazada', notice=?, decided_by=?, decided_at=datetime('now') WHERE id=?")
      .run(reason || null, adminId, id);
    audit(adminId, "solicitud.rechazar", "movement", id, { reason });
  });
}

/**
 * Completa una solicitud aprobada: inversión al confirmar fondos, cobro pagado, rescate efectuado.
 * La fecha efectiva es la de activación (inversión) o de pago.
 */
export function completeMovement(id: number, adminId: number, effectiveDate: ISODate = today(), reference?: string) {
  return tx(() => {
    const db = getDb();
    const m = getMovement(id);
    if (!OPEN.includes(m.status)) throw new RwError("La solicitud ya fue resuelta.");
    const h = getHolder(m.holder_id);
    if (!h.is_demo && !realOperationsEnabled() && (m.type === "compra_aporte" || m.type === "compra_comision"))
      throw new RwError(
        "La recepción real de dinero está deshabilitada hasta validar emisor, contratos, respaldo, impuestos y encuadre regulatorio.",
      );
    if (reference) db.prepare("UPDATE movements SET reference = ? WHERE id = ?").run(reference, id);

    if (m.type === "compra_aporte" || m.type === "compra_comision") {
      const e = getEmission(m.emission_id!);
      const positionId = createPosition({
        holderId: h.id, emissionId: e.id, origin: m.type === "compra_comision" ? "comision" : "aporte", tokens: m.tokens,
        principalCents: m.amount_cents, rateBps: e.rate_bps, activationDate: effectiveDate,
        maturityDate: maturityFor(e, effectiveDate),
      });
      if (m.commission_id) {
        db.prepare("UPDATE commissions SET reserved_cents = reserved_cents - ?, invested_cents = invested_cents + ? WHERE id = ?")
          .run(m.amount_cents, m.amount_cents, m.commission_id);
      }
      db.prepare("UPDATE movements SET description = ? WHERE id = ?").run(
        `${m.type === "compra_comision" ? "Compra desde comisión" : "Compra por aporte"}: ${m.tokens} token${m.tokens > 1 ? "s" : ""}`, id,
      );
      finalizeMovement(id, {
        capital: m.amount_cents, tokens: m.tokens, external: -m.amount_cents, positionId, effectiveDate,
      }, adminId);
    } else if (m.type === "cobro_intereses") {
      const b = ledgerBalances(h.id);
      if (m.amount_cents > b.availableCents) throw new RwError("Los intereses disponibles no alcanzan.");
      db.prepare("UPDATE movements SET description = ? WHERE id = ?").run("Cobro de intereses", id);
      finalizeMovement(id, { available: -m.amount_cents, external: m.amount_cents, effectiveDate }, adminId);
    } else if (m.type === "rescate") {
      const allocations = reducePositions(h.id, m.tokens * TOKEN_CENTS, effectiveDate, true);
      db.prepare("UPDATE movements SET description = ? WHERE id = ?").run(`Rescate de ${m.tokens} token${m.tokens > 1 ? "s" : ""}`, id);
      finalizeMovement(id, {
        capital: -m.amount_cents, tokens: -m.tokens, external: m.amount_cents, effectiveDate, data: { allocations },
      }, adminId);
    } else {
      throw new RwError("Tipo de solicitud no soportado.");
    }
    audit(adminId, "solicitud.completar", "movement", id, { effectiveDate, reference });
  });
}

/** Reduce capital de posiciones, de la más antigua a la más nueva. Devenga antes de cambiar. */
function reducePositions(holderId: number, cents: number, on: ISODate, wholeTokens: boolean) {
  const positions = getDb()
    .prepare("SELECT * FROM positions WHERE holder_id = ? AND status = 'activa' AND outstanding_cents > 0 ORDER BY activation_date, id")
    .all(holderId) as PositionRow[];
  let left = cents;
  const allocations: { positionId: number; cents: number; tokens: number }[] = [];
  for (const p of positions) {
    if (left <= 0) break;
    const take = Math.min(left, p.outstanding_cents);
    const s = changeOutstanding(toState(p), on, p.outstanding_cents - take);
    saveState(p.id, s);
    const tokens = wholeTokens ? Math.round(take / TOKEN_CENTS) : 0;
    if (tokens) getDb().prepare("UPDATE positions SET tokens = tokens - ? WHERE id = ?").run(tokens, p.id);
    allocations.push({ positionId: p.id, cents: take, tokens });
    left -= take;
  }
  if (left > 0) throw new RwError("El capital activo no alcanza para esa operación.");
  return allocations;
}

// ───────────────────────── Reinversión ─────────────────────────

export interface ReinvestPreview {
  availableCents: number;
  tokens: number;
  amountCents: number;
  remainderCents: number;
  limitedByCap: boolean;
  activationDate: ISODate;
  rateBps: number;
  maturityDate: ISODate | null;
  termStatus: Emission["term_status"] | null;
  emissionId: number | null;
}

export function previewReinvest(holderId: number, maxTokens?: number, on: ISODate = today()): ReinvestPreview {
  const e = currentEmission(!!getHolder(holderId).is_demo);
  const available = freeAvailableCents(holderId);
  const cap = e ? capUsage(e.id) : null;
  const capRemaining = e && e.cap_includes_reinvestments ? cap!.remainingCents ?? 0 : null;
  const split = splitIntoTokens(available, { capRemainingCents: e ? capRemaining : 0, maxTokens });
  return {
    availableCents: available,
    tokens: split.tokens,
    amountCents: split.amountCents,
    remainderCents: split.remainderCents,
    limitedByCap: split.limitedByCap,
    activationDate: on,
    rateBps: e?.rate_bps ?? 0,
    maturityDate: e ? maturityFor(e, on) : null,
    termStatus: e?.term_status ?? null,
    emissionId: e?.id ?? null,
  };
}

/** Convierte intereses disponibles en tokens enteros. Es un traslado interno: no es ganancia nueva. */
export function reinvest(input: {
  holderId: number; tokens: number; actorId: number | null; mode: "manual" | "automatica"; on?: ISODate; idempotencyKey?: string;
}): Movement | null {
  return tx(() => {
    const db = getDb();
    if (input.idempotencyKey) {
      const ex = db.prepare("SELECT * FROM movements WHERE idempotency_key = ?").get(input.idempotencyKey) as Movement | undefined;
      if (ex) return ex;
    }
    const h = getHolder(input.holderId);
    assertTokenHolder(h);
    const on = input.on ?? today();
    const pv = previewReinvest(h.id, input.tokens, on);
    if (!pv.emissionId) throw new RwError("No hay una emisión abierta para reinvertir.");
    if (input.mode === "manual" && pv.tokens < input.tokens) {
      if (pv.limitedByCap) throw new RwError(`El cupo disponible alcanza sólo para ${pv.tokens} tokens.`);
      throw new RwError(`Tus intereses disponibles alcanzan para ${pv.tokens} tokens.`);
    }
    if (pv.tokens === 0) return null;
    const e = getEmission(pv.emissionId);
    const positionId = createPosition({
      holderId: h.id, emissionId: e.id, origin: "reinversion", tokens: pv.tokens, principalCents: pv.amountCents,
      rateBps: e.rate_bps, activationDate: on, maturityDate: pv.maturityDate,
      note: input.mode === "automatica" ? "Reinversión automática autorizada" : "Reinversión manual",
    });
    const m = insertMovement({
      holderId: h.id, positionId, type: "reinversion", status: "completada",
      description: `Reinversión ${input.mode}: ${pv.tokens} token${pv.tokens > 1 ? "s" : ""}`,
      effectiveDate: on, amountCents: pv.amountCents, tokens: pv.tokens,
      capitalDelta: pv.amountCents, tokensDelta: pv.tokens, availableDelta: -pv.amountCents, externalFlow: 0,
      emissionId: e.id, idempotencyKey: input.idempotencyKey ?? null, createdBy: input.actorId,
      notice: pv.limitedByCap ? "El cupo de la emisión no alcanzó para todos los bloques. El resto quedó en intereses disponibles." : null,
      data: { remainderCents: pv.availableCents - pv.amountCents, maturityDate: pv.maturityDate, termStatus: pv.termStatus },
    });
    audit(input.actorId, `reinversion.${input.mode}`, "movement", m.id, { tokens: pv.tokens });
    return m;
  });
}

export function setAutoReinvest(holderId: number, enabled: boolean, actorId: number) {
  const h = getHolder(holderId);
  assertTokenHolder(h);
  getDb()
    .prepare("UPDATE holders SET auto_reinvest = ?, auto_reinvest_at = datetime('now') WHERE id = ?")
    .run(enabled ? 1 : 0, holderId);
  audit(actorId, enabled ? "reinversion.auto.activar" : "reinversion.auto.desactivar", "holder", holderId);
}

// ───────────────────────── Liquidaciones ─────────────────────────

export interface SettlementRunResult {
  settlements: number;
  totalCents: number;
  reinvestments: number;
  notices: string[];
}

/** Liquida todas las posiciones con períodos vencidos hasta `asOf`. Idempotente. */
export function runSettlements(asOf: ISODate = today(), actorId: number | null = null): SettlementRunResult {
  return tx(() => {
    const db = getDb();
    const positions = db.prepare("SELECT * FROM positions WHERE status = 'activa' ORDER BY id").all() as PositionRow[];
    const result: SettlementRunResult = { settlements: 0, totalCents: 0, reinvestments: 0, notices: [] };
    const touchedHolders = new Set<number>();
    for (const p of positions) {
      const { settlements, state } = settleDue(toState(p), asOf);
      if (!settlements.length) continue;
      for (const s of settlements) {
        insertMovement({
          holderId: p.holder_id, positionId: p.id, type: "liquidacion", status: "completada",
          description: `Intereses del aporte del ${formatDate(p.activation_date)} · semestre ${s.periodIndex + 1}${s.final ? " (final)" : ""}`,
          effectiveDate: s.periodEnd, amountCents: s.amountCents, availableDelta: s.amountCents,
          idempotencyKey: `liq:${p.id}:${s.periodIndex}`, createdBy: actorId,
          data: { periodStart: s.periodStart, periodEnd: s.periodEnd, exactUsd: s.exactUsd },
        });
        result.settlements++;
        result.totalCents += s.amountCents;
      }
      const last = settlements[settlements.length - 1];
      const status: PositionRow["status"] = last.final ? "vencida" : state.outstandingCents === 0 ? "cancelada" : "activa";
      saveState(p.id, state, status);
      touchedHolders.add(p.holder_id);
    }
    // Reinversión automática autorizada
    for (const holderId of touchedHolders) {
      const h = getHolder(holderId);
      if (h.kind !== "token" || !h.auto_reinvest) continue;
      const pv = previewReinvest(h.id, undefined, asOf);
      if (pv.tokens > 0) {
        reinvest({ holderId, tokens: pv.tokens, actorId, mode: "automatica", on: asOf, idempotencyKey: `auto:${holderId}:${asOf}` });
        result.reinvestments++;
      }
      if (pv.limitedByCap) result.notices.push(`${h.name}: el cupo no alcanzó para reinvertir todos los bloques.`);
    }
    audit(actorId, "liquidaciones.ejecutar", null, null, { asOf, ...result });
    return result;
  });
}

// ───────────────────────── Administración de préstamos importados ─────────────────────────

export function importLoan(input: {
  holderId: number; principalCents: number; rateBps: number; baseDate: ISODate; maturityDate?: ISODate | null;
  reference: string; actorId: number | null; idempotencyKey: string;
}) {
  return tx(() => {
    const db = getDb();
    const ex = db.prepare("SELECT * FROM movements WHERE idempotency_key = ?").get(input.idempotencyKey) as Movement | undefined;
    if (ex) return ex;
    const h = getHolder(input.holderId);
    if (h.kind !== "prestamo") throw new RwError("Los saldos importados sólo se cargan a titulares de préstamos preexistentes.");
    const positionId = createPosition({
      holderId: h.id, emissionId: null, origin: "saldo_importado", tokens: 0, principalCents: input.principalCents,
      rateBps: input.rateBps, activationDate: input.baseDate, maturityDate: input.maturityDate ?? null,
      note: `Saldo inicial importado (${input.reference})`,
    });
    const m = insertMovement({
      holderId: h.id, positionId, type: "saldo_inicial_importado", status: "completada",
      description: `Aporte (préstamo al ${input.rateBps / 100}% anual)`, effectiveDate: input.baseDate,
      amountCents: input.principalCents, capitalDelta: input.principalCents, externalFlow: -input.principalCents,
      reference: input.reference, idempotencyKey: input.idempotencyKey, createdBy: input.actorId,
    });
    audit(input.actorId, "prestamo.importar", "position", positionId, { principal: input.principalCents });
    return m;
  });
}

/** Registra un pago de intereses ya efectuado (préstamos importados o pagos fuera del flujo de solicitudes). */
export function registerInterestPayment(input: { holderId: number; amountCents: number; on: ISODate; reference: string; actorId: number }) {
  return tx(() => {
    const b = ledgerBalances(input.holderId);
    if (input.amountCents <= 0) throw new RwError("Importe inválido.");
    if (input.amountCents > b.availableCents)
      throw new RwError(`Sólo hay ${usd(b.availableCents)} de intereses liquidados pendientes de pago.`);
    const m = insertMovement({
      holderId: input.holderId, type: "cobro_intereses", status: "completada", description: "Pago de intereses registrado",
      effectiveDate: input.on, amountCents: input.amountCents, availableDelta: -input.amountCents,
      externalFlow: input.amountCents, reference: input.reference, createdBy: input.actorId,
    });
    audit(input.actorId, "pago.intereses", "movement", m.id, input);
    return m;
  });
}

/** Devolución de capital (total o parcial) de una posición. */
export function returnCapital(input: { positionId: number; amountCents: number; on: ISODate; reference: string; actorId: number }) {
  return tx(() => {
    const db = getDb();
    const p = db.prepare("SELECT * FROM positions WHERE id = ?").get(input.positionId) as PositionRow | undefined;
    if (!p) throw new RwError("Posición inexistente.");
    if (input.amountCents <= 0 || input.amountCents > p.outstanding_cents) throw new RwError("Importe inválido.");
    if (p.tokens > 0 && input.amountCents % TOKEN_CENTS !== 0) throw new RwError("En posiciones con tokens se devuelven múltiplos de USD 100.");
    const s = changeOutstanding(toState(p), input.on, p.outstanding_cents - input.amountCents);
    saveState(p.id, s);
    const tokens = p.tokens > 0 ? input.amountCents / TOKEN_CENTS : 0;
    if (tokens) db.prepare("UPDATE positions SET tokens = tokens - ? WHERE id = ?").run(tokens, p.id);
    const m = insertMovement({
      holderId: p.holder_id, positionId: p.id, type: "devolucion_capital", status: "completada",
      description: `Devolución de capital (posición #${p.id})`, effectiveDate: input.on, amountCents: input.amountCents,
      tokens, capitalDelta: -input.amountCents, tokensDelta: -tokens, externalFlow: input.amountCents,
      reference: input.reference, createdBy: input.actorId,
      data: { allocations: [{ positionId: p.id, cents: input.amountCents, tokens }] },
    });
    audit(input.actorId, "capital.devolver", "position", p.id, input);
    return m;
  });
}

// ───────────────────────── Reversos y ajustes ─────────────────────────

export function reverseMovement(id: number, adminId: number, reason: string) {
  return tx(() => {
    const db = getDb();
    const m = getMovement(id);
    if (m.status !== "completada") throw new RwError("Sólo se revierten movimientos completados.");
    if (m.type === "reverso") throw new RwError("Un reverso no se revierte: registrá una corrección.");
    if (db.prepare("SELECT 1 FROM movements WHERE reverses_id = ?").get(id)) throw new RwError("El movimiento ya fue revertido.");
    if (!reason.trim()) throw new RwError("Indicá el motivo del reverso.");
    const on = today();

    if (m.type === "compra_aporte" || m.type === "compra_comision" || m.type === "reinversion" || m.type === "saldo_inicial_importado") {
      const p = db.prepare("SELECT * FROM positions WHERE id = ?").get(m.position_id) as PositionRow;
      if (p.settlements_count > 0 || p.outstanding_cents !== p.principal_cents)
        throw new RwError("La posición ya tuvo liquidaciones o cambios de capital: registrá una corrección en lugar de un reverso.");
      db.prepare("UPDATE positions SET status='cancelada', outstanding_cents=0, carry='0' WHERE id=?").run(p.id);
      if (m.type === "compra_comision" && m.commission_id)
        db.prepare("UPDATE commissions SET invested_cents = invested_cents - ? WHERE id = ?").run(m.amount_cents, m.commission_id);
    } else if (m.type === "rescate" || m.type === "devolucion_capital") {
      const allocations = (JSON.parse(m.data ?? "{}").allocations ?? []) as { positionId: number; cents: number; tokens: number }[];
      for (const a of allocations) {
        const p = db.prepare("SELECT * FROM positions WHERE id = ?").get(a.positionId) as PositionRow;
        const s = changeOutstanding(toState(p), on, p.outstanding_cents + a.cents);
        saveState(p.id, s, "activa");
        if (a.tokens) db.prepare("UPDATE positions SET tokens = tokens + ? WHERE id = ?").run(a.tokens, p.id);
      }
    } else if (m.type === "liquidacion") {
      throw new RwError("Las liquidaciones no se revierten: registrá una corrección con el motivo.");
    }

    const r = insertMovement({
      holderId: m.holder_id, positionId: m.position_id, type: "reverso", status: "completada",
      description: `Reverso de ${m.uid}: ${reason}`, effectiveDate: on, amountCents: m.amount_cents, tokens: m.tokens,
      capitalDelta: -m.capital_delta, tokensDelta: -m.tokens_delta, availableDelta: -m.available_delta,
      externalFlow: -m.external_flow, reversesId: m.id, createdBy: adminId,
    });
    audit(adminId, "movimiento.reversar", "movement", id, { reason, reverso: r.id });
    return r;
  });
}

/** Corrección manual del saldo disponible (con motivo). No toca capital: para capital, usar reversos o devoluciones. */
export function adjustAvailable(input: { holderId: number; deltaCents: number; reason: string; actorId: number }) {
  return tx(() => {
    if (!input.reason.trim()) throw new RwError("Indicá el motivo.");
    const b = ledgerBalances(input.holderId);
    if (b.availableCents + input.deltaCents < 0) throw new RwError("El saldo disponible no puede quedar negativo.");
    const m = insertMovement({
      holderId: input.holderId, type: "ajuste", status: "completada", description: `Corrección: ${input.reason}`,
      effectiveDate: today(), amountCents: Math.abs(input.deltaCents), availableDelta: input.deltaCents, createdBy: input.actorId,
    });
    audit(input.actorId, "movimiento.ajuste", "movement", m.id, input);
    return m;
  });
}

// ───────────────────────── Lecturas ─────────────────────────

export interface PositionView extends PositionRow {
  accruedUsd: Decimal;
  accruedCents: number;
  nextSettlement: ISODate | null;
  emissionTermStatus: Emission["term_status"] | null;
  paidInterestCents: number;
  settledInterestCents: number;
}

export function positionsView(holderId: number, asOf: ISODate = today()): PositionView[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.*, e.term_status AS emission_term_status FROM positions p LEFT JOIN emissions e ON e.id = p.emission_id
       WHERE p.holder_id = ? ORDER BY p.activation_date, p.id`,
    )
    .all(holderId) as (PositionRow & { emission_term_status: Emission["term_status"] | null })[];
  const settled = db
    .prepare(
      `SELECT position_id, SUM(available_delta) s FROM movements WHERE holder_id = ? AND type = 'liquidacion' AND status = 'completada' GROUP BY position_id`,
    )
    .all(holderId) as { position_id: number; s: number }[];
  const settledMap = new Map(settled.map((r) => [r.position_id, r.s]));
  return rows.map((p) => {
    const st = toState(p);
    const accrued = p.status === "cancelada" ? new Decimal(0) : accruedToDate(st, asOf);
    return {
      ...p,
      accruedUsd: accrued,
      accruedCents: accrued.mul(100).floor().toNumber(),
      nextSettlement: p.status === "activa" || p.status === "vencida" ? nextSettlementDate(st) : null,
      emissionTermStatus: p.emission_term_status,
      paidInterestCents: 0,
      settledInterestCents: settledMap.get(p.id) ?? 0,
    };
  });
}

export function holderMovements(
  holderId: number,
  filters: { from?: string; to?: string; type?: string; status?: string } = {},
): Movement[] {
  const where = ["holder_id = ?"];
  const args: unknown[] = [holderId];
  if (filters.from) { where.push("effective_date >= ?"); args.push(filters.from); }
  if (filters.to) { where.push("effective_date <= ?"); args.push(filters.to); }
  if (filters.type) { where.push("type = ?"); args.push(filters.type); }
  if (filters.status) { where.push("status = ?"); args.push(filters.status); }
  return getDb()
    .prepare(`SELECT * FROM movements WHERE ${where.join(" AND ")} ORDER BY effective_date DESC, id DESC`)
    .all(...args) as Movement[];
}

export interface PortfolioSummary {
  holder: Holder;
  balances: Balances;
  accruedCents: number;
  totalCents: number;
  freeAvailableCents: number;
  positions: PositionView[];
  originalContributionsCents: number;
  interestSettledCents: number;
  interestGeneratedCents: number;
  interestCollectedCents: number;
  interestReinvestedCents: number;
  pending: Movement[];
  reconciled: boolean;
  outstandingFromPositionsCents: number;
}

export function portfolio(holderId: number, asOf: ISODate = today()): PortfolioSummary {
  const db = getDb();
  const holder = getHolder(holderId);
  const balances = ledgerBalances(holderId);
  const positions = positionsView(holderId, asOf);
  const accrued = positions.reduce((a, p) => a.add(p.accruedUsd), new Decimal(0));
  const accruedCents = accrued.mul(100).floor().toNumber();
  const sum = (sql: string) => (db.prepare(sql).get(holderId) as { s: number }).s;
  const originalContributionsCents = sum(
    `SELECT COALESCE(SUM(capital_delta),0) s FROM movements WHERE holder_id = ? AND status='completada'
     AND type IN ('compra_aporte','compra_comision','saldo_inicial_importado')`,
  ) - sum(
    `SELECT COALESCE(SUM(r.capital_delta * -1),0) s FROM movements r JOIN movements o ON o.id = r.reverses_id
     WHERE r.holder_id = ? AND r.status='completada' AND o.type IN ('compra_aporte','compra_comision','saldo_inicial_importado')`,
  );
  const interestSettledCents = sum(
    `SELECT COALESCE(SUM(available_delta),0) s FROM movements WHERE holder_id = ? AND status='completada' AND type='liquidacion'`,
  );
  const interestCollectedCents = sum(
    `SELECT COALESCE(SUM(-available_delta),0) s FROM movements WHERE holder_id = ? AND status='completada' AND type='cobro_intereses'`,
  ) - sum(
    `SELECT COALESCE(SUM(r.available_delta),0) s FROM movements r JOIN movements o ON o.id = r.reverses_id
     WHERE r.holder_id = ? AND r.status='completada' AND o.type='cobro_intereses'`,
  );
  const interestReinvestedCents = sum(
    `SELECT COALESCE(SUM(-available_delta),0) s FROM movements WHERE holder_id = ? AND status='completada' AND type='reinversion'`,
  ) - sum(
    `SELECT COALESCE(SUM(r.available_delta),0) s FROM movements r JOIN movements o ON o.id = r.reverses_id
     WHERE r.holder_id = ? AND r.status='completada' AND o.type='reinversion'`,
  );
  const pending = db
    .prepare("SELECT * FROM movements WHERE holder_id = ? AND status IN ('pendiente','aprobada') ORDER BY id DESC")
    .all(holderId) as Movement[];
  const outstandingFromPositionsCents = positions.reduce((a, p) => a + (p.status === "cancelada" ? 0 : p.outstanding_cents), 0);
  return {
    holder,
    balances,
    accruedCents,
    totalCents: balances.capitalCents + accruedCents + balances.availableCents,
    freeAvailableCents: freeAvailableCents(holderId),
    positions,
    originalContributionsCents,
    interestSettledCents,
    interestGeneratedCents: interestSettledCents + accruedCents,
    interestCollectedCents,
    interestReinvestedCents,
    pending,
    reconciled: outstandingFromPositionsCents === balances.capitalCents,
    outstandingFromPositionsCents,
  };
}
