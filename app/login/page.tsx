import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash } from "@/components/ui";
import type { SP } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand" style={{ fontSize: "1.6rem", marginBottom: 4 }}>Renta<span>Work</span></div>
        <p className="muted">Ingresá con tu usuario del CRM.</p>
        <div className="card">
          <Flash sp={sp} />
          <form action={loginAction} className="form">
            <label>Email<input name="email" type="email" autoComplete="username" required /></label>
            <label>Clave<input name="password" type="password" autoComplete="current-password" required /></label>
            <SubmitButton>Ingresar</SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
