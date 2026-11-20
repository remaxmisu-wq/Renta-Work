import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABELS, type MovementStatus } from "@/lib/ledger";

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const error = typeof sp.error === "string" ? sp.error : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  return (
    <>
      {error && <div className="alert error" role="alert">{error}</div>}
      {ok && <div className="alert ok" role="status">{ok}</div>}
    </>
  );
}

export function StatusBadge({ status }: { status: MovementStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
}

export function DemoBadge({ show }: { show: boolean | number }) {
  return show ? <span className="badge demo" title="Dato de demostración, no real">DEMO</span> : null;
}

export function Stat({ label, value, hint, tone, dot }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "capital" | "interest"; dot?: string }) {
  return (
    <div className={`card stat ${tone ?? ""}`}>
      <div className="label">{dot && <span className={`dot ${dot}`} />}{label}</div>
      <div className="value num">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function PageHead({ title, sub, back, children }: { title: string; sub?: ReactNode; back?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {back && <Link href={back} className="note">← Volver</Link>}
        <h1>{title}</h1>
        {sub && <p className="muted" style={{ margin: 0 }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function IdemKey() {
  return <input type="hidden" name="idem" value={crypto.randomUUID()} />;
}
