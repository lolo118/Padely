import { useState } from "react";
import Dialogo from "../Dialogo";
import { Button, Field, Input } from "../ui";
import { formatPrecio } from "../../utils/format";

// Cantidad de un producto (×n): kilos y litros admiten decimales
export default function CantidadDialog({ producto, cantidadInicial = 1, onConfirmar, onCerrar }) {
  const [valor, setValor] = useState(String(cantidadInicial));
  const [error, setError] = useState("");
  const decimal = producto.unidad === "kg" || producto.unidad === "l";
  const guardar = () => {
    const n = Number(String(valor).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Poné una cantidad mayor que 0.");
      return;
    }
    if (!decimal && !Number.isInteger(n)) {
      setError("Este producto se vende por unidad entera.");
      return;
    }
    onConfirmar(n);
  };
  return (
    <Dialogo
      titulo={producto.nombre}
      descripcion={`${formatPrecio(producto.precio)} por ${producto.unidad === "kg" ? "kilo" : producto.unidad === "l" ? "litro" : "unidad"}`}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary">
            Agregar
          </Button>
        </>
      }
    >
      <div className="mt-4">
        <Field label="Cantidad" error={error}>
          <Input type="number" min="0" step={decimal ? "any" : "1"} inputMode={decimal ? "decimal" : "numeric"} value={valor} onChange={(e) => setValor(e.target.value)} data-autofocus onFocus={(e) => e.target.select()} />
        </Field>
      </div>
    </Dialogo>
  );
}
