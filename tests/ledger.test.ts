import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "../lib/db";
import {
  approveMovement, capUsage, completeMovement, importLoan, ledgerBalances, portfolio, previewReinvest, reinvest,
  rejectMovement, requestInvestment, requestPayout, requestRedemption, reverseMovement, runSettlements, setAutoReinvest,
  splitCommission, RwError,
} from "../lib/ledger";

let admin: number, agent: number, holder: number, emission: number;

function setup(opts: { cap?: number | null; capInclReinv?: boolean; demo?: boolean } = {}) {
  resetDbForTests();
  const db = getDb();
  admin = Number(db.prepare("INSERT INTO users (email,name,role,password_hash) VALUES ('a@x','Admin','admin','x')").run().lastInsertRowid);
  agent = Number(db.prepare("INSERT INTO users (email,name,role,password_hash) VALUES ('b@x','Agente','agent','x')").run().lastInsertRowid);
  holder = Number(db.prepare("INSERT INTO holders (user_id,name,is_demo) VALUES (?, 'Agente', ?)").run(agent, opts.demo === false ? 0 : 1).lastInsertRowid);
  emission = Number(db.prepare(
    "INSERT INTO emissions (name, rate_bps, term_months, cap_cents, cap_includes_reinvestments, is_demo) VALUES ('E1', 1200, 24, ?, ?, ?)",
  ).run(opts.cap === undefined ? 100_000_000 : opts.cap, opts.capInclReinv === false ? 0 : 1, opts.demo === false ? 0 : 1).lastInsertRowid);
}

let k = 0;
const key = () => `k${++k}`;

function invest(tokens: number, date: string) {
  const m = requestInvestment({ holderId: holder, tokens, source: "aporte", actorId: agent, idempotencyKey: key() });
  approveMovement(m.id, admin);
  completeMovement(m.id, admin, date);
  return m;
}

