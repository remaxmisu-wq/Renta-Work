"use client";
import { useState } from "react";

function fmt(n: number) {
  return "USD " + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Campo de cantidad de tokens con el importe equivalente en vivo. */
export function TokensField({ name = "tokens", max, initial = 1, label = "Cantidad de tokens", availableUsd }: {
  name?: string; max?: number; initial?: number; label?: string; availableUsd?: number;
}) {
  const [v, setV] = useState(initial);
  const amount = (Number.isFinite(v) ? v : 0) * 100;
  return (
    <label>
      {label}
      <input type="number" name={name} min={0} max={max} step={1} value={Number.isFinite(v) ? v : ""} required
        onChange={(e) => setV(Math.floor(Number(e.target.value)))} inputMode="numeric" />
      <span className="help">
        = <strong>{fmt(amount)}</strong>
        {availableUsd !== undefined && <> · te quedan {fmt(Math.max(0, availableUsd - amount))} disponibles</>}
      </span>
    </label>
  );
}
