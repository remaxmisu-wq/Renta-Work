import { createUserAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import type { SP } from "@/lib/session";
import { SubmitButton } from "@/components/SubmitButton";
import { DemoBadge, Flash, PageHead } from "@/components/ui";

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const users = getDb().prepare(
    "SELECT u.*, h.id holder_id FROM users u LEFT JOIN holders h ON h.user_id = u.id ORDER BY u.role, u.name",
  ).all() as { id: number; name: string; email: string; role: string; is_demo: number; holder_id: number | null }[];
  return (
    <>
      <PageHead title="Usuarios" sub="En la integración con el CRM, los usuarios y roles se toman del CRM." />
      <Flash sp={sp} />
      <div className="card">
        <h2>Nuevo usuario</h2>
        <form action={createUserAction} className="inline-form">
          <label>Nombre<input name="name" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Rol<select name="role"><option value="agent">Agente</option><option value="admin">Administrador</option></select></label>
          <label>Clave inicial<input name="password" type="password" minLength={8} required /></label>
          <label className="check" style={{ alignSelf: "center" }}><input type="checkbox" name="holder" defaultChecked /><span>Crear portfolio Renta Work</span></label>
          <SubmitButton className="btn small">Crear</SubmitButton>
        </form>
      </div>
      <div className="card section">
        <table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Portfolio</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}><td>{u.name} <DemoBadge show={u.is_demo} /></td><td>{u.email}</td><td>{u.role === "admin" ? "Administrador" : "Agente"}</td><td>{u.holder_id ? "Sí" : "—"}</td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
