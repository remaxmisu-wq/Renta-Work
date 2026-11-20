"use client";
import { useFormStatus } from "react-dom";

/** Botón que se deshabilita mientras se envía: evita doble clic. */
export function SubmitButton({ children, className = "btn primary", confirm }: { children: React.ReactNode; className?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Procesando…" : children}
    </button>
  );
}
