import { redirect } from "next/navigation";
import { requireUser, type User } from "./auth";
import { getDb } from "./db";
import { getHolderByUser, type Holder } from "./ledger";

/**
 * Titular cuyo portfolio se muestra. Un agente sólo ve el propio.
 * El administrador puede ver el de cualquier titular con ?titular=<id>.
 */
export async function resolveHolder(titular?: string): Promise<{ user: User; holder: Holder | null; viewingOther: boolean }> {
  const user = await requireUser();
  if (titular && user.role === "admin") {
    const h = getDb().prepare("SELECT * FROM holders WHERE id = ?").get(Number(titular)) as Holder | undefined;
    if (!h) redirect("/admin/titulares");
    return { user, holder: h, viewingOther: h.user_id !== user.id };
  }
  return { user, holder: getHolderByUser(user.id) ?? null, viewingOther: false };
}

export type SP = Promise<Record<string, string | string[] | undefined>>;

export function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
