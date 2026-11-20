// Lecturas agregadas para pantallas: gráfico, inversores, panel administrativo.

import { getDb } from "./db";
import { addDays, addMonths, daysBetween, minDate, today, type ISODate } from "./dates";
import { accrueUsd, accruedToDate, periodEnd, xirr, type CashFlow } from "./engine";
import {
  capUsage, currentEmission, ledgerBalances, portfolio, positionState, positionsView,
  type Holder, type Movement, type PositionRow,
} from "./ledger";

const CONTRIB = ["compra_aporte", "compra_comision", "saldo_inicial_importado"];
const WITHDRAW = ["cobro_intereses", "rescate", "devolucion_capital"];

interface MovementWithOrig extends Movement {
  orig_type: string | null;
}

function completedMovements(holderIds: number | number[]): MovementWithOrig[] {
  const ids = Array.isArray(holderIds) ? holderIds : [holderIds];
  if (!ids.length) return [];
  return getDb()
    .prepare(
      `SELECT m.*, o.type AS orig_type FROM movements m LEFT JOIN movements o ON o.id = m.reverses_id
       WHERE m.holder_id IN (${ids.map(() => "?").join(",")}) AND m.status = 'completada' ORDER BY m.effective_date, m.id`,
    )
    .all(...ids) as MovementWithOrig[];
}

function kindOf(m: MovementWithOrig): "aporte" | "retiro" | "liquidacion" | "ajuste" | "reinversion" | null {
  const t = m.type === "reverso" ? m.orig_type : m.type;
  if (!t) return null;
  if (CONTRIB.includes(t)) return "aporte";
  if (WITHDRAW.includes(t)) return "retiro";
  if (t === "liquidacion") return "liquidacion";
  if (t === "ajuste") return "ajuste";
  if (t === "reinversion") return "reinversion";
  return null;
}

export interface ChartPoint {
  date: ISODate;
  contributedCents: number; // aportes externos acumulados
  withdrawnCents: number; // retiros acumulados (cobros, rescates, devoluciones)
  generatedCents: number; // ganancias generadas acumuladas (liquidadas + en curso)
  totalCents: number; // = aportes − retiros + ganancias
}

export interface ChartData {
  history: ChartPoint[];
  projection: { date: ISODate; totalCents: number }[];
  withdrawals: { date: ISODate; cents: number }[];
  reinvestments: { date: ISODate; cents: number }[];
}

/** Interés en curso aproximado a una fecha pasada, por posición. En la fecha de hoy es exacto. */
function accruedAt(positions: PositionRow[], t: ISODate): number {
  let cents = 0;
  for (const p of positions) {
    if (p.activation_date > t || p.status === "cancelada") continue;
    let lastEnd = p.activation_date;
    const st = positionState(p);
    for (let k = 0; k < p.settlements_count; k++) {
      const e = periodEnd(st, k);
      if (e <= t) lastEnd = e;
      else break;
    }
    const to = p.maturity_date ? minDate(t, p.maturity_date) : t;
    const base = t >= p.accrual_from ? p.outstanding_cents : p.principal_cents;
    cents += accrueUsd(base, p.rate_bps, lastEnd, to).mul(100).floor().toNumber();
  }
  return cents;
}

export function chartData(holderId: number, asOf: ISODate = today(), projectMonths = 12): ChartData {
  return chartDataFor([holderId], asOf, projectMonths);
}

