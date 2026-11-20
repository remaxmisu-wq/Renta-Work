import { usd } from "@/lib/money";
import type { InvestorListRow } from "@/lib/views";
import { DemoBadge } from "./ui";

/** Tabla de posiciones: todos los participantes, ordenados por plata puesta. */
export function Leaderboard({ rows, meId, total }: {
  rows: InvestorListRow[]; meId: number | null;
  total: { investedCents: number; generatedCents: number; perMonthCents: number };
}) {
  if (!rows.length) return null;
  return (
    <div className="card section">
      <div className="total-row" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Tabla de posiciones</h2>
        <span className="muted">{rows.length} inversor{rows.length > 1 ? "es" : ""}</span>
      </div>
      <p className="note" style={{ marginTop: 0 }}>Todos los que participan en Renta Work, ordenados por la plata que pusieron.</p>
      <ol className="board">
        {rows.map((r, i) => (
          <li key={r.holderId} className={r.holderId === meId ? "me" : ""}>
            <span className={`pos pos-${i + 1}`}>{i + 1}</span>
            <span className="who">
              <span><strong>{r.name}</strong>{r.holderId === meId && <span className="you">Vos</span>} <DemoBadge show={r.isDemo} /></span>
              <small className="num">Genera {usd(r.perMonthCents)} por mes</small>
            </span>
            <span className="amt">
              <span className="num amount-capital">{usd(r.investedCents)}</span>
              <small className="num amount-interest">+ {usd(r.generatedCents)} generados</small>
            </span>
          </li>
        ))}
      </ol>
      <div className="board-total">
        <span>Entre todos ponemos a trabajar <strong className="num">{usd(total.investedCents)}</strong></span>
        <span>y ya generamos <strong className="num amount-interest">+ {usd(total.generatedCents)}</strong> · <span className="num">{usd(total.perMonthCents)}</span> por mes</span>
      </div>
    </div>
  );
}
