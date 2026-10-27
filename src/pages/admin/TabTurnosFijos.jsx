import { useEffect, useState } from "react";
import { Plus, Repeat, Trash2 } from "lucide-react";
import {
  getCanchas,
  getTurnosFijos,
  crearTurnoFijo,
  actualizarTurnoFijo,
  eliminarTurnoFijo,
} from "../../services/canchaService";
import { formatPrecio } from "../../utils/format";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { Badge, Button, Card, Field, Input, Pills, Select, Textarea } from "../../components/ui";

const diasSemana = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const packSugerencias = [
  "2hs + 4 bebidas al 10% off",
  "2hs + 2 canchas + 4 bebidas al 15% off",
  "3hs + 4 lomitos + 2 gaseosas",
  "2hs + 4 pelotas al 10% off + 15% off en comida",
  "Pack familiar: 2hs + 4 bebidas + 4 comidas al 20% off",
];

export default function TabTurnosFijos({ clubId }) {
  const [canchas, setCanchas] = useState([]);
  const [turnosFijos, setTurnosFijos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState("");
  const [dandoBajaId, setDandoBajaId] = useState(null);

  const formInicial = {
    canchaId: "",
    dia: "Lunes",
    horas: [],
    nombreJugador: "",
    telefono: "",
    packDescripcion: "",
    precioTotal: 0,
  };

  const [form, setForm] = useState(formInicial);

  useEffect(() => {
    const cargar = async () => {
      try {
        const [canchasData, turnosData] = await Promise.all([
          getCanchas(clubId),
          getTurnosFijos(clubId, { contactos: true }),
        ]);
        setCanchas(canchasData);
        setTurnosFijos(turnosData);
      } catch (err) {
        console.error("Error al cargar turnos fijos:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [clubId]);

  const canchaSeleccionada = canchas.find((c) => c.id === form.canchaId);
  const horariosCancha = canchaSeleccionada
    ? Object.keys(canchaSeleccionada.horarios || {}).sort()
    : [];

  const toggleHora = (hora) => {
    const current = [...form.horas];
    if (current.includes(hora)) {
      setForm({ ...form, horas: current.filter((h) => h !== hora) });
    } else {
      setForm({ ...form, horas: [...current, hora].sort() });
    }
  };

  const iniciarEdicion = (turno) => {
    setForm({
      canchaId: turno.canchaId,
      dia: turno.dia,
      horas: turno.horas || (turno.hora ? [turno.hora] : []),
      nombreJugador: turno.nombreJugador,
      telefono: turno.telefono || "",
      packDescripcion: turno.packDescripcion || "",
      precioTotal: turno.precioTotal || 0,
    });
    setEditandoId(turno.id);
    setMostrarForm(true);
  };

  const cancelarForm = () => {
    setForm(formInicial);
    setEditandoId(null);
    setMostrarForm(false);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!form.canchaId || !form.nombreJugador.trim() || form.horas.length === 0)
      return;
    setGuardando(true);
    try {
      const cancha = canchas.find((c) => c.id === form.canchaId);
      const datos = {
        ...form,
        precioTotal: Number(form.precioTotal),
        canchaName: cancha?.nombre || "",
      };

      if (editandoId) {
        await actualizarTurnoFijo(clubId, editandoId, datos);
        setTurnosFijos(
          turnosFijos.map((t) =>
            t.id === editandoId ? { ...t, ...datos } : t,
          ),
        );
      } else {
        const nuevoId = await crearTurnoFijo(clubId, datos);
        setTurnosFijos([
          ...turnosFijos,
          { id: nuevoId, ...datos, status: "activo" },
        ]);
      }
      cancelarForm();
    } catch (err) {
      console.error("Error al guardar turno fijo:", err);
    }
    setGuardando(false);
  };

  const handleDarDeBaja = async (turnoId) => {
    try {
      await actualizarTurnoFijo(clubId, turnoId, {
        status: "suspendido",
        motivoBaja: motivoBaja.trim(),
        fechaBaja: new Date().toISOString(),
      });
      setTurnosFijos(
        turnosFijos.map((t) =>
          t.id === turnoId
            ? { ...t, status: "suspendido", motivoBaja: motivoBaja.trim() }
            : t,
        ),
      );
      setDandoBajaId(null);
      setMotivoBaja("");
    } catch (err) {
      console.error("Error al dar de baja:", err);
    }
  };

  const handleReactivar = async (turnoId) => {
    try {
      await actualizarTurnoFijo(clubId, turnoId, {
        status: "activo",
        motivoBaja: "",
        fechaBaja: null,
      });
      setTurnosFijos(
        turnosFijos.map((t) =>
          t.id === turnoId ? { ...t, status: "activo", motivoBaja: "" } : t,
        ),
      );
    } catch (err) {
      console.error("Error al reactivar:", err);
    }
  };

  const handleEliminar = async (turnoId) => {
    const ok = await confirmar({ titulo: "Eliminar turno fijo", mensaje: "¿Eliminar este turno fijo permanentemente?", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    try {
      await eliminarTurnoFijo(clubId, turnoId);
      setTurnosFijos(turnosFijos.filter((t) => t.id !== turnoId));
      toast.success("Turno fijo eliminado");
    } catch (err) {
      console.error("Error al eliminar:", err);
      toast.error("No pudimos eliminar el turno fijo. Intentá de nuevo.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando turnos fijos">
        <div className="pd-skeleton h-7 w-40" />
        <div className="pd-skeleton h-36 w-full rounded-lg" />
        <div className="pd-skeleton h-36 w-full rounded-lg" />
      </div>
    );
  }

  const activos = turnosFijos.filter((t) => t.status === "activo");
  const suspendidos = turnosFijos.filter((t) => t.status === "suspendido");

  // Las horas de un turno, como lista y como cantidad ("18:00, 19:00" · "2 hs")
  const horasDe = (turno) => turno.horas || [turno.hora];

  // La cabecera que comparten las tarjetas activas y suspendidas. Función, no componente.
  function cabeceraTurno(turno, estadoBadge) {
    const horas = horasDe(turno);
    return (
      <>
        <Card.Row className="items-start!">
          <Card.Eyebrow className="truncate">{turno.canchaName}</Card.Eyebrow>
          <div className="flex flex-wrap justify-end gap-1">
            <Badge tone="night">Turno fijo</Badge>
            {estadoBadge}
          </div>
        </Card.Row>
        <Card.Title className="mt-2! pd-tnum flex items-center gap-2">
          <Repeat className="pd-icon" size={20} aria-hidden="true" />
          <span className="truncate">
            {turno.dia} · {horas.join(", ")}
          </span>
        </Card.Title>
        <p className="heading-sm m-0 mt-1 truncate">{turno.nombreJugador}</p>
        <Card.Meta className="pd-tnum">
          {horas.length} hs
          {turno.telefono ? ` · Tel: ${turno.telefono}` : ""}
        </Card.Meta>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="heading-md m-0">Turnos fijos</h2>
        {!mostrarForm && (
          <Button
            variant="primary"
            icon={<Plus className="pd-icon" size={20} aria-hidden="true" />}
            onClick={() => {
              setForm(formInicial);
              setEditandoId(null);
              setMostrarForm(true);
            }}
          >
            Nuevo turno fijo
          </Button>
        )}
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <Card>
          <Card.Title>{editandoId ? "Editar turno fijo" : "Nuevo turno fijo"}</Card.Title>
          <form onSubmit={handleGuardar} className="flex flex-col gap-4 mt-3">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Cancha">
                <Select
                  value={form.canchaId}
                  onChange={(e) =>
                    setForm({ ...form, canchaId: e.target.value, horas: [] })
                  }
                  required
                >
                  <option value="">Seleccionar cancha</option>
                  {canchas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Día de la semana">
                <Select value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })}>
                  {diasSemana.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Selección múltiple de horas */}
            <Field
              as="div"
              label={
                <>
                  Horarios{" "}
                  <span className="font-normal text-ink-3 pd-tnum">{form.horas.length} hs seleccionadas</span>
                </>
              }
              help={
                horariosCancha.length === 0
                  ? "Seleccioná una cancha primero"
                  : form.horas.length > 0
                    ? `Bloque: ${form.horas[0]} a ${form.horas[form.horas.length - 1].replace(":00", "")}:59 · ${form.horas.length} hs`
                    : undefined
              }
            >
              {horariosCancha.length > 0 ? (
                <Pills
                  multi
                  items={horariosCancha.map((hora) => ({ value: hora, label: hora }))}
                  value={form.horas}
                  onChange={toggleHora}
                  ariaLabel="Horas del turno fijo"
                />
              ) : (
                <div />
              )}
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre del jugador/grupo">
                <Input
                  type="text"
                  placeholder="Ej: Grupo de Juan Pérez"
                  value={form.nombreJugador}
                  onChange={(e) =>
                    setForm({ ...form, nombreJugador: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  type="text"
                  inputMode="tel"
                  placeholder="Ej: 385 1234567"
                  value={form.telefono}
                  onChange={(e) =>
                    setForm({ ...form, telefono: e.target.value })
                  }
                />
              </Field>
            </div>

            <Field label="Precio total del pack ($)" className="md:max-w-xs">
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                value={form.precioTotal}
                onChange={(e) =>
                  setForm({ ...form, precioTotal: e.target.value })
                }
              />
            </Field>

            <div className="flex flex-col gap-2">
              <Field label="Descripción del pack/combo (opcional)">
                <Textarea
                  placeholder="Ej: 2hs + 4 bebidas al 10% off + 15% off en comida…"
                  value={form.packDescripcion}
                  onChange={(e) =>
                    setForm({ ...form, packDescripcion: e.target.value })
                  }
                  rows={3}
                  className="resize-none!"
                />
              </Field>
              <div>
                <p className="pd-help m-0 mb-1">Sugerencias</p>
                <div className="pd-btn-group">
                  {packSugerencias.map((sug, i) => (
                    <Button
                      key={i}
                      type="button"
                      size="sm"
                      icon={<Plus className="pd-icon" size={20} aria-hidden="true" />}
                      className="whitespace-normal! h-auto! min-h-9 py-1! text-left"
                      onClick={() =>
                        setForm({
                          ...form,
                          packDescripcion: form.packDescripcion
                            ? `${form.packDescripcion}\n${sug}`
                            : sug,
                        })
                      }
                    >
                      {sug}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pd-btn-group">
              <Button type="button" onClick={cancelarForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={
                  guardando ||
                  !form.canchaId ||
                  !form.nombreJugador.trim() ||
                  form.horas.length === 0
                }
                cargando={guardando ? "Guardando…" : ""}
              >
                {editandoId ? "Guardar cambios" : "Crear turno fijo"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Turnos activos */}
      {activos.length === 0 && suspendidos.length === 0 && !mostrarForm && (
        <Card className="text-center py-12!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="heading-sm m-0">No hay turnos fijos</p>
          <p className="body-sm text-ink-2 mt-1 m-0">
            Los turnos fijos bloquean automáticamente el horario en la grilla
          </p>
        </Card>
      )}

      {activos.length > 0 && (
        <section>
          <p className="pd-eyebrow mb-2!">
            Activos <span className="font-medium pd-tnum">{activos.length}</span>
          </p>
          <div className="grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {activos.map((turno) => (
              <Card key={turno.id} className={dandoBajaId === turno.id ? "md:col-span-full" : undefined}>
                {cabeceraTurno(
                  turno,
                  <Badge tone="success" dot>
                    Activo
                  </Badge>,
                )}
                {turno.packDescripcion && (
                  <div className="mt-3 rounded-md bg-surface-sunken p-3">
                    <p className="pd-eyebrow mb-1!">Pack/Combo</p>
                    <p className="body-sm text-ink-2 m-0 whitespace-pre-line">{turno.packDescripcion}</p>
                  </div>
                )}
                <Card.Foot className="flex-wrap">
                  {turno.precioTotal > 0 && (
                    <span className="numeral-md pd-tnum">
                      {formatPrecio(turno.precioTotal)}
                      <span className="body-sm text-ink-3 font-sans! font-normal!">/semana</span>
                    </span>
                  )}
                  <div className="pd-btn-group ml-auto">
                    <Button size="sm" onClick={() => iniciarEdicion(turno)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDandoBajaId(turno.id)} aria-expanded={dandoBajaId === turno.id}>
                      Suspender
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      aria-label={`Eliminar turno fijo de ${turno.nombreJugador}`}
                      icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />}
                      onClick={() => handleEliminar(turno.id)}
                    />
                  </div>
                </Card.Foot>

                {dandoBajaId === turno.id && (
                  <div className="mt-4 pt-4 border-t border-line flex flex-col gap-3">
                    <Field label="Motivo de suspensión">
                      <Input
                        type="text"
                        placeholder="Ej: Torneo del 25 al 28 de marzo"
                        value={motivoBaja}
                        onChange={(e) => setMotivoBaja(e.target.value)}
                      />
                    </Field>
                    <div className="pd-btn-group">
                      <Button
                        size="sm"
                        onClick={() => {
                          setDandoBajaId(null);
                          setMotivoBaja("");
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleDarDeBaja(turno.id)}>
                        Confirmar suspensión
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Turnos suspendidos */}
      {suspendidos.length > 0 && (
        <section>
          <p className="pd-eyebrow mb-2!">
            Suspendidos <span className="font-medium pd-tnum">{suspendidos.length}</span>
          </p>
          <div className="grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {suspendidos.map((turno) => (
              <Card key={turno.id} className="opacity-75">
                {cabeceraTurno(
                  turno,
                  <Badge tone="warning" dot>
                    Suspendido
                  </Badge>,
                )}
                {turno.motivoBaja && (
                  <p className="body-sm text-ink-2 m-0 mt-2">Motivo: {turno.motivoBaja}</p>
                )}
                <Card.Foot>
                  <div className="pd-btn-group ml-auto">
                    <Button size="sm" onClick={() => handleReactivar(turno.id)}>
                      Reactivar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      aria-label={`Eliminar turno fijo de ${turno.nombreJugador}`}
                      icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />}
                      onClick={() => handleEliminar(turno.id)}
                    />
                  </div>
                </Card.Foot>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
