import { useState } from "react";
import { UserPlus } from "lucide-react";
import Dialogo from "../Dialogo";
import { Badge, Button, Card, Field, Input } from "../ui";
import { estadoPagoDe, etiquetaTipoParticipante, iniciales, textoCanchaDe } from "../../utils/cuentas";
import { formatPrecio } from "../../utils/format";

// Panel de participantes de una cuenta compartida: cada persona con su tipo, su parte de cancha, sus consumos, lo
// pagado y lo que debe; "Cobrar a <nombre>"; excluir de la cancha / monto fijo / quitar; "Sumar jugador".
//   saldos: saldosDeCuenta(cuenta) · abierta · puedeCobrar (caja abierta + permiso) · puedeEditar (staff)
//   onCobrar(participante) · onSumar() · onExcluir(p, excluir) · onFijo(p, monto|null) · onQuitar(p)
const TONO_TIPO = { titular: "court", jugador: "success", invitado: "neutral" };
const fmt = (n) => formatPrecio(n);

function FijoDialog({ participante, onCerrar, onGuardar }) {
  const [monto, setMonto] = useState(participante.canchaFija === null ? "" : String(participante.canchaFija));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const guardar = async () => {
    const n = monto.trim() === "" ? null : Number(String(monto).replace(",", "."));
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setError("Un monto en pesos, o vacío para volver a la parte igual.");
      return;
    }
    setGuardando(true);
    try {
      await onGuardar(n);
    } catch (e) {
      setError(e?.message || "No pudimos guardar.");
      setGuardando(false);
    }
  };
  return (
    <Dialogo
      titulo={`Cancha de ${participante.nombre}`}
      descripcion="Un monto fijo de cancha para esta persona; el resto se reparte entre los demás. Vacío = parte igual."
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mt-4">
        <Field label="Monto fijo de cancha" error={error}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej: 2500" data-autofocus className="pd-tnum" />
        </Field>
      </div>
    </Dialogo>
  );
}

export default function ParticipantesPanel({ saldos, abierta, puedeCobrar, puedeEditar, ocupado = false, onCobrar, onSumar, onExcluir, onFijo, onQuitar }) {
  const [fijoDe, setFijoDe] = useState(null);
  const lista = saldos?.participantes || [];
  const consumosDe = (p) => p.consumos.reduce((s, c) => s + c.monto, 0);
  return (
    <Card className="p-0!">
      <div className="pd-table-head">
        <h3>
          Participantes<span className="pd-count">{lista.length}</span>
        </h3>
        {abierta && puedeEditar && (
          <Button size="sm" icon={<UserPlus className="pd-icon" size={20} aria-hidden="true" />} onClick={onSumar}>
            Sumar jugador
          </Button>
        )}
      </div>
      <ul className="m-0 p-0 list-none divide-y divide-line">
        {lista.map((p) => {
          const consumos = consumosDe(p);
          const alDia = p.debe <= 0;
          return (
            <li key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="pd-avatar" aria-hidden="true">
                {iniciales(p.nombre)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold m-0 flex flex-wrap items-center gap-2">
                  <span className="truncate">{p.nombre}</span>
                  <Badge tone={TONO_TIPO[p.tipo] || "neutral"}>{etiquetaTipoParticipante(p.tipo)}</Badge>
                  {p.anonimo && <Badge>Sin cuenta</Badge>}
                </p>
                <p className="body-sm text-ink-2 m-0 pd-tnum">
                  {textoCanchaDe(p)}
                  {" · Bar "}
                  {fmt(consumos)}
                  {p.sinAsignar > 0 ? ` (${fmt(p.sinAsignar)} sin asignar)` : ""}
                  {p.pagado > 0 ? ` · ${p.pagoPropio > 0 ? "Pagó" : "Cubierto"} ${fmt(p.pagado)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={estadoPagoDe(p).tono} className={estadoPagoDe(p).cubierto ? "opacity-80" : alDia ? undefined : "pd-tnum"}>
                  {estadoPagoDe(p).texto}
                </Badge>
                {abierta && !alDia && (
                  <Button size="sm" variant="primary" disabled={!puedeCobrar || ocupado} onClick={() => onCobrar(p)} title={!puedeCobrar ? "Abrí la caja para cobrar" : undefined}>
                    Cobrar a {p.nombre.split(" ")[0]}
                  </Button>
                )}
              </div>
              {abierta && puedeEditar && (
                <div className="w-full pd-btn-group">
                  <Button size="sm" variant="ghost" disabled={p.canchaPagada || ocupado} onClick={() => onExcluir(p, !p.excluirCancha)} aria-pressed={p.excluirCancha}>
                    {p.excluirCancha ? "Con cancha" : "Sin cancha"}
                  </Button>
                  {!p.excluirCancha && (
                    <Button size="sm" variant="ghost" disabled={p.canchaPagada || ocupado} onClick={() => setFijoDe(p)}>
                      {p.canchaFija === null ? "Monto fijo de cancha" : `Fijo ${fmt(p.canchaFija)}`}
                    </Button>
                  )}
                  {p.tipo !== "titular" && p.pagado === 0 && (
                    <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => onQuitar(p)}>
                      Quitar
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {fijoDe && (
        <FijoDialog
          participante={fijoDe}
          onCerrar={() => setFijoDe(null)}
          onGuardar={async (monto) => {
            await onFijo(fijoDe, monto);
            setFijoDe(null);
          }}
        />
      )}
    </Card>
  );
}