describe("flujo de inversión", () => {
  beforeEach(() => setup());

  it("una solicitud pendiente no altera saldos", () => {
    requestInvestment({ holderId: holder, tokens: 5, source: "aporte", actorId: agent, idempotencyKey: key() });
    expect(ledgerBalances(holder)).toEqual({ capitalCents: 0, tokens: 0, availableCents: 0 });
  });

  it("doble clic con la misma clave no duplica", () => {
    const a = requestInvestment({ holderId: holder, tokens: 5, source: "aporte", actorId: agent, idempotencyKey: "same" });
    const b = requestInvestment({ holderId: holder, tokens: 5, source: "aporte", actorId: agent, idempotencyKey: "same" });
    expect(a.id).toBe(b.id);
  });

  it("al completar crea la posición y el capital", () => {
    invest(100, "2026-01-15");
    const p = portfolio(holder, "2026-01-15");
    expect(p.balances).toEqual({ capitalCents: 1_000_000, tokens: 100, availableCents: 0 });
    expect(p.positions[0].maturity_date).toBe("2028-01-15");
    expect(p.reconciled).toBe(true);
  });

  it("liquida por posición y es idempotente", () => {
    invest(100, "2026-01-15");
    invest(10, "2026-03-01");
    const r1 = runSettlements("2026-07-20", admin);
    expect(r1.settlements).toBe(1); // sólo la primera posición
    const r2 = runSettlements("2026-07-20", admin);
    expect(r2.settlements).toBe(0);
    expect(ledgerBalances(holder).availableCents).toBe(59_506);
    runSettlements("2026-09-01", admin);
    expect(ledgerBalances(holder).availableCents).toBe(59_506 + Math.floor(1000 * 0.12 * 184 / 365 * 100));
  });

  it("reinversión manual: ejemplo 237,45 → 2 tokens, quedan 37,45", () => {
    invest(1, "2026-01-01");
    getDb().prepare(
      "INSERT INTO movements (uid,holder_id,type,status,description,effective_date,amount_cents,available_delta) VALUES ('X',?, 'ajuste','completada','test','2026-06-01',23745,23745)",
    ).run(holder);
    const pv = previewReinvest(holder, 2, "2026-06-02");
    expect(pv).toMatchObject({ tokens: 2, amountCents: 20_000, remainderCents: 3_745, maturityDate: "2028-06-02" });
    reinvest({ holderId: holder, tokens: 2, actorId: agent, mode: "manual", on: "2026-06-02" });
    const b = ledgerBalances(holder);
    expect(b).toEqual({ capitalCents: 30_000, tokens: 3, availableCents: 3_745 });
    expect(() => reinvest({ holderId: holder, tokens: 1, actorId: agent, mode: "manual" })).toThrow(RwError);
    // la reinversión no es aporte externo
    const p = portfolio(holder, "2026-06-02");
    expect(p.originalContributionsCents).toBe(10_000);
    expect(p.interestReinvestedCents).toBe(20_000);
  });

  it("reinversión automática al liquidar", () => {
    invest(100, "2026-01-15");
    setAutoReinvest(holder, true, agent);
    const r = runSettlements("2026-07-15", admin);
    expect(r.reinvestments).toBe(1);
    expect(ledgerBalances(holder)).toEqual({ capitalCents: 1_000_000 + 50_000, tokens: 105, availableCents: 9_506 });
    // la nueva posición tiene su propia fecha
    const p = portfolio(holder, "2026-07-15").positions.find((x) => x.origin === "reinversion")!;
    expect(p.activation_date).toBe("2026-07-15");
    expect(p.maturity_date).toBe("2028-07-15");
  });

  it("cobro: solicitud, reserva y pago", () => {
    invest(100, "2026-01-15");
    runSettlements("2026-07-15", admin);
    const m = requestPayout({ holderId: holder, amountCents: 50_000, actorId: agent, idempotencyKey: key() });
    expect(() => requestPayout({ holderId: holder, amountCents: 10_000, actorId: agent, idempotencyKey: key() })).toThrow(RwError);
    completeMovement(m.id, admin, "2026-07-20");
    expect(ledgerBalances(holder).availableCents).toBe(9_506);
    const p = portfolio(holder, "2026-07-20");
    expect(p.interestCollectedCents).toBe(50_000);
  });

  it("rescate parcial a mitad de período y reverso", () => {
    invest(100, "2026-01-15");
    const m = requestRedemption({ holderId: holder, tokens: 50, actorId: agent, idempotencyKey: key() });
    completeMovement(m.id, admin, "2026-04-15");
    expect(ledgerBalances(holder)).toMatchObject({ capitalCents: 500_000, tokens: 50 });
    runSettlements("2026-07-15", admin);
    const exact = 10_000 * 0.12 * 90 / 365 + 5_000 * 0.12 * 91 / 365;
    expect(ledgerBalances(holder).availableCents).toBe(Math.floor(exact * 100));
    expect(portfolio(holder, "2026-07-15").reconciled).toBe(true);
  });

  it("reverso de cobro restaura el disponible", () => {
    invest(100, "2026-01-15");
    runSettlements("2026-07-15", admin);
    const m = requestPayout({ holderId: holder, amountCents: 10_000, actorId: agent, idempotencyKey: key() });
    completeMovement(m.id, admin, "2026-07-16");
    reverseMovement(m.id, admin, "Pago devuelto por el banco");
    expect(ledgerBalances(holder).availableCents).toBe(59_506);
    expect(() => reverseMovement(m.id, admin, "otra vez")).toThrow(RwError);
  });

  it("rechazo libera la solicitud", () => {
    const m = requestInvestment({ holderId: holder, tokens: 5, source: "aporte", actorId: agent, idempotencyKey: key() });
    rejectMovement(m.id, admin, "Sin fondos");
    expect(() => completeMovement(m.id, admin)).toThrow(RwError);
  });
});