/** Igual que chartData, sumando varios titulares (vista general). */
export function chartDataFor(holderIds: number[], asOf: ISODate = today(), projectMonths = 12): ChartData {
  const ms = completedMovements(holderIds);
  if (!ms.length) return { history: [], projection: [], withdrawals: [], reinvestments: [] };
  const positions = getDb()
    .prepare(`SELECT * FROM positions WHERE holder_id IN (${holderIds.map(() => "?").join(",")})`)
    .all(...holderIds) as PositionRow[];
  const pfs = holderIds.map((id) => portfolio(id, asOf));
  const pf = {
    accruedCents: pfs.reduce((a, x) => a + x.accruedCents, 0),
    balances: { capitalCents: pfs.reduce((a, x) => a + x.balances.capitalCents, 0) },
    positions: pfs.flatMap((x) => x.positions),
  };

  const first = ms[0].effective_date;
  const dates: ISODate[] = [];
  let d = first;
  while (d < asOf) {
    dates.push(d);
    d = addMonths(first, dates.length);
  }
  dates.push(asOf);
  // Cada movimiento agrega su fecha y la víspera, para que el gráfico muestre escalones y no rampas.
  for (const m of ms) {
    if (m.effective_date > first && m.effective_date <= asOf) dates.push(m.effective_date, addDays(m.effective_date, -1));
  }
  dates.sort();
  for (let i = dates.length - 1; i > 0; i--) if (dates[i] === dates[i - 1]) dates.splice(i, 1);

  const history: ChartPoint[] = dates.map((t) => {
    let contributed = 0, withdrawn = 0, settled = 0;
    for (const m of ms) {
      if (m.effective_date > t) break;
      const k = kindOf(m);
      if (k === "aporte") contributed += -m.external_flow;
      else if (k === "retiro") withdrawn += m.external_flow;
      else if (k === "liquidacion" || k === "ajuste") settled += m.available_delta;
    }
    const accrued = t === asOf ? pf.accruedCents : accruedAt(positions, t);
    const generated = settled + accrued;
    return { date: t, contributedCents: contributed, withdrawnCents: withdrawn, generatedCents: generated, totalCents: contributed - withdrawn + generated };
  });

  const last = history[history.length - 1];
  const capital = pf.balances.capitalCents;
  const rate = pf.positions.find((p) => p.status === "activa")?.rate_bps ?? 1200;
  const projection = [{ date: asOf, totalCents: last.totalCents }];
  for (let i = 1; i <= projectMonths; i++) {
    const t = addMonths(asOf, i);
    projection.push({ date: t, totalCents: last.totalCents + accrueUsd(capital, rate, asOf, t).mul(100).floor().toNumber() });
  }

  return {
    history,
    projection,
    withdrawals: ms.filter((m) => kindOf(m) === "retiro" && m.external_flow > 0).map((m) => ({ date: m.effective_date, cents: m.external_flow })),
    reinvestments: ms.filter((m) => m.type === "reinversion").map((m) => ({ date: m.effective_date, cents: m.amount_cents })),
  };
}

/** Rentabilidad personal anualizada (XIRR). Reinversiones no son flujos externos. */
export function personalXirr(holderId: number, asOf: ISODate = today()): number | null {
  const ms = completedMovements(holderId);
  const flows: CashFlow[] = ms.filter((m) => m.external_flow !== 0).map((m) => ({ date: m.effective_date, amount: m.external_flow / 100 }));
  const pf = portfolio(holderId, asOf);
  flows.push({ date: asOf, amount: pf.totalCents / 100 });
  return xirr(flows);
}

// ───────────────────────── Inversores ─────────────────────────

export interface InvestorRow {
  holderId: number;
  displayName: string;
  kind: Holder["kind"];
  isDemo: boolean;
  capitalCents: number;
  pendingInterestCents: number; // en curso + liquidados sin pagar
  updatedAt: ISODate;
  reconciled: boolean;
  positions: {
    id: number;
    activationDate: ISODate;
    principalCents: number;
    outstandingCents: number;
    rateBps: number;
    generatedCents: number;
    paidCents: number;
    pendingCents: number;
    maturityDate: ISODate | null;
  }[];
}

export interface InvestorsView {
  rows: InvestorRow[];
  aggregated: { count: number; capitalCents: number; pendingInterestCents: number };
}

