import { commissionAction, commissionStatusAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { commissionFreeCents, type Commission } from "@/lib/ledger";
import { usd } from "@/lib/money";
import type { SP } from "@/lib/session";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, PageHead } from "@/components/ui";

export default async function CommissionsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = getDb();
  const rows = db.prepare("SELECT c.*, u.name user_name FROM commissions c JOIN users u ON u.id = c.user_id ORDER BY c.id DESC").all() as (Commission & { user_name: string })[];
  const users = db.prepare("SELECT id, name FROM users WHERE role = 'agent' ORDER BY name").all() as { id: number; name: string }[];
  return (
    <>
      <PageHead title="Comisiones en dólares" sub="Puente con las rendiciones del CRM. Sólo las comisiones en USD efectivamente disponibles pueden invertirse." />
      <Flash sp={sp} />
      <div className="card">
        <h2>Registrar comisión desde una rendición</h2>
        <form action={commissionAction} className="inline-form">
          <label>Agente<select name="user" required>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label>Rendición<input name="ref" required placeholder="R-2026-0001" /></label>
          <label>Importe USD<input name="amount" required /></label>
          <label>Estado<select name="status"><option value="disponible">Disponible</option><option value="pendiente">Pendiente</option></select></label>
          <label>Detalle<input name="description" /></label>
          <SubmitButton className="btn small">Registrar</SubmitButton>
        </form>
        <p className="note" style={{ marginTop: 8 }}>Al integrar con el CRM, este alta se reemplaza por la lectura directa de las rendiciones en dólares.</p>
      </div>
      <div className="card section">
        <div className="table-wrap"><table>
          <thead><tr><th>Rendición</th><th>Agente</th><th className="r">Importe</th><th className="r">Cobrado</th><th className="r">Invertido</th><th className="r">En solicitud</th><th className="r">Libre</th><th>Estado</th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}>
              <td>{c.rendicion_ref}</td><td>{c.user_name}</td><td className="r num">{usd(c.amount_cents)}</td><td className="r num">{usd(c.collected_cents)}</td>
              <td className="r num">{usd(c.invested_cents)}</td><td className="r num">{usd(c.reserved_cents)}</td><td className="r num">{usd(commissionFreeCents(c))}</td>
              <td>
                <form action={commissionStatusAction} style={{ display: "flex", gap: 4 }}>
                  <input type="hidden" name="id" value={c.id} />
                  <select name="status" defaultValue={c.status} style={{ minHeight: 34, padding: 4 }}><option value="pendiente">Pendiente</option><option value="disponible">Disponible</option><option value="cerrada">Cerrada</option></select>
                  <SubmitButton className="btn small">OK</SubmitButton>
                </form>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}
