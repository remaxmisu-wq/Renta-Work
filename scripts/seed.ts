// Carga inicial. Idempotente: se puede correr más de una vez.
//
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed          → datos reales (proyecto, emisión, préstamos ALFAH)
//   SEED_DEMO=1 npm run seed                                  → además, usuarios y movimientos de DEMOSTRACIÓN
//
// Los datos de demostración quedan marcados (is_demo = 1), usan una emisión propia
// de demostración y no se suman a los totales reales.

import crypto from "node:crypto";
import { hashPassword } from "../lib/auth";
import { getDb } from "../lib/db";
import { addDays, today } from "../lib/dates";
import {
  approveMovement, completeMovement, importLoan, reinvest, requestInvestment, requestPayout, runSettlements,
  setAutoReinvest, splitCommission,
} from "../lib/ledger";

const db = getDb();

function upsertUser(email: string, name: string, role: "admin" | "agent", password: string, isDemo = 0): { id: number; created: boolean } {
  const ex = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
  if (ex) return { id: ex.id, created: false };
  const r = db.prepare("INSERT INTO users (email, name, role, password_hash, is_demo) VALUES (?,?,?,?,?)")
    .run(email, name, role, hashPassword(password), isDemo);
  return { id: Number(r.lastInsertRowid), created: true };
}

function holderByName(name: string, values: { kind?: string; userId?: number | null; consent?: string; isDemo?: number }): number {
  const ex = db.prepare("SELECT id FROM holders WHERE name = ? AND is_demo = ?").get(name, values.isDemo ?? 0) as { id: number } | undefined;
  if (ex) return ex.id;
  return Number(db.prepare("INSERT INTO holders (name, kind, user_id, consent, consent_at, is_demo) VALUES (?,?,?,?, datetime('now'), ?)")
    .run(name, values.kind ?? "token", values.userId ?? null, values.consent ?? "ninguno", values.isDemo ?? 0).lastInsertRowid);
}

// ───────── Administrador ─────────
const adminEmail = (process.env.ADMIN_EMAIL || "admin@rentawork.local").toLowerCase();
const adminPass = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
const admin = upsertUser(adminEmail, process.env.ADMIN_NAME || "Administrador", "admin", adminPass);
if (admin.created) console.log(`Administrador: ${adminEmail} / ${process.env.ADMIN_PASSWORD ? "(clave de ADMIN_PASSWORD)" : adminPass}`);

