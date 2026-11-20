import { autoReinvestAction, payoutAction, reinvestAction } from "@/app/actions";
import { resolveHolder, type SP } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { freeAvailableCents, previewReinvest } from "@/lib/ledger";
import { usd } from "@/lib/money";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, IdemKey, PageHead } from "@/components/ui";

/** Cobrar o reinvertir: las dos opciones lado a lado, con la reinversión destacada. */
export default async function InterestsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { holder } = await resolveHolder();
  if (!holder) return (<><PageHead title="Tus intereses" back="/" /><div className="card empty">No tenés un panel de Renta Work.</div></>);
  const isToken = holder.kind === "token";
  const free = freeAvailableCents(holder.id);
  const pv = isToken ? previewReinvest(holder.id) : null;
  const tokens = pv?.tokens ?? 0;
  const perMonthExtra = Math.floor((tokens * 10_000 * 0.12) / 12);
  const missing = 10_000 - (free % 10_000);

  return (
    <>
      <PageHead title="Tus intereses" back="/" sub="Los intereses que ya se liquidaron los podés cobrar o reinvertir. Elegí qué hacer." />
      <Flash sp={sp} />
      <div className="card live" style={{ textAlign: "center" }}>
        <span className="muted">Tenés para usar</span>
        <span className="big-live num">{usd(free)}</span>
        <span className="muted">Mientras no los uses, estos intereses no generan más intereses.</span>
      </div>

      <div className="grid cols-2 section choice">
        <div className={`card choice-card ${isToken ? "recommended" : ""}`}>
          {isToken && <span className="ribbon">Recomendado</span>}
          <h2>Reinvertir</h2>
          {!isToken ? (
            <p className="muted">Tus aportes actuales no se reinvierten en tokens. Consultalo con el administrador.</p>
          ) : tokens > 0 && pv ? (
            <>
              <p style={{ fontSize: "1.05rem" }}>Sumás <strong>{tokens} token{tokens > 1 ? "s" : ""}</strong> ({usd(pv.amountCents).replace(/,00$/, "")}) y tu plata genera <strong className="amount-interest">{usd(perMonthExtra)} más por mes</strong>, todos los meses.</p>
              <dl className="kv" style={{ fontSize: "0.93rem" }}>
                <dt>En un año, eso es</dt><dd className="amount-interest">≈ + {usd(perMonthExtra * 12)}</dd>
                <dt>Te queda para cobrar</dt><dd>{usd(pv.remainderCents)}</dd>
                <dt>Empieza a generar</dt><dd>Hoy, {formatDate(pv.activationDate)}</dd>
                <dt>Vence</dt><dd>{pv.maturityDate ? `${formatDate(pv.maturityDate)}${pv.termStatus === "propuesta" ? " (propuesta)" : ""}` : "A definir"}</dd>
              </dl>
              <form action={reinvestAction} className="form" style={{ marginTop: 16 }}>
                <IdemKey />
                <input type="hidden" name="tokens" value={tokens} />
                <label className="check"><input type="checkbox" name="accept" required /><span>Confirmo la reinversión. No cambia el vencimiento de mis otros aportes.</span></label>
                <SubmitButton className="btn green">Reinvertir {usd(pv.amountCents).replace(/,00$/, "")}</SubmitButton>
              </form>
            </>
          ) : (
            <>
              <p>Para reinvertir necesitás juntar USD 100. Te faltan <strong>{usd(missing)}</strong>.</p>
              <div className="progress"><div style={{ width: `${Math.max(3, ((free % 10_000) / 10_000) * 100)}%` }} /></div>
              <p className="note" style={{ marginTop: 8 }}>Los intereses de los próximos cobros se van sumando.</p>
            </>
          )}
        </div>

        <div className="card choice-card">
          <h2>Cobrar</h2>
          {free <= 0 ? <p className="muted">Todavía no tenés intereses liquidados para cobrar.</p> : (
            <>
              <p style={{ fontSize: "1.05rem" }}>Te llevás la plata hoy. Tu capital sigue igual y sigue generando lo mismo.</p>
              <form action={payoutAction} className="form">
                <IdemKey />
                <label>¿Cuánto querés cobrar? (USD)<input name="amount" inputMode="decimal" defaultValue={(free / 100).toFixed(2).replace(".", ",")} required /></label>
                <SubmitButton className="btn">Pedir el cobro</SubmitButton>
              </form>
              <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>Es una solicitud: queda pendiente hasta que se haga el pago.</p>
            </>
          )}
        </div>
      </div>

      {isToken && (
        <div className="card section">
          <div className="total-row">
            <span>
              <strong>Reinversión automática: {holder.auto_reinvest ? "activada" : "desactivada"}</strong><br />
              <small>En cada cobro, los bloques completos de USD 100 se convierten solos en tokens. Lo que sobra queda para cobrar.</small>
            </span>
            {holder.auto_reinvest ? (
              <form action={autoReinvestAction}><input type="hidden" name="enable" value="0" /><SubmitButton className="btn">Desactivar</SubmitButton></form>
            ) : (
              <form action={autoReinvestAction} className="inline-form" style={{ flex: "0 1 auto" }}>
                <input type="hidden" name="enable" value="1" />
                <label className="check" style={{ flex: "1 1 220px" }}><input type="checkbox" name="accept" required /><span>Autorizo reinvertir automáticamente</span></label>
                <SubmitButton className="btn green">Activar</SubmitButton>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
