import { useEffect, useState } from "react";
import {
  agregarPareja,
  getParejas,
  eliminarPareja,
  getInscripciones,
  actualizarInscripcion,
} from "../../services/torneoService";

const inscripcionBadge = {
  esperando_companero: "bg-[var(--bg-card-hover)] text-[var(--text-muted)]",
  pendiente_pago: "bg-yellow-100 text-yellow-700",
  pendiente_aprobacion: "bg-orange-100 text-orange-700",
  confirmada: "bg-green-100 text-green-700",
  rechazada: "bg-red-100 text-red-500",
};

const inscripcionLabel = {
  esperando_companero: "Esperando compañero",
  pendiente_pago: "Pendiente de pago",
  pendiente_aprobacion: "Pendiente de aprobación",
  confirmada: "Confirmada",
  rechazada: "Rechazada",
};

export default function TabParejas({ torneoId, torneo }) {
  const [parejas, setParejas] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [nombre1, setNombre1] = useState("");
  const [apellido1, setApellido1] = useState("");
  const [nombre2, setNombre2] = useState("");
  const [apellido2, setApellido2] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const cargar = async () => {
      try {
        const [parejasData, inscData] = await Promise.all([
          getParejas(torneoId),
          getInscripciones(torneoId),
        ]);
        if (!cancelled) {
          setParejas(parejasData);
          setInscripciones(inscData);
        }
      } catch (err) {
        console.error("Error al cargar parejas:", err);
      }
      if (!cancelled) setLoading(false);
    };
    cargar();
    return () => {
      cancelled = true;
    };
  }, [torneoId]);

  const handleAgregarPareja = async (e) => {
    e.preventDefault();
    if (!apellido1.trim() || !apellido2.trim()) return;
    setGuardando(true);
    try {
      const jugador1 = `${nombre1.trim()} ${apellido1.trim()}`.trim();
      const jugador2 = `${nombre2.trim()} ${apellido2.trim()}`.trim();
      const nombrePareja = `${apellido1.trim()}-${apellido2.trim()}`;
      const nuevaId = await agregarPareja(torneoId, {
        jugador1,
        jugador2,
        nombrePareja,
      });
      setParejas([
        ...parejas,
        { id: nuevaId, jugador1, jugador2, nombrePareja },
      ]);
      setNombre1("");
      setApellido1("");
      setNombre2("");
      setApellido2("");
    } catch (err) {
      console.error("Error al agregar pareja:", err);
    }
    setGuardando(false);
  };

  const handleEliminarPareja = async (parejaId) => {
    if (!window.confirm("¿Eliminar esta pareja?")) return;
    try {
      await eliminarPareja(torneoId, parejaId);
      setParejas(parejas.filter((p) => p.id !== parejaId));
    } catch (err) {
      console.error("Error al eliminar pareja:", err);
    }
  };

  const confirmarInscripcion = async (insc) => {
    try {
      await actualizarInscripcion(torneoId, insc.id, { status: "confirmada" });
      // Agregar como pareja confirmada
      const nombrePareja = `${insc.apellido1}-${insc.apellido2}`;
      const jugador1 = `${insc.nombre1} ${insc.apellido1}`;
      const jugador2 = `${insc.nombre2} ${insc.apellido2}`;
      const nuevaId = await agregarPareja(torneoId, {
        jugador1,
        jugador2,
        nombrePareja,
        inscripcionId: insc.id,
      });
      setParejas([
        ...parejas,
        { id: nuevaId, jugador1, jugador2, nombrePareja },
      ]);
      setInscripciones(
        inscripciones.map((i) =>
          i.id === insc.id ? { ...i, status: "confirmada" } : i,
        ),
      );
    } catch (err) {
      console.error("Error al confirmar inscripción:", err);
    }
  };

  const rechazarInscripcion = async (inscId) => {
    if (!motivoRechazo.trim()) return;
    try {
      await actualizarInscripcion(torneoId, inscId, {
        status: "rechazada",
        motivoRechazo: motivoRechazo.trim(),
      });
      setInscripciones(
        inscripciones.map((i) =>
          i.id === inscId
            ? { ...i, status: "rechazada", motivoRechazo: motivoRechazo.trim() }
            : i,
        ),
      );
      setRechazandoId(null);
      setMotivoRechazo("");
    } catch (err) {
      console.error("Error al rechazar inscripción:", err);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando parejas...</div>
    );
  }

  const cuposDisponibles = torneo.maxParejas - parejas.length;

  // ✅ Clasificación por estado
  const esperandoCompanero = inscripciones.filter(
    (i) => i.status === "esperando_companero",
  );
  const pendientesAprobacion = inscripciones.filter(
    (i) => i.status === "pendiente_aprobacion",
  );
  const pendientesPago = inscripciones.filter(
    (i) => i.status === "pendiente_pago",
  );
  const procesadas = inscripciones.filter(
    (i) => i.status === "confirmada" || i.status === "rechazada",
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Contador */}
      <div className="themed-card border rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Parejas inscriptas</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {parejas.length} de {torneo.maxParejas} parejas
            </p>
          </div>
          <div
            className={`text-2xl font-bold ${
              cuposDisponibles > 0 ? "text-green-600" : "text-red-500"
            }`}
          >
            {cuposDisponibles > 0 ? `${cuposDisponibles} cupos` : "Completo"}
          </div>
        </div>
      </div>

      {/* Pendientes de aprobación - PRIORIDAD */}
      {pendientesAprobacion.length > 0 && (
        <div className="themed-card border rounded-2xl p-5 border-orange-200">
          <h2 className="font-semibold text-orange-700 mb-3">
            Pendientes de aprobación ({pendientesAprobacion.length})
          </h2>
          <div className="flex flex-col gap-3">
            {pendientesAprobacion.map((insc) => (
              <div
                key={insc.id}
                className="bg-orange-50 rounded-xl px-4 py-3 border border-orange-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {insc.apellido1}-{insc.apellido2}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {insc.nombre1} {insc.apellido1} — {insc.nombre2}{" "}
                      {insc.apellido2}
                    </p>
                    {insc.email1 && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{insc.email1}</p>
                    )}
                    {insc.whatsapp1 && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        WA: {insc.whatsapp1}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                    Pago ✓
                  </span>
                </div>
                {rechazandoId === insc.id ? (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Motivo del rechazo..."
                      value={motivoRechazo}
                      onChange={(e) => setMotivoRechazo(e.target.value)}
                      className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setRechazandoId(null);
                          setMotivoRechazo("");
                        }}
                        className="flex-1 px-3 py-1 rounded-lg text-sm font-semibold bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] transition"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => rechazarInscripcion(insc.id)}
                        disabled={!motivoRechazo.trim()}
                        className="flex-1 px-3 py-1 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-50"
                      >
                        Confirmar rechazo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmarInscripcion(insc)}
                      className="flex-1 px-3 py-1 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition"
                    >
                      Confirmar inscripción
                    </button>
                    <button
                      onClick={() => setRechazandoId(insc.id)}
                      className="flex-1 px-3 py-1 rounded-lg text-sm font-semibold bg-red-100 text-red-600 hover:bg-red-200 transition"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Esperando compañero */}
      {esperandoCompanero.length > 0 && (
        <div className="themed-card border rounded-2xl p-5">
          <h2 className="font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
            Esperando confirmación del compañero ({esperandoCompanero.length})
          </h2>
          <div className="flex flex-col gap-2">
            {esperandoCompanero.map((insc) => (
              <div
                key={insc.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: "var(--bg-card-hover)" }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {insc.apellido1}-{insc.apellido2}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {insc.nombre1} {insc.apellido1} — esperando a {insc.nombre2}{" "}
                    {insc.apellido2}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}>
                  Esperando
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pendientes de pago */}
      {pendientesPago.length > 0 && (
        <div className="themed-card border rounded-2xl p-5 border-yellow-200">
          <h2 className="font-semibold text-yellow-700 mb-3">
            Pendientes de pago ({pendientesPago.length})
          </h2>
          <div className="flex flex-col gap-2">
            {pendientesPago.map((insc) => (
              <div
                key={insc.id}
                className="flex items-center justify-between bg-yellow-50 rounded-xl px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {insc.apellido1}-{insc.apellido2}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Ambos confirmados, esperando pago
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                  Sin pago
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de solicitudes procesadas */}
      {procesadas.length > 0 && (
        <div className="themed-card border rounded-2xl p-5">
          <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Historial de solicitudes
          </h2>
          <div className="flex flex-col gap-2">
            {procesadas.map((insc) => (
              <div
                key={insc.id}
                className="flex items-center justify-between rounded-xl px-4 py-2"
                style={{ backgroundColor: "var(--bg-card-hover)" }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {insc.apellido1}-{insc.apellido2}
                  </p>
                  {insc.status === "rechazada" && insc.motivoRechazo && (
                    <p className="text-xs text-red-400">
                      Motivo: {insc.motivoRechazo}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    inscripcionBadge[insc.status]
                  }`}
                >
                  {inscripcionLabel[insc.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agregar pareja manual */}
      {cuposDisponibles > 0 && (
        <div className="themed-card border rounded-2xl p-5">
          <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Agregar pareja manualmente
          </h2>
          <form onSubmit={handleAgregarPareja} className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Jugador 1</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre"
                value={nombre1}
                onChange={(e) => setNombre1(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Apellido"
                value={apellido1}
                onChange={(e) => setApellido1(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm"
                required
              />
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Jugador 2</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre"
                value={nombre2}
                onChange={(e) => setNombre2(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Apellido"
                value={apellido2}
                onChange={(e) => setApellido2(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm"
                required
              />
            </div>
            {apellido1.trim() && apellido2.trim() && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Nombre de pareja:{" "}
                <span className="font-semibold">
                  {apellido1.trim()}-{apellido2.trim()}
                </span>
              </p>
            )}
            <button
              type="submit"
              disabled={guardando || !apellido1.trim() || !apellido2.trim()}
              className="bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
            >
              {guardando ? "Agregando..." : "Agregar pareja"}
            </button>
          </form>
        </div>
      )}

      {/* Lista de parejas confirmadas */}
      <div className="themed-card border rounded-2xl p-5">
        <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          Lista de parejas confirmadas
        </h2>
        {parejas.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
            No hay parejas inscriptas todavía
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {parejas.map((p, index) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: "var(--bg-card-hover)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold w-6" style={{ color: "var(--text-muted)" }}>
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {p.nombrePareja || `${p.jugador1} / ${p.jugador2}`}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {p.jugador1} — {p.jugador2}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleEliminarPareja(p.id)}
                  className="text-red-400 hover:text-red-600 text-sm font-semibold transition"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
