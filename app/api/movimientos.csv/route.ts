import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getHolderByUser, holderMovements, MOVEMENT_LABELS, STATUS_LABELS, type Holder } from "@/lib/ledger";

export const dynamic = "force-dynamic";

const money = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });
  const q = req.nextUrl.searchParams;
  let holder: Holder | undefined = getHolderByUser(user.id);
  if (q.get("titular") && user.role === "admin") holder = getDb().prepare("SELECT * FROM holders WHERE id = ?").get(Number(q.get("titular"))) as Holder | undefined;
  if (!holder) return new NextResponse("Sin portfolio", { status: 404 });
  const ms = holderMovements(holder.id, {
    from: q.get("desde") ?? undefined, to: q.get("hasta") ?? undefined, type: q.get("tipo") ?? undefined, status: q.get("estado") ?? undefined,
  });
  const head = ["Fecha", "Identificador", "Tipo", "Descripción", "Estado", "Tokens", "Importe USD", "Capital después", "Tokens después", "Intereses disponibles después", "Referencia"];
  const rows = ms.map((m) => [
    m.effective_date, m.uid, MOVEMENT_LABELS[m.type], m.description, STATUS_LABELS[m.status], m.tokens, money(m.amount_cents),
    money(m.capital_after), m.tokens_after ?? "", money(m.available_after), m.reference ?? "",
  ]);
  const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="renta-work-movimientos.csv"` },
  });
}
