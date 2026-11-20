import { redeemAction } from "@/app/actions";
import { resolveHolder, type SP } from "@/lib/session";
import { currentEmission, ledgerBalances } from "@/lib/ledger";
import { SubmitButton } from "@/components/SubmitButton";
import { TokensField } from "@/components/TokensField";
import { Flash, IdemKey, PageHead } from "@/components/ui";

export default async function RedeemPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { holder } = await resolveHolder();
  if (!holder || holder.kind !== "token") return (<><PageHead title="Solicitar rescate" back="/" /><div className="card empty">Tu cuenta no tiene tokens.</div></>);
  const b = ledgerBalances(holder.id);
  const e = currentEmission(!!holder.is_demo);
  return (
    <>
      <PageHead title="Solicitar rescate" back="/" sub="Pedir la devolución de capital de tus tokens, sujeta al contrato." />
      <Flash sp={sp} />
      <div className="grid cols-2">
        <div className="card">
          <h2>Condiciones</h2>
          <p className="muted">{e?.early_redemption_terms || "La devolución anticipada se rige por el contrato y todavía no tiene condiciones definidas."}</p>
          <ul className="muted">
            <li>Un rescate no es inmediato ni está garantizado: se analiza según el contrato.</li>
            <li>La venta a otro usuario requiere un mercado secundario y no está disponible.</li>
            <li>Los intereses generados hasta la fecha del rescate se liquidan en la fecha prevista de la posición.</li>
          </ul>
        </div>
        <div className="card">
          <h2>Solicitud</h2>
          {b.tokens === 0 ? <p className="muted">No tenés tokens activos.</p> : (
            <form action={redeemAction} className="form">
              <IdemKey />
              <TokensField max={b.tokens} label={`Tokens a rescatar (tenés ${b.tokens})`} />
              <label className="check"><input type="checkbox" name="accept" required /><span>Entiendo que es una solicitud sujeta al contrato y no una venta inmediata.</span></label>
              <SubmitButton>Solicitar rescate</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
