import { daysBetween, formatDate, monthLabel } from "@/lib/dates";
import { usd } from "@/lib/money";
import type { ChartData } from "@/lib/views";

const W = 720;
const H = 260;
const PAD = { l: 74, r: 16, t: 16, b: 36 };

function short(cents: number) {
  const v = cents / 100;
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} k`;
  return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

/**
 * Evolución de la cartera. Banda azul = aportes externos menos retiros; banda verde = ganancias generadas.
 * El borde superior es el total de la cartera y concilia con los saldos de hoy.
 */
export function PortfolioChart({ data }: { data: ChartData }) {
  const { history, projection } = data;
  if (history.length === 0) return <div className="empty">Todavía no hay movimientos para graficar.</div>;

  const start = history[0].date;
  const end = projection.length ? projection[projection.length - 1].date : history[history.length - 1].date;
  const span = Math.max(1, daysBetween(start, end));
  const maxV = Math.max(...history.map((p) => p.totalCents), ...projection.map((p) => p.totalCents), 1) * 1.08;
  const x = (d: string) => PAD.l + (daysBetween(start, d) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (Math.max(0, v) / maxV) * (H - PAD.t - PAD.b);

  const base = history.map((p) => ({ d: p.date, v: p.contributedCents - p.withdrawnCents }));
  const top = history.map((p) => ({ d: p.date, v: p.totalCents }));
  const line = (pts: { d: string; v: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const areaBetween = (upper: { d: string; v: number }[], lower: { d: string; v: number }[]) =>
    `${line(upper)} ${[...lower].reverse().map((p) => `L${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} Z`;
  const zero = history.map((p) => ({ d: p.date, v: 0 }));

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => (maxV / 1.08) * f);
  const todayX = x(history[history.length - 1].date);
  const months = history.length > 1 ? history.filter((_, i) => i % Math.ceil(history.length / 6) === 0) : history;
  const last = history[history.length - 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución de la cartera. Total hoy ${usd(last.totalCents)}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">USD {short(t)}</text>
          </g>
        ))}
        <path d={areaBetween(base, zero)} fill="var(--navy)" opacity="0.85" />
        <path d={areaBetween(top, base)} fill="var(--green)" opacity="0.75" />
        <path d={line(top)} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
        {projection.length > 1 && (
          <path d={line(projection.map((p) => ({ d: p.date, v: p.totalCents })))} fill="none" stroke="var(--green)" strokeWidth="2" strokeDasharray="5 5" />
        )}
        <line x1={todayX} x2={todayX} y1={PAD.t} y2={H - PAD.b} stroke="var(--faint)" strokeDasharray="2 3" />
        <text x={todayX + 4} y={PAD.t + 10} fontSize="11" fill="var(--muted)">Hoy</text>
        {projection.length > 1 && (
          <text x={W - PAD.r} y={PAD.t + 10} textAnchor="end" fontSize="11" fill="var(--green)">Proyección</text>
        )}
        {data.withdrawals.map((w, i) => (
          <path key={`w${i}`} d={`M${x(w.date) - 5},${H - PAD.b + 4} l10,0 l-5,7 Z`} fill="var(--faint)">
            <title>{`Retiro ${formatDate(w.date)}: ${usd(w.cents)}`}</title>
          </path>
        ))}
        {data.reinvestments.map((r, i) => {
          const pt = history.reduce((a, p) => (p.date <= r.date ? p : a), history[0]);
          return (
            <circle key={`r${i}`} cx={x(r.date)} cy={y(pt.contributedCents - pt.withdrawnCents)} r="4" fill="#fff" stroke="var(--green)" strokeWidth="2">
              <title>{`Reinversión ${formatDate(r.date)}: ${usd(r.cents)} (movimiento interno)`}</title>
            </circle>
          );
        })}
        {months.map((p) => (
          <text key={p.date} x={x(p.date)} y={H - 8} fontSize="11" fill="var(--faint)" textAnchor="middle">{monthLabel(p.date)}</text>
        ))}
      </svg>
      <div className="legend">
        <span><i className="dot navy" /> Aportes externos (menos retiros)</span>
        <span><i className="dot green" /> Ganancias generadas</span>
        <span><svg width="10" height="8"><path d="M0,0 l10,0 l-5,7 Z" fill="var(--faint)" /></svg> Retiros</span>
        <span><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="#fff" stroke="var(--green)" strokeWidth="2" /></svg> Reinversión (interna, no es ganancia nueva)</span>
        <span><svg width="18" height="4"><line x1="0" x2="18" y1="2" y2="2" stroke="var(--green)" strokeWidth="2" strokeDasharray="4 3" /></svg> Proyección sin reinversiones (no es historia)</span>
      </div>
      <p className="note" style={{ marginTop: 8 }}>
        Hoy: aportes {usd(last.contributedCents)} − retiros {usd(last.withdrawnCents)} + ganancias {usd(last.generatedCents)} = {usd(last.totalCents)}.
      </p>
    </div>
  );
}
