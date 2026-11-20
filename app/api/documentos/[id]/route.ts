import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getHolderByUser } from "@/lib/ledger";

export const dynamic = "force-dynamic";

/** Descarga privada: sólo el titular del documento o un administrador. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });
  const { id } = await params;
  const doc = getDb().prepare("SELECT * FROM documents WHERE id = ?").get(Number(id)) as
    | { holder_id: number; title: string; file_path: string | null; mime: string | null }
    | undefined;
  if (!doc) return new NextResponse("No encontrado", { status: 404 });
  const own = getHolderByUser(user.id);
  if (user.role !== "admin" && own?.id !== doc.holder_id) return new NextResponse("No encontrado", { status: 404 });
  if (!doc.file_path) return new NextResponse("Documento sin archivo", { status: 404 });
  const file = path.join(process.cwd(), "data", "uploads", path.basename(doc.file_path));
  if (!fs.existsSync(file)) return new NextResponse("Archivo no disponible", { status: 404 });
  return new NextResponse(fs.readFileSync(file), {
    headers: {
      "Content-Type": doc.mime ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.title)}${path.extname(doc.file_path)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
