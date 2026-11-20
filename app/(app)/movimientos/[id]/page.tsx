import { notFound } from "next/navigation";
import { resolveHolder, str, type SP } from "@/lib/session";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { MOVEMENT_LABELS, type Movement } from "@/lib/ledger";
import { usd } from "@/lib/money";
import { PageHead, StatusBadge } from "@/components/ui";

export default async function MovementDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const { holder } = await resolveHolder(str(sp.titular));
  const m = getDb().prepare("SELECT * FROM movements WHERE id = ?").get(Number(id)) as Movement | undefined;
  if (!m || !holder || m.holder_id !== holder.id) notFound();
  const docs = getDb().prepare("SELECT id, title FROM documents WHERE movement_id = ?").all(m.id) as { id: number; title: string }[];
  const data = m.data ? JSON.parse(m.data) : null;
  return (
    <>
      <PageHead title={m.description} back={`/movimientos${str(sp.titular) ? `?titular=${str(sp.titular)}` : ""}`} sub={<>{MOVEMENT_LABELS[m.type]} · <StatusBadge status={m.status} /></>} />
      <div className="card" style={{ maxWidth: 640 }}>
        <dl className="kv">
          <dt>Identificador</dt><dd>{m.uid}</dd>
          <dt>Fecha</dt><dd>{formatDate(m.effective_date)}</dd>
          <dt>Registrado</dt><dd>{m.created_at.replace("T", " ").slice(0, 16)}</dd>
          <dt>Importe</dt><dd>{usd(m.amount_cents)}</dd>
          {m.tokens > 0 && (<><dt>Tokens</dt><dd>{m.tokens}</dd></>)}
          {data?.periodStart && (<><dt>Período</dt><dd>{formatDate(data.periodStart)} – {formatDate(data.periodEnd)}</dd></>)}
          {m.status === "completada" && (<>
            <dt>Capital después</dt><dd>{usd(m.capital_after ?? 0)}</dd>
            <dt>Tokens después</dt><dd>{m.tokens_after}</dd>
            <dt>Intereses disponibles después</dt><dd>{usd(m.available_after ?? 0)}</dd>
          </>)}
          {m.reference && (<><dt>Referencia</dt><dd>{m.reference}</dd></>)}
        </dl>
        {m.notice && <div className="alert info" style={{ marginTop: 16 }}>{m.notice}</div>}
        {docs.length > 0 && (<><h3 style={{ marginTop: 16 }}>Comprobantes</h3><ul>{docs.map((d) => <li key={d.id}><a href={`/api/documentos/${d.id}`}>{d.title}</a></li>)}</ul></>)}
      </div>
    </>
  );
}
