import { useState } from "react";
import Dialogo from "../Dialogo";
import { Badge, Button, Field, Input, Pills } from "../ui";
import { formatPrecio } from "../../utils/format";
import { resolverDescuento } from "../../utils/ventas";

const TIPOS = [
  { value: "porcentaje", label: "%" },
  { value: "monto", label: "$" },
];

// Descuento de una línea o del ticket: % o $, con el tope de quien vende (descuentoMax)
export default function DescuentoDialog({ titulo, descripcion, base, maxPct = 100, inicial = null, onGuardar, onQuitar, onCerrar }) {
  const [tipo, setTipo] = useState(inicial?.tipo || "porcentaje");
  const [valor, setValor] = useState(inicial?.valor ? String(inicial.valor) : "");
  const [error, setError] = useState("");
  const n = Number(String(valor).replace(",", "."));
  const r = Number.isFinite(n) && n > 0 ? resolverDescuento(tipo, n, base, maxPct) : null;

  const guardar = () => {
    if (!r || r.monto <= 0) {
      setError("Poné un descuento mayor que 0.");
      return;
    }
    if (r.excedido) {
      setError(`Tu tope de descuento es ${maxPct} %.`);
      return;
    }
    onGuardar({ tipo, valor: n });
  };

  return (
    <Dialogo
      titulo={titulo}
      descripcion={descripcion}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          {inicial && onQuitar && (
            <Button variant="ghost" onClick={onQuitar}>
              Quitar descuento
            </Button>
          )}
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary">
            Aplicar
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Tipo" as="div">
          <Pills
            items={TIPOS}
            value={tipo}
            onChange={(v) => {
              setTipo(v);
              setError("");
            }}
            ariaLabel="Tipo de descuento"
          />
        </Field>
        <Field label={tipo === "porcentaje" ? "Porcentaje" : "Monto"} help={`Sobre ${formatPrecio(base)}. Tope: ${maxPct} %.`} error={error}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} data-autofocus onFocus={(e) => e.target.select()} />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span className="pd-label">Descuento</span>
          <Badge tone={r?.excedido ? "danger" : "neutral"} className="pd-tnum">
            {r ? `−${formatPrecio(r.monto)}` : "—"}
          </Badge>
        </div>
      </div>
    </Dialogo>
  );
}
