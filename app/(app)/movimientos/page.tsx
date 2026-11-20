import Link from "next/link";
import { resolveHolder, str, type SP } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { holderMovements, MOVEMENT_LABELS, STATUS_LABELS, type Movement, type MovementStatus, type MovementType } from "@/lib/ledger";
import { usd } from "@/lib/money";
import { PageHead, StatusBadge } from "@/components/ui";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type Kind = "in" | "interest" | "reinvest" | "out" | "fix";
function look(m: Movement): { kind: Kind; title: string; sign: "+" | "−" | "" } {
  const open = m.status === "pendiente" || m.status === "aprobada";
  if (open && (m.type === "compra_aporte" || m.type === "compra_comision")) return { kind: "in", title: "Pediste sumar plata", sign: "" };
  if (open && m.type === "cobro_intereses") return { kind: "out", title: "Pediste cobrar intereses", sign: "" };
  if (open && m.type === "rescate") return { kind: "out", title: "Pediste un rescate", sign: "" };
  if (m.status === "rechazada") return { kind: "fix", title: "Solicitud rechazada", sign: "" };
  switch (m.type) {
    case "compra_aporte": return { kind: "in", title: "Pusiste plata", sign: "+" };
    case "compra_comision": return { kind: "in", title: "Invertiste parte de una comisión", sign: "+" };
    case "saldo_inicial_importado": return { kind: "in", title: "Aporte", sign: "+" };
    case "liquidacion": return { kind: "interest", title: "¡Cobro de intereses!", sign: "+" };
    case "reinversion": return { kind: "reinvest", title: "Reinvertiste intereses", sign: "" };
    case "cobro_intereses": return { kind: "out", title: "Cobraste intereses", sign: "−" };
    case "rescate": return { kind: "out", title: "Rescate de tokens", sign: "−" };
    case "devolucion_capital": return { kind: "out", title: "Te devolvieron capital", sign: "−" };
    default: return { kind: "fix", title: "Corrección", sign: "" };
  }
}

function Icon({ kind }: { kind: Kind }) {
  const paths: Record<Kind, React.ReactNode> = {
    in: <path d="M12 6v12M6 12h12" />,
    interest: <path d="M12 5l2.1 4.3 4.7.7-3.4 3.3.8 4.7L12 15.8 7.8 18l.8-4.7L5.2 10l4.7-.7z" />,
    reinvest: <path d="M17 8a6 6 0 1 0 1 6M17 4v4h-4" />,
    out: <path d="M12 18V6M7 11l5-5 5 5" />,
    fix: <path d="M8 12h8" />,
  };
  return (
    <span className={`tl-icon tl-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>
    </span>
  );
}

export default async function MovementsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { holder } = await resolveHolder(str(sp.titular));
  if (!holder) return (<><PageHead title="Tus movimientos" back="/" /><div className="card empty">No tenés un panel de Renta Work.</div></>);
  const f = { from: str(sp.desde), to: str(sp.hasta), type: str(sp.tipo), status: str(sp.estado) };
  const ms = holderMovements(holder.id, f);
  const qs = new URLSearchParams(Object.entries({ desde: f.from, hasta: f.to, tipo: f.type, estado: f.status, titular: str(sp.titular) }).filter(([, v]) => v) as [string, string][]).toString();
  const groups = new Map<string, Movement[]>();
  for (const m of ms) {
    const k = m.effective_date.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const filtered = !!(f.from || f.to || f.type || f.status);

  return (
    <>
      <PageHead title="Tus movimientos" back={`/${str(sp.titular) ? `?titular=${str(sp.titular)}` : ""}`} sub="La historia de tu plata, de lo más nuevo a lo más viejo.">
        <a className="btn small" href={`/api/movimientos.csv${qs ? "?" + qs : ""}`}>Descargar (CSV)</a>
      </PageHead>

      <details className="card" open={filtered} style={{ marginBottom: 18 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Filtrar</summary>
        <form method="get" className="inline-form" style={{ marginTop: 12 }}>
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
      </details>

      {ms.length === 0 ? <div className="card empty">No hay movimientos{filtered ? " con esos filtros" : ""}.</div> : (
        <div className="card">
          {[...groups.entries()].map(([month, items]) => {
            const [y, mo] = month.split("-").map(Number);
            return (
              <section key={month} className="tl-month">
                <h3 className="tl-head">{MONTHS[mo - 1]} {y}</h3>
                <ol className="timeline">
                  {items.map((m) => {
                    const l = look(m);
                    return (
                      <li key={m.id} className={`tl-item ${l.kind === "interest" ? "tl-milestone" : ""}`}>
                        <Icon kind={l.kind} />
                        <div className="tl-body">
                          <Link href={`/movimientos/${m.id}${str(sp.titular) ? `?titular=${str(sp.titular)}` : ""}`} className="tl-title">{l.title}</Link>
                          <small>{formatDate(m.effective_date)} · {m.description}</small>
                          {m.status !== "completada" && <span><StatusBadge status={m.status} /></span>}
                        </div>
                        <span className={`tl-amt num ${l.kind === "interest" ? "amount-interest" : l.kind === "in" ? "amount-capital" : ""}`}>
                          {l.sign}{l.sign ? " " : ""}{usd(m.amount_cents)}
                          {m.tokens > 0 && <small>{m.tokens} token{m.tokens > 1 ? "s" : ""}</small>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
          <p className="note" style={{ marginBottom: 0 }}>Las solicitudes pendientes no cambian tus saldos. Los movimientos nunca se borran: si hay un error se corrige con un movimiento nuevo.</p>
        </div>
      )}
    </>
  );
}
