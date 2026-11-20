import { daysBetween, monthLabel } from "@/lib/dates";
import { usd } from "@/lib/money";
import type { ChartData } from "@/lib/views";

const W = 720;
const H = 230;
const PAD = { l: 16, r: 16, t: 34, b: 30 };

function short(cents: number) {
  return usd(Math.round(cents / 100) * 100).replace(/,00$/, "");
}

/**
 * Gráfico ilustrativo: cómo crecen los intereses. Verde lleno = lo generado hasta hoy;
 * línea punteada = estimado de los próximos 12 meses si no se agrega ni se retira plata.
 */
export function InterestChart({ data }: { data: ChartData }) {
  const { history, projection } = data;
  if (!history.length) return <div className="empty">Cuando tengas tu primera inversión, acá vas a ver cómo crecen tus intereses.</div>;
  const last = history[history.length - 1];
  const proj = projection.map((p) => ({ date: p.date, v: last.generatedCents + (p.totalCents - last.totalCents) }));
  const start = history[0].date;
  const end = proj.length ? proj[proj.length - 1].date : last.date;
  const span = Math.max(1, daysBetween(start, end));
  const maxV = Math.max(1, ...proj.map((p) => p.v), last.generatedCents) * 1.05;
  const x = (d: string) => PAD.l + (daysBetween(start, d) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (Math.max(0, v) / maxV) * (H - PAD.t - PAD.b);
  const pts = history.map((p) => `${x(p.date).toFixed(1)},${y(p.generatedCents).toFixed(1)}`);
  const area = `M${x(start)},${y(0)} L${pts.join(" L")} L${x(last.date)},${y(0)} Z`;
  const line = `M${pts.join(" L")}`;
  const projLine = proj.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const endP = proj[proj.length - 1];

  const labels: string[] = [];
  for (const d of [start, last.date, ...proj.filter((_, i) => i % 3 === 0).map((p) => p.date), end]) {
    if (labels.every((l) => Math.abs(x(l) - x(d)) > 60)) labels.push(d);
  }

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Intereses generados: ${usd(last.generatedCents)} hoy; estimado en un año ${usd(endP?.v ?? last.generatedCents)}.`}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        <path d={area} fill="var(--green)" opacity="0.18" />
        <path d={line} fill="none" stroke="var(--green)" strokeWidth="2.5" />
        {endP && <path d={projLine} fill="none" stroke="var(--green)" strokeWidth="2" strokeDasharray="6 6" opacity="0.8" />}
        <circle cx={x(last.date)} cy={y(last.generatedCents)} r="5" fill="var(--green)" />
        <text x={x(last.date)} y={y(last.generatedCents) - 12} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--ink)">Hoy {short(last.generatedCents)}</text>
        {endP && (
          <>
            <circle cx={x(endP.date)} cy={y(endP.v)} r="4" fill="var(--surface)" stroke="var(--green)" strokeWidth="2" />
            <text x={x(endP.date) - 4} y={y(endP.v) - 12} textAnchor="end" fontSize="13" fill="var(--muted)">En un año ≈ {short(endP.v)}</text>
          </>
        )}
        {labels.map((d) => (
          <text key={d} x={x(d)} y={H - 8} fontSize="12" fill="var(--faint)" textAnchor={d === start ? "start" : d === end ? "end" : "middle"}>{monthLabel(d)}</text>
        ))}
      </svg>
      <div className="legend">
        <span><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke="var(--green)" strokeWidth="2.5" /></svg> Intereses generados</span>
        <span><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke="var(--green)" strokeWidth="2" strokeDasharray="4 3" /></svg> Estimado si no agregás ni retirás plata</span>
      </div>
    </div>
  );
}
