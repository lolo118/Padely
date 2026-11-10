import { useEffect, useMemo, useState } from "react";
import Dialogo from "../Dialogo";
import { toast } from "../Toast";
import { Alert, Badge, Button } from "../ui";
import { escucharMesas } from "../../services/mesasService";
import { MesaOcupadaError, escucharCuentasAbiertas, moverCuentaAMesa } from "../../services/cuentasService";
import { esCuentaDeMesa } from "../../utils/cuentas";
import { estadoMesa, ocupacionDeMesas } from "../../utils/mesas";

// Elegir la mesa de una cuenta abierta: pasar una cuenta de mesa a otra mesa libre, o asignar / cambiar / sacar la
// mesa de una cuenta del turno. Las mesas ocupadas se ven pero no se eligen (la transacción lo vuelve a verificar).
//   clubId · cuenta · onCerrar · onListo(mesa | null)
export default function ElegirMesaDialog({ clubId, cuenta, onCerrar, onListo }) {
  const [mesas, setMesas] = useState({ cargado: false, lista: [], error: false });
  const [cuentas, setCuentas] = useState([]);
  const [ocupado, setOcupado] = useState(null); // mesaId | "sacar"

  useEffect(() => {
    if (!clubId) return undefined;
    const u1 = escucharMesas(
      clubId,
      (lista) => setMesas({ cargado: true, lista: lista.filter((m) => m.activa !== false), error: false }),
      (err) => {
        console.error("Error escuchando las mesas:", err);
        setMesas({ cargado: true, lista: [], error: true });
      },
    );
    const u2 = escucharCuentasAbiertas(clubId, setCuentas, (err) => console.error("Error escuchando las cuentas abiertas:", err));
    return () => {
      u1();
      u2();
    };
  }, [clubId]);
  const ocupacion = useMemo(() => ocupacionDeMesas(cuentas), [cuentas]);
  const deMesa = esCuentaDeMesa(cuenta);

  const mover = async (mesaId) => {
    setOcupado(mesaId || "sacar");
    try {
      const destino = await moverCuentaAMesa(clubId, cuenta.id, mesaId);
      toast.success(destino ? `La cuenta pasó a ${destino.nombre}` : "La cuenta ya no está en una mesa");
      onListo?.(destino);
    } catch (e) {
      console.error("Error cambiando la mesa:", e);
      toast.error(e instanceof MesaOcupadaError ? e.message : e?.code === "permission-denied" ? "Sin permiso." : e?.message || "No pudimos cambiar la mesa.");
      setOcupado(null);
    }
  };

  return (
    <Dialogo
      titulo={cuenta.mesaId ? "Cambiar de mesa" : "Asignar una mesa"}
      descripcion={cuenta.mesaNombre ? `Ahora: ${cuenta.mesaNombre}` : "La cuenta del turno sigue siendo la misma; solo se ve en la grilla de Mesas."}
      ancho
      onCerrar={onCerrar}
      acciones={
        <>
          {!deMesa && cuenta.mesaId && (
            <Button variant="ghost" onClick={() => mover(null)} cargando={ocupado === "sacar" ? "…" : ""} disabled={!!ocupado}>
              Sacar de la mesa
            </Button>
          )}
          <Button onClick={onCerrar}>Cancelar</Button>
        </>
      }
    >
      <div className="mt-4">
        {mesas.error ? (
          <Alert tone="danger">No pudimos cargar las mesas.</Alert>
        ) : !mesas.cargado ? (
          <div className="pd-skeleton h-24 rounded-lg" aria-busy="true" aria-label="Cargando" />
        ) : mesas.lista.length === 0 ? (
          <Alert>Todavía no hay mesas cargadas (Bar → Mesas → Configurar mesas).</Alert>
        ) : (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
            {mesas.lista.map((m) => {
              const { libre, cuenta: otra } = estadoMesa(m, ocupacion);
              const actual = m.id === cuenta.mesaId;
              const ocupadaPorOtra = !libre && otra && otra.id !== cuenta.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  className="pd-card pd-card-hover text-left flex flex-col gap-1 p-3! disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={actual || ocupadaPorOtra || !!ocupado}
                  aria-pressed={actual}
                  onClick={() => mover(m.id)}
                >
                  <span className="font-semibold break-words">{m.nombre}</span>
                  <span className="flex flex-wrap gap-1">
                    {actual ? <Badge tone="court">Esta</Badge> : ocupadaPorOtra ? <Badge tone="warning">Ocupada</Badge> : <Badge>Libre</Badge>}
                    {m.zona && <span className="body-sm text-ink-3">{m.zona}</span>}
                  </span>
                  {ocupado === m.id && <span className="body-sm text-ink-2">Moviendo…</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Dialogo>
  );
}
