import Link from "next/link";
import { resolveHolder, str, type SP } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { holderMovements, MOVEMENT_LABELS, STATUS_LABELS, type MovementType, type MovementStatus } from "@/lib/ledger";
import { usd } from "@/lib/money";
import { PageHead, StatusBadge } from "@/components/ui";

export default async function MovementsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { holder } = await resolveHolder(str(sp.titular));
  if (!holder) return (<><PageHead title="Mis movimientos" /><div className="card empty">No tenés un portfolio.</div></>);
  const f = { from: str(sp.desde), to: str(sp.hasta), type: str(sp.tipo), status: str(sp.estado) };
  const ms = holderMovements(holder.id, f);
  const qs = new URLSearchParams(Object.entries({ desde: f.from, hasta: f.to, tipo: f.type, estado: f.status, titular: str(sp.titular) }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHead title="Mis movimientos" sub={holder.name}>
        <a className="btn" href={`/api/movimientos.csv${qs ? "?" + qs : ""}`}>Descargar historial (CSV)</a>
      </PageHead>
      <form method="get" className="card inline-form">
        {str(sp.titular) && <input type="hidden" name="titular" value={str(sp.titular)} />}
        <label>Desde<input type="date" name="desde" defaultValue={f.from} /></label>
        <label>Hasta<input type="date" name="hasta" defaultValue={f.to} /></label>
        <label>Tipo
          <select name="tipo" defaultValue={f.type ?? ""}>
            <option value="">Todos</option>
            {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((t) => <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>)}
          </select>
        </label>
        <label>Estado
          <select name="estado" defaultValue={f.status ?? ""}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABELS) as MovementStatus[]).map((t) => <option key={t} value={t}>{STATUS_LABELS[t]}</option>)}
          </select>
        </label>
        <button className="btn primary" type="submit">Filtrar</button>
      </form>
      <div className="card section">
        {ms.length === 0 ? <p className="muted">No hay movimientos con esos filtros.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Descripción</th><th className="r">Tokens</th><th className="r">Importe</th><th>Estado</th><th className="r hide-sm">Capital después</th><th className="r hide-sm">Disponible después</th></tr></thead>
              <tbody>
                {ms.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDate(m.effective_date)}</td>
                    <td><Link href={`/movimientos/${m.id}${str(sp.titular) ? `?titular=${str(sp.titular)}` : ""}`}>{m.description}</Link><br /><small className="faint">{MOVEMENT_LABELS[m.type]} · {m.uid}</small></td>
                    <td className="r num">{m.tokens || ""}</td>
                    <td className="r num">{usd(m.amount_cents)}</td>
                    <td><StatusBadge status={m.status} /></td>
                    <td className="r num hide-sm">{m.capital_after === null ? "—" : usd(m.capital_after)}</td>
                    <td className="r num hide-sm">{m.available_after === null ? "—" : usd(m.available_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note" style={{ marginTop: 12 }}>Las solicitudes pendientes no cambian tus saldos. Los movimientos no se borran: las correcciones se registran como reversos.</p>
      </div>
    </>
  );
}