export function investorsView(asOf: ISODate = today(), opts: { includeDemo?: boolean; adminView?: boolean } = {}): InvestorsView {
  const db = getDb();
  const holders = db
    .prepare(`SELECT * FROM holders ${opts.includeDemo ? "" : "WHERE is_demo = 0"} ORDER BY name`)
    .all() as Holder[];
  const rows: InvestorRow[] = [];
  const aggregated = { count: 0, capitalCents: 0, pendingInterestCents: 0 };
  let anon = 0;
  for (const h of holders) {
    const pf = portfolio(h.id, asOf);
    if (pf.balances.capitalCents === 0 && pf.balances.availableCents === 0 && pf.accruedCents === 0) continue;
    const pending = pf.accruedCents + pf.balances.availableCents;
    const consent = opts.adminView ? "completo" : h.consent;
    if (consent === "ninguno") continue; // sin consentimiento: no se publica nada
    if (consent === "agregado") {
      aggregated.count++;
      aggregated.capitalCents += pf.balances.capitalCents;
      aggregated.pendingInterestCents += pending;
      continue;
    }
    const lastMov = db.prepare("SELECT MAX(effective_date) d FROM movements WHERE holder_id = ? AND status='completada'").get(h.id) as { d: string | null };
    // Pagos de intereses: se imputan a las posiciones en orden, sobre lo liquidado.
    let paidPool = pf.interestCollectedCents + pf.interestReinvestedCents;
    rows.push({
      holderId: h.id,
      displayName: consent === "anonimo" ? `Inversor ${String.fromCharCode(65 + anon++)}` : h.name,
      kind: h.kind,
      isDemo: !!h.is_demo,
      capitalCents: pf.balances.capitalCents,
      pendingInterestCents: pending,
      updatedAt: asOf > (lastMov.d ?? "") ? asOf : lastMov.d!,
      reconciled: pf.reconciled,
      positions: pf.positions
        .filter((p) => p.status !== "cancelada")
        .map((p) => {
          const paid = Math.min(paidPool, p.settledInterestCents);
          paidPool -= paid;
          const generated = p.settledInterestCents + p.accruedCents;
          return {
            id: p.id, activationDate: p.activation_date, principalCents: p.principal_cents, outstandingCents: p.outstanding_cents,
            rateBps: p.rate_bps, generatedCents: generated, paidCents: paid, pendingCents: generated - paid, maturityDate: p.maturity_date,
          };
        }),
    });
  }
  return { rows, aggregated };
}

// ───────────────────────── Panel administrativo ─────────────────────────

export interface CalendarItem {
  date: ISODate;
  kind: "liquidacion" | "vencimiento";
  holderName: string;
  holderId: number;
  positionId: number;
  amountCents: number; // estimado
  isDemo: boolean;
}

