import { approveAction, completeAction, rejectAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { formatDate, today } from "@/lib/dates";
import { MOVEMENT_LABELS, realOperationsEnabled, type Movement } from "@/lib/ledger";
import { usd } from "@/lib/money";
import type { SP } from "@/lib/session";
import { SubmitButton } from "@/components/SubmitButton";
import { DemoBadge, Flash, PageHead, StatusBadge } from "@/components/ui";

export default async function RequestsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const rows = getDb().prepare(
    `SELECT m.*, h.name holder_name, h.is_demo FROM movements m JOIN holders h ON h.id = m.holder_id
     WHERE m.status IN ('pendiente','aprobada') ORDER BY m.id`,
  ).all() as (Movement & { holder_name: string; is_demo: number })[];
  const recent = getDb().prepare(
    `SELECT m.*, h.name holder_name, h.is_demo FROM movements m JOIN holders h ON h.id = m.holder_id
     WHERE m.decided_at IS NOT NULL AND m.type IN ('compra_aporte','compra_comision','cobro_intereses','rescate') ORDER BY m.decided_at DESC LIMIT 15`,
  ).all() as (Movement & { holder_name: string; is_demo: number })[];
  return (
    <>
      <PageHead title="Solicitudes" sub="Aprobá, completá al confirmar fondos o pagos, o rechazá. Nada cambia saldos hasta completarse." />
      <Flash sp={sp} />
      {!realOperationsEnabled() && <div className="alert warn">Recepción real de dinero deshabilitada: sólo se pueden completar inversiones de titulares de demostración.</div>}
      {rows.length === 0 ? <div className="card empty">No hay solicitudes abiertas.</div> : rows.map((m) => (
        <div className="card" key={m.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong>{m.holder_name}</strong> <DemoBadge show={m.is_demo} /> · {MOVEMENT_LABELS[m.type]}<br />
              <span>{m.description}</span><br />
              <small className="faint">{m.uid} · creada {formatDate(m.effective_date)}{m.reference ? ` · ${m.reference}` : ""}</small>
            </div>
            <div style={{ textAlign: "right" }}><div className="num" style={{ fontSize: "1.2rem", fontWeight: 650 }}>{usd(m.amount_cents)}</div><StatusBadge status={m.status} /></div>
          </div>
          <div className="actions" style={{ marginTop: 12, alignItems: "flex-end" }}>
            {m.status === "pendiente" && (
              <form action={approveAction}><input type="hidden" name="id" value={m.id} /><SubmitButton className="btn small">Aprobar</SubmitButton></form>
            )}
            <form action={completeAction} className="inline-form" style={{ flex: 1 }}>
              <input type="hidden" name="id" value={m.id} />
              <label>{m.type === "cobro_intereses" ? "Fecha de pago" : m.type === "rescate" ? "Fecha de devolución" : "Fecha de activación (fondos confirmados)"}
                <input type="date" name="date" defaultValue={today()} /></label>
              <label>Referencia / comprobante<input name="reference" placeholder="Opcional" /></label>
              <SubmitButton className="btn small green" confirm="¿Confirmás que los fondos / el pago están efectivamente realizados?">Completar</SubmitButton>
            </form>
            <form action={rejectAction} className="inline-form">
              <input type="hidden" name="id" value={m.id} />
              <label>Motivo<input name="reason" placeholder="Motivo del rechazo" /></label>
              <SubmitButton className="btn small danger" confirm="¿Rechazar la solicitud?">Rechazar</SubmitButton>
            </form>
          </div>
        </div>
      ))}
      <div className="card section">
        <h2>Resueltas recientemente</h2>
        <table><tbody>{recent.map((m) => (
          <tr key={m.id}><td>{m.holder_name}</td><td>{m.description}</td><td className="r num">{usd(m.amount_cents)}</td><td><StatusBadge status={m.status} /></td></tr>
        ))}</tbody></table>
      </div>
    </>
  );
}
