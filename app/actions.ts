"use server";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, login, logout, requireAdmin, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { today } from "@/lib/dates";
import {
  adjustAvailable, approveMovement, audit, completeMovement, getHolderByUser, importLoan, registerInterestPayment,
  reinvest, rejectMovement, requestInvestment, requestPayout, requestRedemption, returnCapital, reverseMovement,
  runSettlements, RwError, setAutoReinvest, splitCommission,
} from "@/lib/ledger";
import { parseUsdInput, TOKEN_CENTS, usd } from "@/lib/money";

function s(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

function back(to: string, kind: "ok" | "error", msg: string): never {
  const sep = to.includes("?") ? "&" : "?";
  redirect(`${to}${sep}${kind}=${encodeURIComponent(msg)}`);
}

/** Ejecuta una operación y vuelve con mensaje. Los errores de negocio se muestran al usuario. */
async function run(to: string, okMsg: string | ((r: unknown) => string), fn: () => unknown | Promise<unknown>, successUrl?: string): Promise<never> {
  let result: unknown;
  try {
    result = await fn();
  } catch (e) {
    if (e instanceof RwError) back(to, "error", e.message);
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect
    console.error(e);
    back(to, "error", "No se pudo completar la operación. Probá de nuevo.");
  }
  revalidatePath("/", "layout");
  if (successUrl) redirect(successUrl);
  back(to, "ok", typeof okMsg === "function" ? okMsg(result) : okMsg);
}

async function myHolderId() {
  const u = await requireUser();
  const h = getHolderByUser(u.id);
  if (!h) throw new RwError("Tu usuario todavía no tiene un portfolio Renta Work. Pedíselo al administrador.");
  return { user: u, holder: h };
}

// ───────── Sesión ─────────

export async function loginAction(fd: FormData) {
  const u = await login(s(fd, "email"), s(fd, "password"));
  if (!u) redirect("/login?error=" + encodeURIComponent("Email o clave incorrectos."));
  redirect(u.role === "admin" ? "/admin" : "/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

// ───────── Agente ─────────

export async function investAction(fd: FormData) {
  const tokens = Number(s(fd, "tokens"));
  const source = s(fd, "source");
  return run("/invertir", "Solicitud enviada. Se activa cuando el administrador confirme los fondos.", async () => {
    if (s(fd, "accept") !== "on") throw new RwError("Confirmá que leíste las condiciones.");
    const { user, holder } = await myHolderId();
    if (source.startsWith("comision:")) {
      return splitCommission({
        commissionId: Number(source.split(":")[1]), userId: user.id, collectCents: 0, investTokens: tokens, idempotencyKey: s(fd, "idem"),
      });
    }
    return requestInvestment({ holderId: holder.id, tokens, source: "aporte", actorId: user.id, idempotencyKey: s(fd, "idem") });
  }, `/listo?tipo=inversion&tokens=${tokens}`);
}

export async function commissionSplitAction(fd: FormData) {
  const collect = parseUsdInput(s(fd, "collect")) ?? 0;
  const tokens = Number(s(fd, "tokens") || 0);
  return run("/invertir", `Listo: cobrás ${usd(collect)} e invertís ${usd(tokens * TOKEN_CENTS)} (${tokens} tokens, pendiente de confirmación).`, async () => {
    if (s(fd, "accept") !== "on" && tokens > 0) throw new RwError("Confirmá que leíste las condiciones.");
    const { user } = await myHolderId();
    return splitCommission({ commissionId: Number(s(fd, "commission")), userId: user.id, collectCents: collect, investTokens: tokens, idempotencyKey: s(fd, "idem") });
  }, tokens > 0 ? `/listo?tipo=inversion&tokens=${tokens}` : undefined);
}

export async function reinvestAction(fd: FormData) {
  const tokens = Number(s(fd, "tokens"));
  return run("/intereses", `Reinvertiste ${tokens} token${tokens > 1 ? "s" : ""}. Empiezan a generar intereses desde hoy.`, async () => {
    if (s(fd, "accept") !== "on") throw new RwError("Confirmá el resumen antes de reinvertir.");
    const { user, holder } = await myHolderId();
    return reinvest({ holderId: holder.id, tokens, actorId: user.id, mode: "manual", idempotencyKey: s(fd, "idem") });
  }, `/listo?tipo=reinversion&tokens=${tokens}`);
}

export async function autoReinvestAction(fd: FormData) {
  const enable = s(fd, "enable") === "1";
  return run("/intereses", enable ? "Reinversión automática activada." : "Reinversión automática desactivada.", async () => {
    const { user, holder } = await myHolderId();
    if (enable && s(fd, "accept") !== "on") throw new RwError("Confirmá la autorización.");
    setAutoReinvest(holder.id, enable, user.id);
  });
}

export async function payoutAction(fd: FormData) {
  return run("/intereses", "Solicitud de cobro enviada. Te avisamos cuando se pague.", async () => {
    const { user, holder } = await myHolderId();
    const cents = parseUsdInput(s(fd, "amount"));
    if (!cents) throw new RwError("Ingresá un importe válido.");
    return requestPayout({ holderId: holder.id, amountCents: cents, actorId: user.id, idempotencyKey: s(fd, "idem") });
  });
}

export async function redeemAction(fd: FormData) {
  return run("/rescatar", "Solicitud de rescate enviada. Queda sujeta a las condiciones del contrato.", async () => {
    if (s(fd, "accept") !== "on") throw new RwError("Confirmá que leíste las condiciones de rescate.");
    const { user, holder } = await myHolderId();
    return requestRedemption({ holderId: holder.id, tokens: Number(s(fd, "tokens")), actorId: user.id, idempotencyKey: s(fd, "idem") });
  });
}

// ───────── Administración ─────────

export async function approveAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/solicitudes", "Solicitud aprobada.", () => approveMovement(Number(s(fd, "id")), a.id));
}

export async function completeAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/solicitudes", "Operación completada.", () =>
    completeMovement(Number(s(fd, "id")), a.id, s(fd, "date") || today(), s(fd, "reference") || undefined));
}

