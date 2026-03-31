import { useEffect, useState } from "react";
import {
  getCanchas,
  getTurnosFijos,
  crearTurnoFijo,
  actualizarTurnoFijo,
  eliminarTurnoFijo,
} from "../../services/canchaService";

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
          getTurnosFijos(clubId),
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
    if (!window.confirm("¿Eliminar este turno fijo permanentemente?")) return;
    try {
      await eliminarTurnoFijo(clubId, turnoId);
      setTurnosFijos(turnosFijos.filter((t) => t.id !== turnoId));
    } catch (err) {
      console.error("Error al eliminar:", err);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        Cargando turnos fijos...
      </div>
    );
  }

  const activos = turnosFijos.filter((t) => t.status === "activo");
  const suspendidos = turnosFijos.filter((t) => t.status === "suspendido");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Turnos fijos</h2>
        {!mostrarForm && (
          <button
            onClick={() => {
              setForm(formInicial);
              setEditandoId(null);
              setMostrarForm(true);
            }}
            className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 transition"
          >
            + Nuevo turno fijo
          </button>
        )}
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <div className="themed-card border rounded-2xl p-5 border-green-200">
          <h3 className="font-semibold text-green-700 mb-3">
            {editandoId ? "Editar turno fijo" : "Nuevo turno fijo"}
          </h3>
          <form onSubmit={handleGuardar} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Cancha
                </label>
                <select
                  value={form.canchaId}
                  onChange={(e) =>
                    setForm({ ...form, canchaId: e.target.value, horas: [] })
                  }
                  className="themed-input rounded-lg px-4 py-2 text-sm w-full"
                  required
                >
                  <option value="">Seleccionar cancha</option>
                  {canchas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Día de la semana
                </label>
                <select
                  value={form.dia}
                  onChange={(e) => setForm({ ...form, dia: e.target.value })}
                  className="themed-input rounded-lg px-4 py-2 text-sm w-full"
                >
                  {diasSemana.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selección múltiple de horas */}
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>
                Horarios ({form.horas.length}hs seleccionadas)
              </label>
              {horariosCancha.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {horariosCancha.map((hora) => (
                    <button
                      key={hora}
                      type="button"
                      onClick={() => toggleHora(hora)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        form.horas.includes(hora)
                          ? "bg-green-600 text-white"
                          : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]"
                      }`}
                    >
                      {hora}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>
                  Seleccioná una cancha primero
                </p>
              )}
              {form.horas.length > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  Bloque: {form.horas[0]} a{" "}
                  {form.horas[form.horas.length - 1].replace(":00", "")}:59 (
                  {form.horas.length}hs)
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Nombre del jugador/grupo
                </label>
                <input
                  type="text"
                  placeholder="Ej: Grupo de Juan Pérez"
                  value={form.nombreJugador}
                  onChange={(e) =>
                    setForm({ ...form, nombreJugador: e.target.value })
                  }
                  className="themed-input rounded-lg px-4 py-2 text-sm w-full"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Teléfono
                </label>
                <input
                  type="text"
                  placeholder="Ej: 385 1234567"
                  value={form.telefono}
                  onChange={(e) =>
                    setForm({ ...form, telefono: e.target.value })
                  }
                  className="themed-input rounded-lg px-4 py-2 text-sm w-full"
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>
                Precio total del pack ($)
              </label>
              <input
                type="number"
                min="0"
                value={form.precioTotal}
                onChange={(e) =>
                  setForm({ ...form, precioTotal: e.target.value })
                }
                className="themed-input rounded-lg px-4 py-2 text-sm w-full"
              />
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>
                Descripción del pack/combo (opcional)
              </label>
              <textarea
                placeholder="Ej: 2hs + 4 bebidas al 10% off + 15% off en comida..."
                value={form.packDescripcion}
                onChange={(e) =>
                  setForm({ ...form, packDescripcion: e.target.value })
                }
                rows={3}
                className="themed-input rounded-lg px-4 py-2 text-sm w-full resize-none"
              />
              <div className="mt-2">
                <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Sugerencias:</p>
                <div className="flex flex-wrap gap-1">
                  {packSugerencias.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          packDescripcion: form.packDescripcion
                            ? `${form.packDescripcion}\n${sug}`
                            : sug,
                        })
                      }
                      className="px-2 py-1 rounded-lg text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelarForm}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  guardando ||
                  !form.canchaId ||
                  !form.nombreJugador.trim() ||
                  form.horas.length === 0
                }
                className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
              >
                {guardando
                  ? "Guardando..."
                  : editandoId
                    ? "Guardar cambios"
                    : "Crear turno fijo"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Turnos activos */}
      {activos.length === 0 && suspendidos.length === 0 && !mostrarForm && (
        <div className="text-center py-12 themed-card border rounded-2xl">
          <div className="text-4xl mb-3">📌</div>
          <p className="font-medium" style={{ color: "var(--text-muted)" }}>No hay turnos fijos</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Los turnos fijos bloquean automáticamente el horario en la grilla
          </p>
        </div>
      )}

      {activos.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
            Activos ({activos.length})
          </p>
          <div className="flex flex-col gap-3">
            {activos.map((turno) => (
              <div
                key={turno.id}
                className="themed-card border rounded-2xl p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {turno.canchaName} — {turno.dia}
                      </h3>
                      <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-semibold">
                        Activo
                      </span>
                    </div>
                    <p className="text-sm text-green-600 font-medium">
                      {(turno.horas || [turno.hora]).join(", ")} (
                      {(turno.horas || [turno.hora]).length}hs)
                    </p>
                    <p className="text-sm mt-1" style={{ color: "var(--text-primary)" }}>
                      {turno.nombreJugador}
                    </p>
                    {turno.telefono && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Tel: {turno.telefono}
                      </p>
                    )}
                    {turno.packDescripcion && (
                      <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-600 mb-1">
                          Pack/Combo:
                        </p>
                        <p className="text-xs text-blue-700 whitespace-pre-line">
                          {turno.packDescripcion}
                        </p>
                      </div>
                    )}
                    {turno.precioTotal > 0 && (
                      <p className="text-sm font-semibold text-green-600 mt-2">
                        ${turno.precioTotal}/semana
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 ml-3">
                    <button
                      onClick={() => iniciarEdicion(turno)}
                      className="text-xs font-semibold text-green-600 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setDandoBajaId(turno.id)}
                      className="text-xs font-semibold text-orange-500 hover:underline"
                    >
                      Suspender
                    </button>
                    <button
                      onClick={() => handleEliminar(turno.id)}
                      className="text-xs font-semibold text-red-400 hover:text-red-600"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {dandoBajaId === turno.id && (
                  <div className="mt-3 pt-3 border-t flex flex-col gap-2" style={{ borderColor: "var(--border-card)" }}>
                    <input
                      type="text"
                      placeholder="Motivo de suspensión (ej: Torneo del 25 al 28 de marzo)"
                      value={motivoBaja}
                      onChange={(e) => setMotivoBaja(e.target.value)}
                      className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setDandoBajaId(null);
                          setMotivoBaja("");
                        }}
                        className="flex-1 px-3 py-1 rounded-lg text-sm font-semibold bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] transition"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleDarDeBaja(turno.id)}
                        className="flex-1 px-3 py-1 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 transition"
                      >
                        Confirmar suspensión
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Turnos suspendidos */}
      {suspendidos.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
            Suspendidos ({suspendidos.length})
          </p>
          <div className="flex flex-col gap-3">
            {suspendidos.map((turno) => (
              <div
                key={turno.id}
                className="themed-card border rounded-2xl p-5 border-orange-200 opacity-75"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                        {turno.canchaName} — {turno.dia}
                      </h3>
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                        Suspendido
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {(turno.horas || [turno.hora]).join(", ")} (
                      {(turno.horas || [turno.hora]).length}hs)
                    </p>
                    <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                      {turno.nombreJugador}
                    </p>
                    {turno.motivoBaja && (
                      <p className="text-xs text-orange-500 mt-1">
                        Motivo: {turno.motivoBaja}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 ml-3">
                    <button
                      onClick={() => handleReactivar(turno.id)}
                      className="text-xs font-semibold text-green-600 hover:underline"
                    >
                      Reactivar
                    </button>
                    <button
                      onClick={() => handleEliminar(turno.id)}
                      className="text-xs font-semibold text-red-400 hover:text-red-600"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
