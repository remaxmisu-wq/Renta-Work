import Link from "next/link";
import { resolveHolder, str, type SP } from "@/lib/session";
import { holderMovements, ledgerBalances } from "@/lib/ledger";
import { num, usd } from "@/lib/money";
import { currentM2PriceCents } from "@/lib/views";

/**
 * Después de invertir o reinvertir.
 * - Inversión: es una solicitud. Mostramos "Solicitud recibida", los pasos que faltan y cómo va a quedar.
 * - Reinversión: ya está hecha. Festejo breve con lo que cambió.
 */
export default async function DonePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { holder } = await resolveHolder();
  const tipo = str(sp.tipo) === "reinversion" ? "reinversion" : "inversion";
  const tokens = Math.max(1, Number(str(sp.tokens)) || 1);
  const add = tokens * 10_000;
  const b = holder ? ledgerBalances(holder.id) : { capitalCents: 0, tokens: 0, availableCents: 0 };
  const price = currentM2PriceCents();
  const rate = 0.12;

  if (tipo === "inversion") {
    const capAfter = b.capitalCents + add;
    return (
      <div className="card done-card" data-done-box="" data-rate={1200} data-capital={b.capitalCents} data-tokens={b.tokens} data-m2price={price ?? 0}>
        <div className="done-icon pending-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="29" fill="none" stroke="var(--navy)" strokeWidth="4" /><path d="M32 18v15l9 6" fill="none" stroke="var(--navy)" strokeWidth="4" strokeLinecap="round" /></svg>
        </div>
        <h1>Solicitud recibida</h1>
        <p className="muted" style={{ fontSize: "1.05rem" }}>
          Pediste sumar <strong data-done="tokens">{tokens} {tokens === 1 ? "token" : "tokens"}</strong> (<span data-done="amount">{usd(add).replace(/,00$/, "")}</span>). Todavía no se movió plata.
        </p>
        <ol className="track">
          <li className="ok"><strong>Solicitud recibida</strong><small>Listo</small></li>
          <li><strong>Confirmación de los fondos</strong><small>Hacés la transferencia o se toma la parte de tu comisión</small></li>
          <li><strong>Inversión activa</strong><small>Desde ese día empieza a generar intereses</small></li>
        </ol>
        <h3 style={{ marginTop: 22 }}>Cuando se active, así va a quedar tu inversión</h3>
        <div className="done-grid">
          <div><small>Vas a ganar de más por mes</small><strong className="amount-interest num" data-done="month">+ {usd(Math.floor((add * rate) / 12))}</strong></div>
          <div><small>Vas a tener</small><strong className="num" data-done="tokens-after">{num(b.tokens + tokens)} tokens</strong></div>
          <div><small>Tu plata va a generar</small><strong className="num" data-done="total-month">{usd(Math.floor((capAfter * rate) / 12))} por mes</strong></div>
          {price && <div><small>Equivalencia orientativa</small><strong className="num" data-done="m2">{num(capAfter / price, 2)} m²</strong></div>}
        </div>
        <div className="actions" style={{ justifyContent: "center", marginTop: 22 }}>
          <Link className="btn primary" href="/">Volver a mi panel</Link>
          <Link className="btn" href="/movimientos">Ver mi solicitud</Link>
        </div>
        <p className="note" style={{ marginTop: 14, marginBottom: 0 }}>Los nuevos saldos y tus hitos se actualizan cuando la inversión esté activa.</p>
      </div>
    );
  }

  // Reinversión: ya se hizo.
  const firstTime = holder ? holderMovements(holder.id, { type: "reinversion", status: "completada" }).length === 1 : false;
  return (
    <div className="card done-card">
      <div className="done-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="30" fill="var(--green)" /><path d="M19 33l9 9 17-19" fill="none" stroke="var(--on-navy)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <h1>¡Listo! Reinvertiste {tokens} {tokens === 1 ? "token" : "tokens"}</h1>
      <p className="muted" style={{ fontSize: "1.05rem" }}>Tus intereses se convirtieron en capital y desde hoy también generan intereses. Sin poner un peso nuevo.</p>
      <div className="done-grid">
        <div><small>Ganás de más por mes</small><strong className="amount-interest num">+ {usd(Math.floor((add * rate) / 12))}</strong></div>
        <div><small>Ahora tenés</small><strong className="num">{num(b.tokens)} tokens</strong></div>
        <div><small>Tu plata genera</small><strong className="num">{usd(Math.floor((b.capitalCents * rate) / 12))} por mes</strong></div>
        {price && <div><small>Equivalencia orientativa</small><strong className="num">{num(b.capitalCents / price, 2)} m²</strong></div>}
      </div>
      {firstTime && <div className="alert ok" style={{ marginTop: 16 }}>Nuevo hito: <strong>Primera reinversión</strong></div>}
      <div className="actions" style={{ justifyContent: "center", marginTop: 22 }}>
        <Link className="btn primary" href="/">Volver a mi panel</Link>
      </div>
    </div>
  );
}