export async function rejectAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/solicitudes", "Solicitud rechazada.", () => rejectMovement(Number(s(fd, "id")), a.id, s(fd, "reason")));
}

export async function runSettlementsAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/liquidaciones", (r) => {
    const x = r as { settlements: number; totalCents: number; reinvestments: number; notices: string[] };
    return `${x.settlements} liquidaciones por ${usd(x.totalCents)}; ${x.reinvestments} reinversiones automáticas.${x.notices.length ? " " + x.notices.join(" ") : ""}`;
  }, () => runSettlements(s(fd, "date") || today(), a.id));
}

export async function reverseAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/movimientos", "Reverso registrado.", () => reverseMovement(Number(s(fd, "id")), a.id, s(fd, "reason")));
}

export async function adjustAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/movimientos", "Corrección registrada.", () => {
    const sign = s(fd, "sign") === "-" ? -1 : 1;
    const cents = parseUsdInput(s(fd, "amount"));
    if (!cents) throw new RwError("Importe inválido.");
    return adjustAvailable({ holderId: Number(s(fd, "holder")), deltaCents: sign * cents, reason: s(fd, "reason"), actorId: a.id });
  });
}

export async function interestPaymentAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/titulares", "Pago de intereses registrado.", () => {
    const cents = parseUsdInput(s(fd, "amount"));
    if (!cents) throw new RwError("Importe inválido.");
    return registerInterestPayment({ holderId: Number(s(fd, "holder")), amountCents: cents, on: s(fd, "date") || today(), reference: s(fd, "reference"), actorId: a.id });
  });
}

export async function returnCapitalAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/titulares", "Devolución de capital registrada.", () => {
    const cents = parseUsdInput(s(fd, "amount"));
    if (!cents) throw new RwError("Importe inválido.");
    return returnCapital({ positionId: Number(s(fd, "position")), amountCents: cents, on: s(fd, "date") || today(), reference: s(fd, "reference"), actorId: a.id });
  });
}

export async function importLoanAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/titulares", "Saldo inicial importado.", () => {
    const cents = parseUsdInput(s(fd, "amount"));
    if (!cents) throw new RwError("Importe inválido.");
    return importLoan({
      holderId: Number(s(fd, "holder")), principalCents: cents, rateBps: Math.round(Number(s(fd, "rate").replace(",", ".")) * 100),
      baseDate: s(fd, "date"), maturityDate: s(fd, "maturity") || null, reference: s(fd, "reference") || "Importación",
      actorId: a.id, idempotencyKey: s(fd, "idem"),
    });
  });
}

export async function saveHolderAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/titulares", "Titular guardado.", () => {
    const db = getDb();
    const id = Number(s(fd, "id") || 0);
    const userId = s(fd, "user") ? Number(s(fd, "user")) : null;
    const consent = s(fd, "consent") || "ninguno";
    if (id) {
      const prev = db.prepare("SELECT consent FROM holders WHERE id = ?").get(id) as { consent: string };
      db.prepare("UPDATE holders SET name = ?, user_id = ?, consent = ?, consent_at = CASE WHEN consent != ? THEN datetime('now') ELSE consent_at END WHERE id = ?")
        .run(s(fd, "name"), userId, consent, consent, id);
      audit(a.id, "titular.editar", "holder", id, { consent, prevConsent: prev.consent, userId });
    } else {
      const r = db.prepare("INSERT INTO holders (name, user_id, kind, consent, consent_at) VALUES (?,?,?,?, datetime('now'))")
        .run(s(fd, "name"), userId, s(fd, "kind") === "prestamo" ? "prestamo" : "token", consent);
      audit(a.id, "titular.crear", "holder", Number(r.lastInsertRowid), { name: s(fd, "name") });
    }
  });
}

