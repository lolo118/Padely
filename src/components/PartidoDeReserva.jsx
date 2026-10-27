import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cargarFlags } from "../services/flagsService";
import { abrirPartido, cerrarPartido, quitarDePartido } from "../services/partidosService";
import { MAX_FALTAN, NIVELES_PARTIDO, jugadoresDe, lugaresLibres } from "../utils/partidos";
import Dialogo from "./Dialogo";
import { confirmar } from "./ConfirmDialog";
import { toast } from "./Toast";
import { Badge, Button, Field, Input, Pills, Select } from "./ui";

// Mis reservas (P3-15): el titular de una reserva confirmada que todavía no empezó busca jugadores ("Me faltan N"),
// ve quién se sumó, saca a alguien o deja de buscar. Oculto hasta configuracionPadely/flags.partidosAbiertos.
export default function PartidoDeReserva({ reserva, uid, onCambio }) {
  const [activo, setActivo] = useState(false);
  const [dialogo, setDialogo] = useState(false);
  const [form, setForm] = useState({ faltan: 1, nivel: "", nota: "" });
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    cargarFlags().then((f) => vivo && setActivo(f?.partidosAbiertos === true));
    return () => {
      vivo = false;
    };
  }, []);
  if (!activo || !reserva || reserva.jugadorUid !== uid || reserva.status !== "confirmada") return null;
  const partido = reserva.partidoAbierto || null;
  const clubId = reserva.clubId;
  const reservaId = reserva.grupoId || reserva.id;

  const publicar = async (e) => {
    e?.preventDefault?.();
    setOcupado(true);
    try {
      await abrirPartido({ clubId, reservaId, faltan: form.faltan, nivel: form.nivel || null, nota: form.nota });
      toast.success("Listo: tu partido ya aparece en Partidos abiertos");
      setDialogo(false);
      onCambio?.({ ...reserva, partidoAbierto: { faltan: form.faltan, nivel: form.nivel || null, nota: form.nota, jugadores: jugadoresDe(partido) } });
    } catch (err) {
      console.error("No se pudo publicar el partido:", err);
      toast.error(err?.message || "No pudimos publicar el partido.");
    } finally {
      setOcupado(false);
    }
  };
  const dejarDeBuscar = async () => {
    setOcupado(true);
    try {
      await cerrarPartido({ clubId, reservaId });
      toast.success("Ya no buscás jugadores");
      onCambio?.({ ...reserva, partidoAbierto: null });
    } catch (err) {
      console.error("No se pudo cerrar el partido:", err);
      toast.error("No pudimos guardar el cambio.");
    } finally {
      setOcupado(false);
    }
  };
  const sacar = async (j) => {
    const ok = await confirmar({ titulo: `¿Sacar a ${j.nombre}?`, mensaje: "Le avisamos y se libera su lugar en el partido.", confirmText: "Sacar", danger: true });
    if (!ok) return;
    try {
      await quitarDePartido({ clubId, reservaId, uid: j.uid });
      onCambio?.({ ...reserva, partidoAbierto: { ...partido, jugadores: jugadoresDe(partido).filter((x) => x.uid !== j.uid) } });
    } catch (err) {
      console.error("No se pudo sacar al jugador:", err);
      toast.error(err?.message || "No pudimos sacarlo.");
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-line flex flex-col gap-2">
      {partido ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="pd-badge-group">
              <Badge tone="court">{lugaresLibres(partido) > 0 ? `Buscás ${lugaresLibres(partido)} ${lugaresLibres(partido) === 1 ? "jugador" : "jugadores"}` : "Partido completo"}</Badge>
              {partido.nivel && <Badge>Nivel {partido.nivel}</Badge>}
            </span>
            <Button size="sm" variant="ghost" onClick={dejarDeBuscar} cargando={ocupado ? "Guardando…" : ""}>
              Dejar de buscar
            </Button>
          </div>
          {jugadoresDe(partido).length > 0 && (
            <ul className="flex flex-wrap gap-2 m-0 p-0 list-none">
              {jugadoresDe(partido).map((j) => (
                <li key={j.uid} className="flex items-center gap-1 body-sm">
                  {j.nombre}
                  <Button variant="ghost" size="sm" iconOnly aria-label={`Sacar a ${j.nombre}`} onClick={() => sacar(j)} icon={<X className="pd-icon" size={14} aria-hidden="true" />} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="body-sm text-ink-2 m-0">¿Te faltan jugadores? Publicalo y se suman desde Padely.</p>
          <Button size="sm" onClick={() => setDialogo(true)}>
            Buscar jugadores
          </Button>
        </div>
      )}
      {dialogo && (
        <Dialogo
          titulo="Buscar jugadores"
          descripcion="Tu partido aparece en Partidos abiertos (sin tu teléfono). Quien se suma paga su parte."
          onCerrar={() => setDialogo(false)}
          onSubmit={publicar}
          acciones={
            <>
              <Button onClick={() => setDialogo(false)}>Cancelar</Button>
              <Button type="submit" variant="primary" cargando={ocupado ? "Publicando…" : ""}>
                Publicar
              </Button>
            </>
          }
        >
          <div className="mt-4 grid gap-4">
            <Field label="¿Cuántos te faltan?">
              <Pills items={Array.from({ length: MAX_FALTAN }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} value={form.faltan} onChange={(v) => setForm({ ...form, faltan: v })} ariaLabel="Jugadores que faltan" />
            </Field>
            <Field label="Nivel (opcional)">
              <Select value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value })}>
                <option value="">Cualquier nivel</option>
                {NIVELES_PARTIDO.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nota (opcional)" help="Ej.: partido tranqui, traigan pelotas.">
              <Input value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} maxLength={120} />
            </Field>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
