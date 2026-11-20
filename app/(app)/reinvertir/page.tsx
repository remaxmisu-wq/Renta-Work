import Link from "next/link";
import { autoReinvestAction, reinvestAction } from "@/app/actions";
import { resolveHolder, str, type SP } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { previewReinvest } from "@/lib/ledger";
import { pct, usd } from "@/lib/money";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, IdemKey, PageHead } from "@/components/ui";

export default async function ReinvestPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { holder } = await resolveHolder();
  if (!holder || holder.kind !== "token") {
    return (<><PageHead title="Reinvertir intereses" back="/" /><div className="card empty">Tu cuenta no tiene habilitada la reinversión.</div></>);
  }
  const max = previewReinvest(holder.id);
  const wanted = Math.min(Math.max(1, Number(str(sp.tokens) ?? max.tokens) || 1), Math.max(1, max.tokens));
  const pv = previewReinvest(holder.id, wanted);

  return (
    <>
      <PageHead title="Reinvertir intereses" back="/" sub="Convertí tus intereses disponibles en tokens enteros de USD 100. Es un traslado de intereses a capital, no una ganancia nueva." />
      <Flash sp={sp} />
      <div className="grid cols-2">
        <div className="card">
          <h2>Reinversión manual</h2>
          <p>Tenés <strong className="amount-interest">{usd(max.availableCents)}</strong> de intereses disponibles: alcanzan para <strong>{max.tokens} token{max.tokens === 1 ? "" : "s"}</strong>.</p>
          {max.limitedByCap && <div className="alert warn">El cupo de la emisión limita la reinversión a {max.tokens} tokens. El resto queda disponible.</div>}
          {max.tokens === 0 ? (
            <p className="muted">Necesitás al menos USD 100 disponibles para reinvertir un token. Lo que tenés se suma a la próxima liquidación.</p>
          ) : (
            <>
              <form method="get" className="inline-form">
                <label>Tokens a reinvertir<input type="number" name="tokens" min={1} max={max.tokens} defaultValue={wanted} /></label>
                <button className="btn" type="submit">Calcular</button>
              </form>
              <div className="card" style={{ background: "var(--bg)", boxShadow: "none", marginTop: 16 }}>
                <h3>Antes de confirmar</h3>
                <dl className="kv">
                  <dt>Importe a reinvertir</dt><dd>{usd(pv.amountCents)}</dd>
                  <dt>Tokens a adquirir</dt><dd>{pv.tokens}</dd>
                  <dt>Saldo disponible restante</dt><dd>{usd(pv.remainderCents)}</dd>
                  <dt>Fecha de activación</dt><dd>{formatDate(pv.activationDate)}</dd>
                  <dt>Tasa</dt><dd>{pct(pv.rateBps)} nominal anual</dd>
                  <dt>Vencimiento aplicable</dt><dd>{pv.maturityDate ? `${formatDate(pv.maturityDate)}${pv.termStatus === "propuesta" ? " (propuesta)" : ""}` : "A definir por contrato"}</dd>
                </dl>
              </div>
              <form action={reinvestAction} className="form" style={{ marginTop: 16 }}>
                <IdemKey />
                <input type="hidden" name="tokens" value={pv.tokens} />
                <label className="check"><input type="checkbox" name="accept" required />
                  <span>Confirmo la reinversión con este vencimiento. No cambia el vencimiento de mis otras posiciones.</span></label>
                <SubmitButton className="btn green">Reinvertir {pv.tokens} token{pv.tokens > 1 ? "s" : ""}</SubmitButton>
              </form>
            </>
          )}
        </div>
        <div className="card">
          <h2>Reinversión automática</h2>
          <p>Estado: <strong>{holder.auto_reinvest ? "Activada" : "Desactivada"}</strong></p>
          <p className="muted">Si la activás, en cada liquidación se convierten en tokens todos los bloques completos de USD 100 que entren en el cupo. El remanente queda disponible y se suma a la liquidación siguiente.</p>
          {holder.auto_reinvest ? (
            <form action={autoReinvestAction}><input type="hidden" name="enable" value="0" /><SubmitButton className="btn">Desactivar</SubmitButton></form>
          ) : (
            <form action={autoReinvestAction} className="form">
              <input type="hidden" name="enable" value="1" />
              <label className="check"><input type="checkbox" name="accept" required />
                <span>Autorizo voluntariamente reinvertir mis intereses en cada liquidación, con la tasa y el vencimiento vigentes de la emisión en ese momento. Puedo desactivarlo cuando quiera.</span></label>
              <SubmitButton className="btn green">Activar</SubmitButton>
            </form>
          )}
          <p className="note" style={{ marginTop: 12 }}>Ejemplo: con USD 237,45 disponibles se reinvierten USD 200 (2 tokens) y quedan USD 37,45. <Link href="/">Ver mi portfolio</Link></p>
        </div>
      </div>
    </>
  );
}