describe("cupo", () => {
  it("compra sólo hasta el cupo y cuenta solicitudes abiertas", () => {
    setup({ cap: 50_000 }); // USD 500
    requestInvestment({ holderId: holder, tokens: 3, source: "aporte", actorId: agent, idempotencyKey: key() });
    expect(() => requestInvestment({ holderId: holder, tokens: 3, source: "aporte", actorId: agent, idempotencyKey: key() })).toThrow(/2 tokens/);
  });
  it("cupo sin definir no admite compras", () => {
    setup({ cap: null });
    expect(() => requestInvestment({ holderId: holder, tokens: 1, source: "aporte", actorId: agent, idempotencyKey: key() })).toThrow(/cupo/);
  });
  it("reinversión limitada por cupo cuando lo incluye", () => {
    setup({ cap: 1_020_000 }); // 102 tokens
    invest(100, "2026-01-15");
    setAutoReinvest(holder, true, agent);
    const r = runSettlements("2026-07-15", admin);
    expect(r.notices.length).toBe(1);
    expect(ledgerBalances(holder).tokens).toBe(102);
    expect(capUsage(emission).remainingCents).toBe(0);
  });
  it("reinversión sin límite cuando el cupo no la incluye", () => {
    setup({ cap: 1_000_000, capInclReinv: false });
    invest(100, "2026-01-15");
    setAutoReinvest(holder, true, agent);
    runSettlements("2026-07-15", admin);
    expect(ledgerBalances(holder).tokens).toBe(105);
  });
});

describe("operaciones reales deshabilitadas", () => {
  it("no completa compras de titulares reales", () => {
    setup({ demo: false });
    const m = requestInvestment({ holderId: holder, tokens: 1, source: "aporte", actorId: agent, idempotencyKey: key() });
    expect(() => completeMovement(m.id, admin)).toThrow(/deshabilitada/);
  });
});

describe("comisiones", () => {
  it("divide cobro e inversión, sin doble inversión", () => {
    setup();
    const db = getDb();
    const c = Number(db.prepare("INSERT INTO commissions (user_id, rendicion_ref, amount_cents) VALUES (?, 'R-1', 200000)").run(agent).lastInsertRowid);
    const m = splitCommission({ commissionId: c, userId: agent, collectCents: 150_000, investTokens: 5, idempotencyKey: "c1" })!;
    expect(m.amount_cents).toBe(50_000);
    expect(() => splitCommission({ commissionId: c, userId: agent, collectCents: 0, investTokens: 1, idempotencyKey: "c2" })).toThrow(RwError);
    completeMovement(m.id, admin, "2026-02-01");
    const row = db.prepare("SELECT * FROM commissions WHERE id = ?").get(c) as { invested_cents: number; reserved_cents: number };
    expect(row).toMatchObject({ invested_cents: 50_000, reserved_cents: 0 });
  });
});

describe("préstamos importados", () => {
  it("no compran tokens ni consumen cupo y liquidan por posición", () => {
    setup();
    const db = getDb();
    const h = Number(db.prepare("INSERT INTO holders (name, kind, is_demo) VALUES ('Titular préstamo','prestamo',1)").run().lastInsertRowid);
    importLoan({ holderId: h, principalCents: 5_733_000, rateBps: 1200, baseDate: "2026-07-31", reference: "ClaudeFinanciero", actorId: admin, idempotencyKey: "l1" });
    importLoan({ holderId: h, principalCents: 5_733_000, rateBps: 1200, baseDate: "2026-07-31", reference: "ClaudeFinanciero", actorId: admin, idempotencyKey: "l2" });
    expect(ledgerBalances(h).capitalCents).toBe(11_466_000);
    expect(capUsage(emission).usedCents).toBe(0);
    expect(() => requestInvestment({ holderId: h, tokens: 1, source: "aporte", actorId: admin, idempotencyKey: key() })).toThrow(/préstamo/);
    runSettlements("2027-01-31", admin);
    expect(ledgerBalances(h).capitalCents).toBe(11_466_000); // no capitaliza
    expect(ledgerBalances(h).availableCents).toBe(2 * Math.floor(57_330 * 0.12 * 184 / 365 * 100));
  });
});