export function adminOverview(asOf: ISODate = today(), horizonMonths = 12) {
  const db = getDb();
  const holders = db.prepare("SELECT * FROM holders ORDER BY name").all() as Holder[];
  let capital = 0, accrued = 0, available = 0, demoCapital = 0;
  const calendar: CalendarItem[] = [];
  const horizon = addMonths(asOf, horizonMonths);
  for (const h of holders) {
    const b = ledgerBalances(h.id);
    const pv = positionsView(h.id, asOf);
    const acc = pv.reduce((a, p) => a + p.accruedCents, 0);
    if (h.is_demo) demoCapital += b.capitalCents;
    else {
      capital += b.capitalCents;
      accrued += acc;
      available += b.availableCents;
    }
    for (const p of pv) {
      if (p.status !== "activa") continue;
      const st = positionState(p);
      for (let k = p.settlements_count; k < p.settlements_count + 4; k++) {
        const end = periodEnd(st, k);
        if (end > horizon) break;
        const est = k === p.settlements_count
          ? accruedToDate(st, end)
          : accrueUsd(p.outstanding_cents, p.rate_bps, periodEnd(st, k - 1), end);
        calendar.push({ date: end, kind: "liquidacion", holderName: h.name, holderId: h.id, positionId: p.id, amountCents: est.mul(100).floor().toNumber(), isDemo: !!h.is_demo });
        if (p.maturity_date && end >= p.maturity_date) break;
      }
      if (p.maturity_date && p.maturity_date <= horizon) {
        calendar.push({ date: p.maturity_date, kind: "vencimiento", holderName: h.name, holderId: h.id, positionId: p.id, amountCents: p.outstanding_cents, isDemo: !!h.is_demo });
      }
    }
  }
  calendar.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Proyección de caja mensual (sólo datos reales). Supuestos explícitos en pantalla.
  const months: { month: string; interestCents: number; capitalCents: number }[] = [];
  for (let i = 0; i <= horizonMonths; i++) {
    const month = addMonths(asOf.slice(0, 8) + "01", i).slice(0, 7);
    const items = calendar.filter((c) => !c.isDemo && c.date.startsWith(month) && c.date > asOf);
    months.push({
      month,
      interestCents: items.filter((c) => c.kind === "liquidacion").reduce((a, c) => a + c.amountCents, 0),
      capitalCents: items.filter((c) => c.kind === "vencimiento").reduce((a, c) => a + c.amountCents, 0),
    });
  }

  const e = currentEmission();
  const pendingRequests = (db.prepare("SELECT COUNT(*) n FROM movements WHERE status IN ('pendiente','aprobada')").get() as { n: number }).n;
  const unscheduled = (db.prepare(
    "SELECT COALESCE(SUM(outstanding_cents),0) s FROM positions p JOIN holders h ON h.id = p.holder_id WHERE p.status='activa' AND p.maturity_date IS NULL AND h.is_demo = 0",
  ).get() as { s: number }).s;
  return {
    capitalCents: capital,
    accruedCents: accrued,
    availableCents: available,
    demoCapitalCents: demoCapital,
    calendar,
    cashProjection: months,
    emission: e ?? null,
    cap: e ? capUsage(e.id) : null,
    pendingRequests,
    unscheduledCapitalCents: unscheduled,
  };
}

export function daysUntil(d: ISODate, asOf: ISODate = today()) {
  return daysBetween(asOf, d);
}

export { addDays };

// ───────────────────────── Vistas simples (panel personal y lista de inversores) ─────────────────────────

export interface SimplePanel {
  investedCents: number; // lo que puso (aportes externos, sin reinversiones)
  capitalCents: number; // capital activo hoy
  generatedCents: number; // intereses generados hasta hoy (liquidados + en curso)
  collectedCents: number; // intereses ya cobrados
  availableCents: number; // intereses liquidados para cobrar o reinvertir
  todayCents: number; // lo que tiene hoy
  perDayCents: number;
  perMonthCents: number;
  inOneYearCents: number; // estimado sin aportes ni retiros
  rateBps: number;
  upcoming: { date: ISODate; cents: number }[];
}

export function simplePanel(holderId: number, asOf: ISODate = today()): SimplePanel {
  const pf = portfolio(holderId, asOf);
  const active = pf.positions.filter((p) => p.status === "activa");
  const rate = active[0]?.rate_bps ?? 1200;
  const yearly = active.reduce((a, p) => a + (p.outstanding_cents * p.rate_bps) / 10_000, 0);
  // Próximos cobros: la próxima liquidación de cada posición, agrupada por fecha.
  const byDate = new Map<string, number>();
  for (const p of active) {
    if (!p.nextSettlement) continue;
    const est = accruedToDate(positionState(p), p.nextSettlement).mul(100).floor().toNumber();
    byDate.set(p.nextSettlement, (byDate.get(p.nextSettlement) ?? 0) + est);
  }
  const upcoming = [...byDate.entries()].sort().map(([date, cents]) => ({ date, cents }));
  return {
    investedCents: pf.originalContributionsCents,
    capitalCents: pf.balances.capitalCents,
    generatedCents: pf.interestGeneratedCents,
    collectedCents: pf.interestCollectedCents,
    availableCents: pf.balances.availableCents,
    todayCents: pf.totalCents,
    perDayCents: Math.floor(yearly / 365),
    perMonthCents: Math.floor(yearly / 12),
    inOneYearCents: pf.totalCents + Math.floor(yearly),
    rateBps: rate,
    upcoming,
  };
}

