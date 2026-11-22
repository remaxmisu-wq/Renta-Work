// Piezas visuales del panel: contador en vivo, simulador, logros. Server components con
// atributos data-* que public/rw-enhance.js anima en el navegador.
import Link from "next/link";
import { parseISO, type ISODate } from "@/lib/dates";
import { usd } from "@/lib/money";

export function LiveTicker({ baseCents, perDayCents, asOf }: { baseCents: number; perDayCents: number; asOf: ISODate }) {
  return (
    <span data-ticker="" data-base={baseCents} data-perday={perDayCents} data-t0={parseISO(asOf).getTime()}>
      <span data-value="" className="num">{usd(baseCents)}</span>
    </span>
  );
}

export function Simulator({ capitalCents, rateBps, m2PriceCents, ctaHref, ctaNote, initialTokens = 10, title = "¿Y si sumás más?", subtitle = "Mové la barra y mirá cuánto ganarías.", formName, maxTokens = 100, follow = false }: {
  capitalCents: number; rateBps: number; m2PriceCents: number | null; ctaHref: string | null; ctaNote?: string; initialTokens?: number;
  title?: string; subtitle?: string; formName?: string; maxTokens?: number; follow?: boolean;
}) {
  const add = initialTokens * 10_000;
  const rate = rateBps / 10_000;
  const m2 = m2PriceCents ? ((capitalCents + add) / m2PriceCents).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  return (
    <div className="card sim" data-sim="" data-follow={follow ? "" : undefined} data-rate={rateBps} data-capital={capitalCents} data-m2price={m2PriceCents ?? 0}>
      <h2 style={{ marginBottom: 4 }}>{title}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{subtitle}</p>
      <div className="sim-head">
        <strong data-out="tokens">{initialTokens} tokens</strong>
        <strong className="num" data-out="amount">{usd(add).replace(/,00$/, "")}</strong>
      </div>
      <input type="range" name={formName} min={1} max={Math.max(1, maxTokens)} step={1} defaultValue={initialTokens} aria-label="Cantidad de tokens a sumar" className="sim-range" />
      <div className="sim-grid">
        <div><small>Ganarías de más por mes</small><span className="num amount-interest" data-out="month">+ {usd(Math.floor((add * rate) / 12))}</span></div>
        <div><small>Por año</small><span className="num amount-interest" data-out="year">+ {usd(Math.floor(add * rate))}</span></div>
        <div><small>{capitalCents ? "En total generaría por mes" : "Por mes en total"}</small><span className="num" data-out="total-month">{usd(Math.floor(((capitalCents + add) * rate) / 12))}</span></div>
        {m2 && <div><small>Equivalencia orientativa</small><span className="num" data-out="m2">{m2} m²</span></div>}
      </div>
      {ctaHref ? (
        <Link href={`${ctaHref}?tokens=${initialTokens}`} className="btn primary" style={{ width: "100%", marginTop: 16 }} data-out="cta">Quiero invertir {usd(add).replace(/,00$/, "")}</Link>
      ) : null}
      <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>{ctaNote ?? `Estimado al ${rateBps / 100}% anual pactado. No es una garantía de pago.`}</p>
    </div>
  );
}

export interface Badge { label: string; done: boolean; hint: string }

export function Achievements({ items }: { items: Badge[] }) {
  const done = items.filter((b) => b.done).length;
  return (
    <div className="card section">
      <div className="total-row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Tus logros</h2>
        <span className="muted num">{done} de {items.length}</span>
      </div>
      <div className="badges">
        {items.map((b) => (
          <div key={b.label} className={`ach ${b.done ? "on" : ""}`} title={b.hint}>
            <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill={b.done ? "var(--green)" : "var(--bg)"} stroke={b.done ? "var(--green)" : "var(--field)"} strokeWidth="2" strokeDasharray={b.done ? "0" : "4 3"} />
              {b.done ? <path d="M12 20.5l5.5 5.5L28 15" fill="none" stroke="var(--surface)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                : <path d="M20 13v8M20 26v.5" stroke="var(--faint)" strokeWidth="3" strokeLinecap="round" />}
            </svg>
            <strong>{b.label}</strong>
            <small>{b.hint}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReinvestNudge({ availableCents, rateBps, href }: { availableCents: number; rateBps: number; href: string | null }) {
  const tokens = Math.floor(availableCents / 10_000);
  if (tokens < 1) return null;
  const extra = Math.floor((tokens * 10_000 * rateBps) / 10_000 / 12);
  return (
    <div className="card nudge">
      <div>
        <strong>¡Tus intereses ya alcanzan para {tokens} token{tokens > 1 ? "s" : ""} más!</strong>
        <p style={{ margin: "4px 0 0" }}>Si reinvertís {usd(tokens * 10_000).replace(/,00$/, "")}, tu plata genera <strong>{usd(extra)} más por mes</strong>, sin poner un peso nuevo.</p>
      </div>
      {href && <Link className="btn green" href={href}>Reinvertir</Link>}
    </div>
  );
}