export async function saveEmissionAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/emisiones", "Emisión guardada.", () => {
    const db = getDb();
    const id = Number(s(fd, "id") || 0);
    const cap = s(fd, "cap") ? parseUsdInput(s(fd, "cap")) : null;
    const vals = [
      s(fd, "name"), Math.round(Number(s(fd, "rate").replace(",", ".")) * 100), s(fd, "term") ? Number(s(fd, "term")) : null,
      s(fd, "term_status") === "confirmado" ? "confirmado" : "propuesta", cap, s(fd, "cap_reinv") === "on" ? 1 : 0,
      s(fd, "early") || null, s(fd, "exit") || null, s(fd, "open") === "on" ? 1 : 0,
    ];
    if (id) {
      db.prepare(`UPDATE emissions SET name=?, rate_bps=?, term_months=?, term_status=?, cap_cents=?, cap_includes_reinvestments=?,
        early_redemption_terms=?, exit_terms=?, open=? WHERE id=?`).run(...vals, id);
      audit(a.id, "emision.editar", "emission", id, vals);
    } else {
      const project = db.prepare("SELECT id FROM projects ORDER BY id LIMIT 1").get() as { id: number } | undefined;
      const r = db.prepare(`INSERT INTO emissions (name, rate_bps, term_months, term_status, cap_cents, cap_includes_reinvestments,
        early_redemption_terms, exit_terms, open, project_id) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(...vals, project?.id ?? null);
      audit(a.id, "emision.crear", "emission", Number(r.lastInsertRowid), vals);
    }
  });
}

export async function m2PriceAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/emisiones", "Valor referencial registrado.", () => {
    const cents = parseUsdInput(s(fd, "price"));
    if (!cents || !s(fd, "source") || !s(fd, "date")) throw new RwError("Completá valor, fecha y fuente.");
    const r = getDb().prepare("INSERT INTO m2_prices (project_id, price_cents, effective_date, source, created_by) VALUES (?,?,?,?,?)")
      .run(Number(s(fd, "project")), cents, s(fd, "date"), s(fd, "source"), a.id);
    audit(a.id, "m2.precio", "m2_price", Number(r.lastInsertRowid), { cents, source: s(fd, "source") });
  });
}

export async function commissionAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/comisiones", "Comisión registrada.", () => {
    const cents = parseUsdInput(s(fd, "amount"));
    if (!cents) throw new RwError("Importe inválido.");
    const r = getDb().prepare("INSERT INTO commissions (user_id, rendicion_ref, description, amount_cents, status) VALUES (?,?,?,?,?)")
      .run(Number(s(fd, "user")), s(fd, "ref"), s(fd, "description") || null, cents, s(fd, "status") === "pendiente" ? "pendiente" : "disponible");
    audit(a.id, "comision.crear", "commission", Number(r.lastInsertRowid), { cents, ref: s(fd, "ref") });
  });
}

export async function commissionStatusAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/comisiones", "Estado actualizado.", () => {
    getDb().prepare("UPDATE commissions SET status = ? WHERE id = ?").run(s(fd, "status"), Number(s(fd, "id")));
    audit(a.id, "comision.estado", "commission", Number(s(fd, "id")), { status: s(fd, "status") });
  });
}

export async function createUserAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/usuarios", "Usuario creado.", () => {
    const pass = s(fd, "password");
    if (pass.length < 8) throw new RwError("La clave debe tener al menos 8 caracteres.");
    const db = getDb();
    const r = db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?,?,?,?)")
      .run(s(fd, "email").toLowerCase(), s(fd, "name"), s(fd, "role") === "admin" ? "admin" : "agent", hashPassword(pass));
    const uid = Number(r.lastInsertRowid);
    if (s(fd, "holder") === "on") db.prepare("INSERT INTO holders (user_id, name) VALUES (?, ?)").run(uid, s(fd, "name"));
    audit(a.id, "usuario.crear", "user", uid, { email: s(fd, "email"), role: s(fd, "role") });
  });
}

const UPLOAD_DIR = () => path.join(process.cwd(), "data", "uploads");

export async function uploadDocumentAction(fd: FormData) {
  const a = await requireAdmin();
  return run("/admin/documentos", "Documento cargado.", async () => {
    const file = fd.get("file") as File | null;
    if (!file || file.size === 0) throw new RwError("Elegí un archivo.");
    if (file.size > 10 * 1024 * 1024) throw new RwError("Máximo 10 MB.");
    fs.mkdirSync(UPLOAD_DIR(), { recursive: true });
    const name = `${crypto.randomUUID()}${path.extname(file.name).slice(0, 10)}`;
    fs.writeFileSync(path.join(UPLOAD_DIR(), name), Buffer.from(await file.arrayBuffer()));
    const r = getDb().prepare("INSERT INTO documents (holder_id, title, kind, file_path, mime, created_by) VALUES (?,?,?,?,?,?)")
      .run(Number(s(fd, "holder")), s(fd, "title") || file.name, s(fd, "kind") || "otro", name, file.type || "application/octet-stream", a.id);
    audit(a.id, "documento.cargar", "document", Number(r.lastInsertRowid), { title: s(fd, "title") });
  });
}
