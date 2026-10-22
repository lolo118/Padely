import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import Dialogo from "../Dialogo";
import { Alert, Badge, Button, Field, Input, Pills } from "../ui";
import { MEDIOS } from "../../services/cajaService";
import { formatPrecio } from "../../utils/format";
import { calcularPagos } from "../../utils/ventas";

// Hoja de cobro: uno o varios medios, vuelto en efectivo, botones de billetes. "Confirmar venta" cuando pagado ≥ total.

const BILLETES = [1000, 2000, 5000, 10000, 20000];
const PILLS_MEDIOS = MEDIOS.map((m) => ({ value: m.id, label: m.label }));
const REF_HELP = { transferencia: "Alias o nº de operación", tarjeta: "Últimos 4 dígitos / nº de cupón", qr: "Nº de operación" };
let seq = 0;
const nuevaFila = (medio, monto = "") => ({ id: `f${++seq}`, medio, monto, ref: "" });
const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;

export default function CobrarDialog({ total, sinNumeros = false, onConfirmar, onCerrar }) {
  const [filas, setFilas] = useState(() => [nuevaFila("efectivo", String(total))]);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");

  const calculo = useMemo(() => calcularPagos(filas.map((f) => ({ medio: f.medio, monto: num(f.monto), ref: f.ref })), total), [filas, total]);
  const restante = (idx) =>
    Math.max(0, total - filas.filter((f, i) => i !== idx && f.medio !== "efectivo").reduce((s, f) => s + num(f.monto), 0));

  const cambiar = (id, cambios) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  const quitar = (id) => setFilas((fs) => (fs.length > 1 ? fs.filter((f) => f.id !== id) : fs));
  const agregar = () => {
    const usados = new Set(filas.map((f) => f.medio));
    const medio = ["tarjeta", "transferencia", "qr", "efectivo"].find((m) => !usados.has(m)) || "efectivo";
    setFilas((fs) => [...fs, nuevaFila(medio, calculo.falta > 0 ? String(calculo.falta) : "")]);
  };
  const filaEfectivo = filas.find((f) => f.medio === "efectivo");
  const ponerEfectivo = (monto) => {
    if (filaEfectivo) cambiar(filaEfectivo.id, { monto: String(monto) });
    else setFilas((fs) => [...fs, nuevaFila("efectivo", String(monto))]);
  };
  const justo = () => ponerEfectivo(restante(filas.findIndex((f) => f.medio === "efectivo")));

  const confirmar = async () => {
    if (!calculo.valido || confirmando) return;
    setConfirmando(true);
    setError("");
    try {
      await onConfirmar(calculo);
    } catch (e) {
      setError(e?.message || "No pudimos registrar la venta.");
      setConfirmando(false);
    }
  };

  return (
    <Dialogo
      titulo="Cobrar"
      descripcion={`Total ${formatPrecio(total)}`}
      ancho="lg"
      onCerrar={confirmando ? () => {} : onCerrar}
      onSubmit={confirmar}
      acciones={
        <>
          <Button onClick={onCerrar} disabled={confirmando}>
            Volver
          </Button>
          <Button type="submit" variant="primary" disabled={!calculo.valido || sinNumeros} cargando={confirmando ? "Registrando…" : ""}>
            Confirmar venta
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-4">
        {sinNumeros && <Alert tone="danger">Sin números de ticket: conectate a internet un momento.</Alert>}
        <div className="flex flex-col gap-3">
          {filas.map((f, idx) => (
            <div key={f.id} className="rounded-lg border border-line p-3 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <Pills items={PILLS_MEDIOS} value={f.medio} onChange={(m) => cambiar(f.id, { medio: m, ref: "" })} ariaLabel={`Medio de pago ${idx + 1}`} />
                {filas.length > 1 && <Button variant="ghost" size="sm" iconOnly aria-label="Quitar este medio" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={() => quitar(f.id)} />}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={f.medio === "efectivo" ? "Entregado" : "Monto"} help={f.medio === "efectivo" ? "Lo que da el cliente; el vuelto se calcula." : `Como máximo ${formatPrecio(restante(idx))}.`}>
                  <Input type="number" min="0" step="any" inputMode="decimal" value={f.monto} onChange={(e) => cambiar(f.id, { monto: e.target.value })} data-autofocus={idx === 0 || undefined} onFocus={(e) => e.target.select()} className="pd-tnum text-[18px]!" />
                </Field>
                {f.medio !== "efectivo" && (
                  <Field label="Referencia" help={REF_HELP[f.medio]}>
                    <Input value={f.ref} onChange={(e) => cambiar(f.id, { ref: e.target.value })} maxLength={40} autoComplete="off" />
                  </Field>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Billetes">
          {BILLETES.map((b) => (
            <Button key={b} size="sm" onClick={() => ponerEfectivo(b)}>
              {formatPrecio(b)}
            </Button>
          ))}
          <Button size="sm" onClick={justo}>
            Justo
          </Button>
          <Button size="sm" variant="ghost" icon={<Plus className="pd-icon" size={20} aria-hidden="true" />} onClick={agregar}>
            Agregar medio
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="heading-sm">
            {calculo.excedente > 0 ? "Supera el total" : calculo.falta > 0 ? "Falta" : "Vuelto"}
          </span>
          <Badge tone={calculo.excedente > 0 || calculo.falta > 0 ? "danger" : calculo.vuelto > 0 ? "success" : "neutral"} className="pd-tnum text-[16px]!">
            {formatPrecio(calculo.excedente > 0 ? calculo.excedente : calculo.falta > 0 ? calculo.falta : calculo.vuelto)}
          </Badge>
        </div>
        {error && <p className="pd-error m-0">{error}</p>}
      </div>
    </Dialogo>
  );
}
