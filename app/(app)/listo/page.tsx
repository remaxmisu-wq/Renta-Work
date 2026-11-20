import Link from "next/link";
import { resolveHolder, str, type SP } from "@/lib/session";
import { ledgerBalances } from "@/lib/ledger";
import { num, usd } from "@/lib/money";
import { currentM2PriceCents } from "@/lib/views";

const COLORS = ["var(--green)", "#f5c542", "var(--navy)", "#e3a978", "#7cc7a2"];

/** Festejo después de invertir o reinvertir. */
export default async function DonePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { holder } = await resolveHolder();
  const tipo = str(sp.tipo) === "reinversion" ? "reinversion" : "inversion";
  const tokens = Math.max(1, Number(str(sp.tokens)) || 1);
  const add = tokens * 10_000;
  const b = holder ? ledgerBalances(holder.id) : { capitalCents: 0, tokens: 0, availableCents: 0 };
  // En una inversión el capital todavía no está acreditado: se suma para mostrar cómo va a quedar.
  const capitalAfter = tipo === "inversion" ? b.capitalCents + add : b.capitalCents;
  const tokensAfter = tipo === "inversion" ? b.tokens + tokens : b.tokens;
  const price = currentM2PriceCents();
  const m2After = price ? capitalAfter / price : null;
  const m2Before = price ? (capitalAfter - add) / price : null;
  const crossed = m2After !== null && m2Before !== null ? [1, 2, 5, 10, 20, 40].filter((g) => m2Before < g && m2After >= g).pop() : undefined;

  return (
    <div className="celebrate">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 7) * 0.12}s`, transform: `rotate(${i * 29}deg)` }} />
        ))}
      </div>
      <div className="card celebrate-card">
        <div className="celebrate-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="72" height="72"><circle cx="32" cy="32" r="30" fill="var(--green)" /><path d="M19 33l9 9 17-19" fill="none" stroke="var(--surface)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h1>{tipo === "reinversion" ? `¡Reinvertiste ${tokens} token${tokens > 1 ? "s" : ""}!` : `¡Pediste sumar ${tokens} token${tokens > 1 ? "s" : ""}!`}</h1>
        <p className="muted" style={{ fontSize: "1.05rem" }}>
          {tipo === "reinversion"
            ? "Tus intereses ya se convirtieron en capital y empiezan a generar desde hoy."
            : `Son ${usd(add).replace(/,00$/, "")}. Empiezan a generar intereses el día que se confirmen los fondos.`}
        </p>
        <div className="celebrate-grid">
          <div><small>{tipo === "reinversion" ? "Ganás de más por mes" : "Vas a ganar de más por mes"}</small><strong className="amount-interest num">+ {usd(Math.floor((add * 0.12) / 12))}</strong></div>
          <div><small>{tipo === "reinversion" ? "Ahora tenés" : "Vas a tener"}</small><strong className="num">{num(tokensAfter)} tokens</strong></div>
          <div><small>{tipo === "reinversion" ? "Tu plata genera" : "Tu plata va a generar"}</small><strong className="num">{usd(Math.floor((capitalAfter * 0.12) / 12))} por mes</strong></div>
          {m2After !== null && <div><small>Equivale a</small><strong className="num">{num(m2After, 2)} m² del depto</strong></div>}
        </div>
        {crossed && (
          <div className="alert ok" style={{ marginTop: 16 }}>Logro desbloqueado: <strong>{crossed} m² del depto</strong></div>
        )}
        <div className="actions" style={{ justifyContent: "center", marginTop: 20 }}>
          <Link className="btn green" href="/">Volver a mi panel</Link>
          <Link className="btn" href="/inversion">Ver la inversión de todos</Link>
        </div>
        {tipo === "inversion" && <p className="note" style={{ marginTop: 16, marginBottom: 0 }}>La solicitud queda pendiente hasta que el administrador confirme los fondos.</p>}
      </div>
    </div>
  );
}