// ───────── Proyecto referencial (datos verificados en simulador-pc.web.app) ─────────
let project = db.prepare("SELECT id FROM projects WHERE unit = 'K01'").get() as { id: number } | undefined;
if (!project) {
  const r = db.prepare(`INSERT INTO projects (name, developer, address, unit, typology, surface_m2, ref_price_cents, delivery, source_url, source_note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    "Pipi Collection", "ALFAH", "Repetto 929, Hurlingham, Buenos Aires", "K01", "2 ambientes", "77,88", 7_788_000, "A convenir",
    "https://simulador-pc.web.app/", "El simulador indica que es orientativo y sin valor contractual.",
  );
  project = { id: Number(r.lastInsertRowid) };
  db.prepare("INSERT INTO m2_prices (project_id, price_cents, effective_date, source, created_by) VALUES (?,?,?,?,?)")
    .run(project.id, 100_000, "2026-11-20", "simulador-pc.web.app (precio referencial publicado)", admin.id);
}

// ───────── Emisión real: plazo propuesto, cupo sin definir ─────────
if (!db.prepare("SELECT 1 FROM emissions WHERE is_demo = 0").get()) {
  db.prepare(`INSERT INTO emissions (project_id, name, rate_bps, term_months, term_status, cap_cents, cap_includes_reinvestments, open, is_demo)
    VALUES (?, 'Renta Work · Emisión 1', 1200, 24, 'propuesta', NULL, 1, 1, 0)`).run(project.id);
}

// ───────── Financiación preexistente de ALFAH (planilla ClaudeFinanciero) ─────────
const loans: [string, string, number][] = [
  ["Leonardo Misuraca", "2026-07-31", 5_733_000],
  ["Leonardo Misuraca", "2026-08-05", 5_733_000],
  ["Leonardo Misuraca", "2026-09-21", 5_880_000],
  ["Leonardo Misuraca", "2026-09-21", 5_880_000],
  ["Sebastián David", "2026-07-31", 3_000_000],
  ["Sebastián David", "2026-07-31", 2_000_000],
  ["Sebastián David", "2026-08-02", 2_000_000],
];
loans.forEach(([name, date, cents], i) => {
  const h = holderByName(name, { kind: "prestamo", consent: "ninguno" });
  importLoan({ holderId: h, principalCents: cents, rateBps: 1200, baseDate: date, reference: "Planilla ClaudeFinanciero", actorId: admin.id, idempotencyKey: `alfah:${i + 1}` });
});

// ───────── Demostración ─────────
if (process.env.SEED_DEMO === "1" && !db.prepare("SELECT 1 FROM emissions WHERE is_demo = 1").get()) {
  const demoPass = process.env.DEMO_PASSWORD || "demo1234";
  db.prepare(`INSERT INTO emissions (project_id, name, rate_bps, term_months, term_status, cap_cents, cap_includes_reinvestments, open, is_demo,
      early_redemption_terms, exit_terms)
    VALUES (?, 'Emisión de demostración', 1200, 24, 'propuesta', 30000000, 1, 1, 1, ?, ?)`).run(
    project.id, "Texto de ejemplo: la devolución anticipada se analiza caso por caso según contrato.", "Texto de ejemplo: devolución del capital al vencimiento.",
  );
  const agent = upsertUser("demo@rentawork.local", "Agente Demo", "agent", demoPass, 1);
  const a = holderByName("Agente Demo", { userId: agent.id, consent: "completo", isDemo: 1 });
  const b = holderByName("Inversora Demo B", { consent: "completo", isDemo: 1 });
  const c = holderByName("Inversor Demo C", { consent: "agregado", isDemo: 1 });
  const d = holderByName("Inversora Demo D", { consent: "agregado", isDemo: 1 });
  const commission = Number(db.prepare("INSERT INTO commissions (user_id, rendicion_ref, description, amount_cents, status) VALUES (?,?,?,?, 'disponible')")
    .run(agent.id, "R-DEMO-0001", "Comisión de demostración", 200_000).lastInsertRowid);
  db.prepare("INSERT INTO commissions (user_id, rendicion_ref, description, amount_cents, status) VALUES (?,?,?,?, 'disponible')")
    .run(agent.id, "R-DEMO-0002", "Comisión de demostración", 85_000);

  let k = 0;
  const buy = (holderId: number, tokens: number, date: string) => {
    const m = requestInvestment({ holderId, tokens, source: "aporte", actorId: agent.id, idempotencyKey: `demo:${++k}` });
    approveMovement(m.id, admin.id);
    completeMovement(m.id, admin.id, date, "Transferencia de demostración");
  };

  const events: Record<string, () => void> = {
    "2025-03-10": () => buy(a, 50, "2025-03-10"),
    "2025-04-02": () => buy(b, 120, "2025-04-02"),
    "2025-05-20": () => { buy(c, 40, "2025-05-20"); buy(d, 25, "2025-05-20"); },
    "2025-08-04": () => {
      const m = splitCommission({ commissionId: commission, userId: agent.id, collectCents: 150_000, investTokens: 5, idempotencyKey: "demo:com1" })!;
      approveMovement(m.id, admin.id);
      completeMovement(m.id, admin.id, "2025-08-04", "R-DEMO-0001");
    },
    "2025-09-15": () => reinvest({ holderId: a, tokens: 3, actorId: agent.id, mode: "manual", on: "2025-09-15", idempotencyKey: "demo:re1" }),
    "2025-11-15": () => buy(a, 30, "2025-11-15"),
    "2026-01-05": () => { setAutoReinvest(a, true, agent.id); setAutoReinvest(b, true, admin.id); },
    "2026-02-20": () => {
      const p = requestPayout({ holderId: c, amountCents: 20_000, actorId: admin.id, idempotencyKey: "demo:pay1" });
      completeMovement(p.id, admin.id, "2026-02-24", "Pago de demostración");
    },
  };

  const end = today();
  for (let t = "2025-03-10"; t <= end; t = addDays(t, 1)) {
    events[t]?.();
    runSettlements(t, null);
  }
  // Solicitudes abiertas, para ver los estados
  requestInvestment({ holderId: a, tokens: 10, source: "aporte", actorId: agent.id, idempotencyKey: "demo:pend1" });
  console.log(`Demostración: demo@rentawork.local / ${demoPass}`);
}

console.log("Seed listo.");