export interface InvestorListRow {
  holderId: number;
  name: string;
  isDemo: boolean;
  investedCents: number;
  generatedCents: number;
  perMonthCents: number;
}

/** Lista simple de inversores. Respeta el consentimiento salvo para el administrador. */
export function investorList(asOf: ISODate = today(), opts: { adminView?: boolean; includeDemo?: boolean; alsoHolderId?: number } = {}) {
  const holders = getDb()
    .prepare(`SELECT * FROM holders WHERE ${opts.includeDemo ? "1" : "(is_demo = 0 OR id = ?)"} ORDER BY name`)
    .all(...(opts.includeDemo ? [] : [opts.alsoHolderId ?? -1])) as Holder[];
  const rows: InvestorListRow[] = [];
  const others = { count: 0, investedCents: 0, generatedCents: 0, perMonthCents: 0 };
  let anon = 0;
  for (const h of holders) {
    const s = simplePanel(h.id, asOf);
    if (s.capitalCents === 0 && s.generatedCents === 0) continue;
    const consent = opts.adminView ? "completo" : h.consent;
    if (consent === "ninguno") continue;
    if (consent === "agregado") {
      others.count++;
      others.investedCents += s.investedCents;
      others.generatedCents += s.generatedCents;
      others.perMonthCents += s.perMonthCents;
      continue;
    }
    rows.push({
      holderId: h.id,
      name: consent === "anonimo" ? `Inversor ${String.fromCharCode(65 + anon++)}` : h.name,
      isDemo: !!h.is_demo,
      investedCents: s.investedCents,
      generatedCents: s.generatedCents,
      perMonthCents: s.perMonthCents,
    });
  }
  rows.sort((a, b) => b.investedCents - a.investedCents || b.generatedCents - a.generatedCents);
  const all = [...rows, ...(others.count >= 2 ? [others] : [])];
  const total = {
    investedCents: all.reduce((a, r) => a + r.investedCents, 0),
    generatedCents: all.reduce((a, r) => a + r.generatedCents, 0),
    perMonthCents: all.reduce((a, r) => a + r.perMonthCents, 0),
  };
  return { rows, others: others.count >= 2 ? others : null, total };
}

// ───────────────────────── Detalle por aporte ─────────────────────────

export interface AporteDetail {
  id: number;
  date: ISODate; // fecha en que se puso la plata
  origin: PositionRow["origin"];
  amountCents: number; // capital actual
  originalCents: number;
  rateBps: number;
  days: number;
  generatedCents: number;
  perMonthCents: number;
  maturity: ISODate | null;
  schedule: { date: ISODate; cents: number; done: boolean }[]; // cobros ya liquidados y próximos
}

export function aporteDetails(holderId: number, asOf: ISODate = today(), upcomingCount = 4): AporteDetail[] {
  const db = getDb();
  return positionsView(holderId, asOf)
    .filter((p) => p.status !== "cancelada")
    .map((p) => {
      const st = positionState(p);
      const past = (db.prepare(
        "SELECT effective_date d, amount_cents c FROM movements WHERE position_id = ? AND type = 'liquidacion' AND status = 'completada' ORDER BY effective_date",
      ).all(p.id) as { d: string; c: number }[]).map((r) => ({ date: r.d, cents: r.c, done: true }));
      const future: AporteDetail["schedule"] = [];
      if (p.status === "activa") {
        for (let k = p.settlements_count; k < p.settlements_count + upcomingCount; k++) {
          const end = periodEnd(st, k);
          const est = k === p.settlements_count ? accruedToDate(st, end) : accrueUsd(p.outstanding_cents, p.rate_bps, periodEnd(st, k - 1), end);
          future.push({ date: end, cents: est.mul(100).floor().toNumber(), done: false });
          if (p.maturity_date && end >= p.maturity_date) break;
        }
      }
      return {
        id: p.id,
        date: p.activation_date,
        origin: p.origin,
        amountCents: p.outstanding_cents,
        originalCents: p.principal_cents,
        rateBps: p.rate_bps,
        days: Math.max(0, daysBetween(p.activation_date, asOf)),
        generatedCents: p.settledInterestCents + p.accruedCents,
        perMonthCents: Math.floor((p.outstanding_cents * p.rate_bps) / 10_000 / 12),
        maturity: p.maturity_date,
        schedule: [...past, ...future],
      };
    });
}

