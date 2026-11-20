import { payoutAction } from "@/app/actions";
import { resolveHolder, type SP } from "@/lib/session";
import { freeAvailableCents, ledgerBalances } from "@/lib/ledger";
import { usd } from "@/lib/money";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, IdemKey, PageHead } from "@/components/ui";

export default async function PayoutPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { holder } = await resolveHolder();
  if (!holder) return (<><PageHead title="Solicitar cobro" back="/" /><div className="card empty">No tenés un portfolio.</div></>);
  const free = freeAvailableCents(holder.id);
  const b = ledgerBalances(holder.id);
  return (
    <>
      <PageHead title="Solicitar cobro de intereses" back="/" sub="Podés cobrar los intereses ya liquidados. Los intereses en curso se pueden cobrar después de su liquidación." />
      <Flash sp={sp} />
      <div className="card" style={{ maxWidth: 520 }}>
        <dl className="kv" style={{ marginBottom: 16 }}>
          <dt>Intereses disponibles</dt><dd className="amount-interest">{usd(b.availableCents)}</dd>
          {free !== b.availableCents && (<><dt>En solicitudes de cobro abiertas</dt><dd>{usd(b.availableCents - free)}</dd></>)}
          <dt>Podés solicitar</dt><dd>{usd(free)}</dd>
        </dl>
        {free <= 0 ? <p className="muted">No tenés intereses disponibles para cobrar.</p> : (
          <form action={payoutAction} className="form">
            <IdemKey />
            <label>Importe a cobrar (USD)<input name="amount" inputMode="decimal" defaultValue={(free / 100).toFixed(2).replace(".", ",")} required /></label>
            <SubmitButton>Enviar solicitud</SubmitButton>
            <p className="note">La solicitud queda pendiente hasta que se realice el pago. No es un pago realizado.</p>
          </form>
        )}
      </div>
    </>
  );
}
