import Link from "next/link";
import { resolveHolder, str, type SP } from "@/lib/session";
import { formatDate, formatDateLong, today } from "@/lib/dates";
import { holderMovements, portfolio } from "@/lib/ledger";
import { pct, usd } from "@/lib/money";
import { chartData, simplePanel } from "@/lib/views";
import { InterestChart } from "@/components/InterestChart";
import { DemoBadge, Flash, StatusBadge } from "@/components/ui";

export default async function PanelPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { user, holder, viewingOther } = await resolveHolder(str(sp.titular));
  if (!holder) {
    return (
      <div className="card empty">
        <h2>Todavía no tenés un panel de Renta Work</h2>
        <p>Cuando el administrador habilite tu usuario vas a ver acá cuánto pusiste y cuánto te generó.</p>
        {user.role === "admin" && <Link className="btn" href="/admin">Ir a administración</Link>}
      </div>
    );
  }

  const asOf = today();
  const s = simplePanel(holder.id, asOf);
  const pf = portfolio(holder.id, asOf);
  const chart = chartData(holder.id, asOf);
  const recent = holderMovements(holder.id).slice(0, 5);
  const isToken = holder.kind === "token";
  const first = holder.name.split(" ")[0];
  const next = s.upcoming[0];
  const q = viewingOther ? `?titular=${holder.id}` : "";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{viewingOther ? holder.name : `Hola, ${first}`} <DemoBadge show={holder.is_demo} /></h1>
          <p className="muted" style={{ margin: 0 }}>Así está {viewingOther ? "su" : "tu"} inversión al {formatDateLong(asOf)}.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className="grid cols-2">
        <div className="card">
          <h2>{viewingOther ? "Su" : "Tu"} plata</h2>
          <dl className="kv">
            <dt>Pusiste</dt><dd>{usd(s.investedCents)}</dd>
            <dt>Intereses generados hasta hoy</dt><dd className="amount-interest">+ {usd(s.generatedCents)}</dd>
            {s.collectedCents > 0 && (<><dt>Intereses ya cobrados</dt><dd>− {usd(s.collectedCents)}</dd></>)}
          </dl>
          <div className="total-row" style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 16 }}>
            <strong>Hoy tenés</strong>
            <span className="num" style={{ fontSize: "1.9rem", fontWeight: 750 }}>{usd(s.todayCents)}</span>
          </div>
        </div>

        <div className="stack">
          <div className="card highlight-card">
            <div className="total-row">
              <span><strong>{viewingOther ? "Su" : "Tu"} plata genera</strong><br /><small>Al {pct(s.rateBps)} anual, todos los días</small></span>
              <span style={{ textAlign: "right" }}>
                <span className="up num">▲ {usd(s.perMonthCents)}</span> <small>por mes</small><br />
                <small className="num">{usd(s.perDayCents)} por día</small>
              </span>
            </div>
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Próximo cobro de intereses</h2>
            {next ? (
              <>
                <div className="total-row">
                  <strong className="num" style={{ fontSize: "1.25rem" }}>{formatDate(next.date)}</strong>
                  <span className="amount-interest num" style={{ fontSize: "1.25rem" }}>≈ {usd(next.cents)}</span>
                </div>
                {s.upcoming.length > 1 && (
                  <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
                    Después: {s.upcoming.slice(1, 4).map((u) => `${formatDate(u.date)} (≈ ${usd(u.cents)})`).join(" · ")}
                  </p>
                )}
              </>
            ) : <p className="muted" style={{ margin: 0 }}>No hay cobros programados.</p>}
          </div>
        </div>
      </div>

      <div className="card section">
        <h2>Cómo crecen {viewingOther ? "sus" : "tus"} intereses</h2>
        <InterestChart data={chart} />
      </div>

      {s.availableCents > 0 && !viewingOther && (
        <div className="card section highlight-card">
          <div className="total-row">
            <span><strong>Tenés {usd(s.availableCents)} de intereses para usar</strong><br /><small>Podés cobrarlos o, si suman USD 100 o más, reinvertirlos.</small></span>
            <span className="actions">
              {isToken && <Link className="btn green" href="/reinvertir">Reinvertir</Link>}
              <Link className="btn" href="/cobrar">Cobrar</Link>
            </span>
          </div>
        </div>
      )}

      {!viewingOther && isToken && (
        <div className="actions section">
          <Link className="btn primary" href="/invertir">Invertir más</Link>
          <Link className="btn" href="/rescatar">Pedir rescate</Link>
        </div>
      )}

      {pf.pending.length > 0 && (
        <div className="alert info section">
          {pf.pending.length === 1 ? "Tenés una solicitud en curso" : `Tenés ${pf.pending.length} solicitudes en curso`}: {pf.pending.map((m) => m.description).join(" · ")}. No cambian tus saldos hasta completarse.
        </div>
      )}

      <div className="card section">
        <div className="total-row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Últimos movimientos</h2>
          <Link href={`/movimientos${q}`} className="note">Ver todos</Link>
        </div>
        <ul className="list">
          {recent.map((m) => (
            <li key={m.id}>
              <span>{m.description}<br /><small>{formatDate(m.effective_date)}</small></span>
              <span style={{ textAlign: "right" }}>
                <span className={`num ${m.type === "liquidacion" ? "amount-interest" : ""}`}>{usd(m.amount_cents)}</span>
                {m.status !== "completada" && <><br /><StatusBadge status={m.status} /></>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <details className="card section">
        <summary style={{ cursor: "pointer", fontWeight: 650 }}>Ver el detalle de cada aporte</summary>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Fecha</th><th className="r">Monto</th><th className="r">Intereses generados</th><th>Próximo cobro</th><th>Vence</th></tr></thead>
            <tbody>
              {pf.positions.filter((p) => p.status !== "cancelada").map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.activation_date)}{p.origin === "reinversion" && <small className="faint"> · reinversión</small>}</td>
                  <td className="r num">{usd(p.outstanding_cents)}</td>
                  <td className="r num amount-interest">{usd(p.settledInterestCents + p.accruedCents)}</td>
                  <td>{formatDate(p.nextSettlement)}</td>
                  <td>{p.maturity_date ? formatDate(p.maturity_date) : <small className="faint">A definir</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 12, marginBottom: 0 }}>
          Cada aporte genera {pct(s.rateBps)} anual y cobra intereses cada 6 meses desde su fecha. Es una tasa pactada, no una garantía de pago.
        </p>
      </details>
    </>
  );
}
