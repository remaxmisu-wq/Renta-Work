import { adjustAction, reverseAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { MOVEMENT_LABELS, type Movement } from "@/lib/ledger";
import { usd } from "@/lib/money";
import type { SP } from "@/lib/session";
import { SubmitButton } from "@/components/SubmitButton";
import { DemoBadge, Flash, PageHead, StatusBadge } from "@/components/ui";

export default async function AdminMovementsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = getDb();
  const rows = db.prepare(
    `SELECT m.*, h.name holder_name, h.is_demo, (SELECT 1 FROM movements r WHERE r.reverses_id = m.id) reversed
     FROM movements m JOIN holders h ON h.id = m.holder_id ORDER BY m.id DESC LIMIT 100`,
  ).all() as (Movement & { holder_name: string; is_demo: number; reversed: number | null })[];
  const holders = db.prepare("SELECT id, name, is_demo FROM holders ORDER BY name").all() as { id: number; name: string; is_demo: number }[];
  return (
    <>
      <PageHead title="Movimientos" sub="Los movimientos no se editan ni se borran. Se corrigen con reversos o correcciones trazables." />
      <Flash sp={sp} />
      <div className="card">
        <h2>Corrección del saldo disponible</h2>
        <form action={adjustAction} className="inline-form">
          <label>Titular<select name="holder">{holders.map((h) => <option key={h.id} value={h.id}>{h.name}{h.is_demo ? " (demo)" : ""}</option>)}</select></label>
          <label>Sentido<select name="sign"><option value="+">Sumar</option><option value="-">Restar</option></select></label>
          <label>Importe USD<input name="amount" required /></label>
          <label>Motivo<input name="reason" required /></label>
          <SubmitButton className="btn small" confirm="¿Registrar la corrección?">Registrar</SubmitButton>
        </form>
      </div>
      <div className="card section">
        <div className="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Titular</th><th>Movimiento</th><th className="r">Importe</th><th>Estado</th><th>Reverso</th></tr></thead>
          <tbody>{rows.map((m) => (
            <tr key={m.id}>
              <td>{formatDate(m.effective_date)}</td>
              <td>{m.holder_name} <DemoBadge show={m.is_demo} /></td>
              <td>{m.description}<br /><small className="faint">{MOVEMENT_LABELS[m.type]} · {m.uid}</small></td>
              <td className="r num">{usd(m.amount_cents)}</td>
              <td><StatusBadge status={m.status} /></td>
              <td>
                {m.status === "completada" && m.type !== "reverso" && m.type !== "liquidacion" && !m.reversed ? (
                  <form action={reverseAction} style={{ display: "flex", gap: 4 }}>
                    <input type="hidden" name="id" value={m.id} />
                    <input name="reason" placeholder="Motivo" required style={{ width: 120, minHeight: 34, padding: 6 }} />
                    <SubmitButton className="btn small danger" confirm="¿Revertir este movimiento?">Revertir</SubmitButton>
                  </form>
                ) : m.reversed ? <small className="faint">Revertido</small> : null}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}
