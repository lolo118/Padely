import { useMemo, useState } from "react";
import Dialogo from "../Dialogo";
import { Alert, Badge, Button, Field, Input, Pills, Select } from "../ui";
import { dividirEnPartesIguales, dividirPorJugador } from "../../utils/cuentas";
import { formatPrecio } from "../../utils/format";

// Dividir la cuenta: "En partes iguales" (todo se comparte entre n) o "Cada uno lo suyo" (cada consumo tiene dueño o
// es compartido; la cancha se divide igual salvo que la pague uno). Los totales se ven en vivo; guardar escribe
// `division` en la cuenta. Después, cada parte se cobra por separado desde el detalle.

const MODOS = [
  { value: "total", label: "En partes iguales" },
  { value: "porJugador", label: "Cada uno lo suyo" },
];
const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });

export default function DividirDialog({ cuenta, onGuardar, onCerrar }) {
  const previa = cuenta.division || null;
  const [modo, setModo] = useState(previa?.modo || "porJugador");
  const [nTexto, setNTexto] = useState(String(previa?.n || previa?.partes?.length || 4));
  const [nombres, setNombres] = useState(() => (previa?.partes || []).map((p) => p.nombre || ""));
  const [asignaciones, setAsignaciones] = useState(() => {
    const a = {};
    (previa?.partes || []).forEach((p, i) => (p.items || []).forEach((id) => (a[id] = i)));
    return a;
  });
  const [canchaPagaUno, setCanchaPagaUno] = useState(previa?.canchaPagaParte !== null && previa?.canchaPagaParte !== undefined);
  const [canchaParte, setCanchaParte] = useState(String(previa?.canchaPagaParte ?? 0));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const n = Math.min(8, Math.max(2, Math.trunc(Number(nTexto)) || 2));
  const division = useMemo(
    () =>
      modo === "total"
        ? dividirEnPartesIguales(cuenta, n, { nombres })
        : dividirPorJugador(cuenta, asignaciones, { n, nombres, canchaPagaParte: canchaPagaUno ? Number(canchaParte) || 0 : null }),
    [cuenta, modo, n, nombres, asignaciones, canchaPagaUno, canchaParte],
  );
  const sinDuenio = modo === "porJugador" ? (cuenta.items || []).filter((it) => asignaciones[it.lineaId] === undefined).length : 0;

  const guardar = async () => {
    if (!Number.isInteger(Number(nTexto)) || Number(nTexto) < 2 || Number(nTexto) > 8) {
      setError("Entre 2 y 8 partes.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await onGuardar(division);
    } catch (e) {
      console.error("Error guardando la división:", e);
      setError(e?.message || "No pudimos guardar la división.");
      setGuardando(false);
    }
  };

  const nombreDe = (i) => division.partes[i]?.nombre || `Jugador ${i + 1}`;
  const setNombre = (i, v) =>
    setNombres((arr) => {
      const copia = [...arr];
      copia[i] = v;
      return copia;
    });

  return (
    <Dialogo
      titulo="Dividir la cuenta"
      descripcion={`Total ${formatPrecio(cuenta.totales?.total)} · ${(cuenta.items || []).length} consumos`}
      ancho="xl"
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar división
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Cómo se divide" as="div">
            <Pills items={MODOS} value={modo} onChange={setModo} ariaLabel="Modo de división" />
          </Field>
          <Field label="Partes" className="w-[120px]" error={error}>
            <Input type="number" min="2" max="8" inputMode="numeric" value={nTexto} onChange={(e) => setNTexto(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {division.partes.map((p, i) => (
            <Field key={p.parteId} label={`Parte ${i + 1}`}>
              <Input value={nombres[i] ?? ""} onChange={(e) => setNombre(i, e.target.value)} placeholder={i === 0 && cuenta.nombreJugador ? cuenta.nombreJugador : `Jugador ${i + 1}`} maxLength={40} />
            </Field>
          ))}
        </div>

        {modo === "porJugador" && (
          <>
            <div className="pd-table-wrap">
              <div className="pd-table-head">
                <h3>¿De quién es cada consumo?</h3>
                <span className="body-sm text-ink-2">Sin elegir = compartido entre todos</span>
              </div>
              {(cuenta.items || []).length === 0 ? (
                <p className="body-sm text-ink-2 m-0 px-4 pb-4">La cuenta no tiene consumos: se divide solo la cancha.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="pd-table">
                    <thead>
                      <tr>
                        <th>Consumo</th>
                        <th className="num">Subtotal</th>
                        <th>¿De quién?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuenta.items.map((it) => (
                        <tr key={it.lineaId}>
                          <td>
                            {fmtCant(it.cantidad)} × {it.nombre}
                          </td>
                          <td className="num pd-tnum">{formatPrecio(it.subtotal)}</td>
                          <td>
                            <Select
                              value={asignaciones[it.lineaId] === undefined ? "compartido" : String(asignaciones[it.lineaId])}
                              onChange={(e) => setAsignaciones((a) => ({ ...a, [it.lineaId]: e.target.value === "compartido" ? "compartido" : Number(e.target.value) }))}
                              aria-label={`Quién paga ${it.nombre}`}
                            >
                              <option value="compartido">Compartido (1/{n})</option>
                              {division.partes.map((p, i) => (
                                <option key={p.parteId} value={i}>
                                  {nombreDe(i)}
                                </option>
                              ))}
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {cuenta.cancha?.cobrar !== false && Number(cuenta.cancha?.precioTotal) > 0 && (
              <div className="flex flex-wrap items-end gap-4">
                <label className="pd-check h-11">
                  <input type="checkbox" checked={canchaPagaUno} onChange={(e) => setCanchaPagaUno(e.target.checked)} />
                  La cancha la paga uno
                </label>
                {canchaPagaUno && (
                  <Field label="Quién" className="w-[220px]">
                    <Select value={canchaParte} onChange={(e) => setCanchaParte(e.target.value)}>
                      {division.partes.map((p, i) => (
                        <option key={p.parteId} value={i}>
                          {nombreDe(i)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {!canchaPagaUno && <span className="pd-help pb-3">La cancha{cuenta.cancha?.señaPagada ? " (menos la seña pagada)" : ""} se divide en partes iguales.</span>}
              </div>
            )}
            {sinDuenio > 0 && (cuenta.items || []).length > 0 && <p className="pd-help m-0">{sinDuenio === 1 ? "1 consumo queda compartido." : `${sinDuenio} consumos quedan compartidos.`}</p>}
          </>
        )}
        {modo === "total" && <Alert>Cada consumo y la cancha se reparten en {n} partes iguales, redondeando a $ 10; la diferencia va a la parte 1.</Alert>}

        <div className="pd-table-wrap">
          <div className="pd-table-head">
            <h3>Lo que paga cada uno</h3>
            <Badge className="pd-tnum">Suma {formatPrecio(division.partes.reduce((s, p) => s + p.total, 0))}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Parte</th>
                  <th className="num">Consumos</th>
                  <th className="num">Cancha</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {division.partes.map((p, i) => (
                  <tr key={p.parteId}>
                    <td className="font-semibold">{nombreDe(i)}</td>
                    <td className="num pd-tnum">{formatPrecio(p.consumos)}</td>
                    <td className="num pd-tnum">{p.cancha ? formatPrecio(p.cancha) : "—"}</td>
                    <td className="num pd-tnum font-semibold">{formatPrecio(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Dialogo>
  );
}
