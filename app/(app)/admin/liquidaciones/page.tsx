import { runSettlementsAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { formatDate, today } from "@/lib/dates";
import { usd } from "@/lib/money";
import type { SP } from "@/lib/session";
import { adminOverview } from "@/lib/views";
import { SubmitButton } from "@/components/SubmitButton";
import { DemoBadge, Flash, PageHead } from "@/components/ui";

export default async function SettlementsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const asOf = today();
  const due = adminOverview(asOf).calendar.filter((c) => c.kind === "liquidacion" && c.date <= asOf);
  const recent = getDb().prepare(
    `SELECT m.effective_date, m.amount_cents, m.description, h.name, h.is_demo FROM movements m JOIN holders h ON h.id = m.holder_id
     WHERE m.type = 'liquidacion' ORDER BY m.id DESC LIMIT 30`,
  ).all() as { effective_date: string; amount_cents: number; description: string; name: string; is_demo: number }[];
  return (
    <>
      <PageHead title="Liquidaciones" sub="Cada posición liquida cada 6 meses desde su activación. Ejecutar dos veces no duplica." />
      <Flash sp={sp} />
      <div className="card">
        <h2>Ejecutar liquidaciones vencidas</h2>
        <p className="muted">{due.length ? `${due.length} liquidaciones vencidas a hoy.` : "No hay liquidaciones vencidas a hoy."} Después de liquidar se aplican las reinversiones automáticas autorizadas.</p>
        <form action={runSettlementsAction} className="inline-form">
          <label>Hasta la fecha<input type="date" name="date" defaultValue={asOf} max={asOf} /></label>
          <SubmitButton>Ejecutar</SubmitButton>
        </form>
        <p className="note" style={{ marginTop: 8 }}>También se puede programar a diario con <code>npm run liquidar</code>.</p>
        {due.length > 0 && (
          <table style={{ marginTop: 12 }}><tbody>{due.map((c, i) => (
            <tr key={i}><td>{formatDate(c.date)}</td><td>{c.holderName} <DemoBadge show={c.isDemo} /></td><td>#{c.positionId}</td><td className="r num">{usd(c.amountCents)}</td></tr>
          ))}</tbody></table>
        )}
      </div>
      <div className="card section">
        <h2>Últimas liquidaciones</h2>
        <table><tbody>{recent.map((r, i) => (
          <tr key={i}><td>{formatDate(r.effective_date)}</td><td>{r.name} <DemoBadge show={r.is_demo} /></td><td>{r.description}</td><td className="r num amount-interest">{usd(r.amount_cents)}</td></tr>
        ))}</tbody></table>
      </div>
    </>
  );
}