// ───────────────────────── Relación con el departamento ─────────────────────────

export interface DeptoEquivalence {
  projectName: string;
  unit: string;
  typology: string;
  address: string;
  surfaceM2: number;
  unitPriceCents: number;
  pricePerM2Cents: number;
  priceDate: ISODate;
  priceSource: string;
  capitalCents: number;
  m2: number; // equivalencia orientativa
  share: number; // fracción de la unidad (0..1)
}

/** Equivalencia orientativa: capital activo / precio referencial vigente del m². No son metros propios. */
export function deptoEquivalence(capitalCents: number): DeptoEquivalence | null {
  const db = getDb();
  const p = db.prepare("SELECT * FROM projects ORDER BY id LIMIT 1").get() as
    | { id: number; name: string; unit: string; typology: string; address: string; surface_m2: string; ref_price_cents: number }
    | undefined;
  if (!p) return null;
  const price = db.prepare("SELECT * FROM m2_prices WHERE project_id = ? ORDER BY effective_date DESC, id DESC LIMIT 1").get(p.id) as
    | { price_cents: number; effective_date: string; source: string }
    | undefined;
  if (!price) return null;
  const surface = Number(String(p.surface_m2).replace(",", "."));
  const m2 = capitalCents / price.price_cents;
  return {
    projectName: p.name, unit: p.unit, typology: p.typology, address: p.address, surfaceM2: surface,
    unitPriceCents: p.ref_price_cents, pricePerM2Cents: price.price_cents, priceDate: price.effective_date, priceSource: price.source,
    capitalCents, m2, share: surface ? m2 / surface : 0,
  };
}

// ───────────────────────── Vista general (solapa Inversión) ─────────────────────────

export function generalOverview(asOf: ISODate = today()) {
  const list = investorList(asOf, { adminView: true });
  const holderIds = (getDb().prepare("SELECT id FROM holders WHERE is_demo = 0").all() as { id: number }[]).map((r) => r.id);
  let capital = 0, yearly = 0, generated = 0;
  const cobros = new Map<string, { cents: number; names: Set<string> }>();
  for (const id of holderIds) {
    const s = simplePanel(id, asOf);
    capital += s.capitalCents;
    yearly += (s.capitalCents * s.rateBps) / 10_000;
    generated += s.generatedCents;
    const name = (getDb().prepare("SELECT name FROM holders WHERE id = ?").get(id) as { name: string }).name;
    for (const a of aporteDetails(id, asOf)) for (const c of a.schedule) if (!c.done) {
      const e = cobros.get(c.date) ?? { cents: 0, names: new Set<string>() };
      e.cents += c.cents; e.names.add(name); cobros.set(c.date, e);
    }
  }
  return {
    list,
    capitalCents: capital,
    generatedCents: generated,
    perDayExact: yearly / 365,
    perDayCents: Math.floor(yearly / 365),
    perMonthCents: Math.floor(yearly / 12),
    perYearCents: Math.floor(yearly),
    investors: list.rows.length + (list.others?.count ?? 0),
    chart: chartDataFor(holderIds, asOf),
    upcoming: [...cobros.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, 6)
      .map(([date, v]) => ({ date, cents: v.cents, names: [...v.names] })),
  };
}

export function currentM2PriceCents(): number | null {
  const r = getDb().prepare("SELECT price_cents FROM m2_prices ORDER BY effective_date DESC, id DESC LIMIT 1").get() as { price_cents: number } | undefined;
  return r?.price_cents ?? null;
}
