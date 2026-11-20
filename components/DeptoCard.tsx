import { formatDate } from "@/lib/dates";
import { num, usd } from "@/lib/money";
import type { DeptoEquivalence } from "@/lib/views";

const COLS = 13;

/**
 * Ilustración: la unidad dibujada como una grilla de cuadraditos de 1 m².
 * Se pintan los m² que equivalen, orientativamente, al capital del inversor.
 */
export function DeptoCard({ d, own = true }: { d: DeptoEquivalence; own?: boolean }) {
  const cells = Math.ceil(d.surfaceM2);
  const rows = Math.ceil(cells / COLS);
  const size = 26;
  const gap = 4;
  const W = COLS * (size + gap) - gap;
  const H = rows * (size + gap) - gap;
  const filled = Math.min(d.m2, cells);
  const pctShare = (d.share * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return (
    <div className="card section">
      <h2 style={{ marginBottom: 4 }}>{own ? "Tu" : "Su"} relación con el departamento</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {d.projectName} · Unidad {d.unit} · {d.typology} · {num(d.surfaceM2, 2)} m² · {d.address}
      </p>
      <div className="depto">
        <div className="depto-figure">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`La unidad tiene ${num(d.surfaceM2, 2)} m². ${own ? "Tu" : "Su"} capital equivale a ${num(d.m2, 2)} m².`}>
            {Array.from({ length: cells }, (_, i) => {
              const x = (i % COLS) * (size + gap);
              const y = Math.floor(i / COLS) * (size + gap);
              const part = Math.max(0, Math.min(1, filled - i));
              return (
                <g key={i}>
                  <rect x={x} y={y} width={size} height={size} rx="4" fill="var(--bg)" stroke="var(--line)" />
                  {part > 0 && <rect x={x} y={y} width={size * part} height={size} rx="4" fill="var(--green)" />}
                </g>
              );
            })}
          </svg>
          <div className="legend">
            <span><i className="dot green" /> {own ? "Lo que equivale tu" : "Lo que equivale su"} capital</span>
            <span><i className="dot gray" /> 1 cuadradito = 1 m² de la unidad</span>
          </div>
        </div>
        <div>
          <p style={{ fontSize: "1.05rem" }}>
            {own ? "Tu" : "Su"} capital de <strong>{usd(d.capitalCents)}</strong> equivale hoy, de forma orientativa, a
          </p>
          <p className="num" style={{ fontSize: "2rem", fontWeight: 750, margin: "0 0 4px", color: "var(--green)" }}>{num(d.m2, 2)} m²</p>
          <p className="muted">Es el {pctShare} % de la unidad.</p>
          <dl className="kv" style={{ fontSize: "0.93rem" }}>
            <dt>Valor de referencia del m²</dt><dd>{usd(d.pricePerM2Cents)}</dd>
            <dt>Precio de referencia de la unidad</dt><dd>{usd(d.unitPriceCents)}</dd>
            <dt>Valores al</dt><dd>{formatDate(d.priceDate)}</dd>
          </dl>
        </div>
      </div>
      <ul className="note" style={{ margin: "16px 0 0", paddingLeft: 18 }}>
        <li>Es una referencia para dimensionar la inversión: no son metros de {own ? "tu" : "su"} propiedad.</li>
        <li>Si sube el valor del m², la equivalencia baja. {own ? "Tus" : "Sus"} dólares y tokens no cambian por eso.</li>
        <li>Si el departamento se valoriza, la inversión no aumenta automáticamente: rinde el 12 % anual pactado.</li>
      </ul>
    </div>
  );
}
