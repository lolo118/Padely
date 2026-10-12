import { useEffect, useState } from "react";
import {
  agregarPareja,
  getParejas,
  eliminarPareja,
  getInscripciones,
  getContactosParejas,
  getContactosInscripciones,
  actualizarInscripcion,
} from "../../services/torneoService";
import { notificarInscripcionConfirmada, notificarInscripcionRechazada } from "../../services/notificationService";
import { listaCategorias } from "../../utils/torneo";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";

const inscripcionBadge = {
  esperando_companero: "bg-[var(--bg-card-hover)] text-[var(--text-muted)]",
  pendiente_aprobacion: "bg-orange-100 text-orange-700",
  confirmada: "bg-green-100 text-green-700",
  rechazada: "bg-red-100 text-red-500",
};

const inscripcionLabel = {
  esperando_companero: "Esperando compañero",
  pendiente_aprobacion: "Pendiente de aprobación",
  confirmada: "Confirmada",
  rechazada: "Rechazada",
};

export default function TabParejas({ torneoId, torneo }) {
  const [parejas, setParejas] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  // Contactos por pareja ({ [pairId]: { whatsapp1, whatsapp2, ... } }): viven aparte, solo los ve el organizador
  const [contactos, setContactos] = useState({});
  const [nombre1, setNombre1] = useState("");
  const [apellido1, setApellido1] = useState("");
  const [nombre2, setNombre2] = useState("");
  const [apellido2, setApellido2] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [whatsapp1, setWhatsapp1] = useState("");
  const [whatsapp2, setWhatsapp2] = useState("");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState(null);
  // Categorías del torneo (género|nivel); con una sola se asigna automáticamente
  const categorias = listaCategorias(torneo);
  const [categoriaManual, setCategoriaManual] = useState(() => {
    const lista = listaCategorias(torneo);
    return lista.length === 1 ? lista[0].id : "";
  });
  const labelCategoria = (id) => categorias.find((cat) => cat.id === id)?.label || null;

  useEffect(() => {
    let cancelled = false;
    const cargar = async () => {
      try {
        const [parejasData, inscData, contactosData, contactosInsc] = await Promise.all([
          getParejas(torneoId),
          getInscripciones(torneoId),
          getContactosParejas(torneoId).catch((err) => {
            console.error("Error al cargar los contactos de las parejas:", err);
            return {};
          }),
          getContactosInscripciones(torneoId).catch((err) => {
            console.error("Error al cargar los contactos de las inscripciones:", err);
            return {};
          }),
        ]);
        if (!cancelled) {
          setParejas(parejasData);
          // Los contactos de cada inscripción viven aparte (solo organizador): se suman acá para mostrarlos
          // y para copiarlos a la pareja al confirmar
          setInscripciones(inscData.map((i) => ({ ...i, ...(contactosInsc[i.id] || {}) })));
          setContactos(contactosData);
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
    if (categorias.length > 1 && !categoriaManual) return;
    setGuardando(true);
    try {
      const jugador1 = `${nombre1.trim()} ${apellido1.trim()}`.trim();
      const jugador2 = `${nombre2.trim()} ${apellido2.trim()}`.trim();
      const nombrePareja = `${apellido1.trim()}-${apellido2.trim()}`;
      const categoria = categorias.length === 1 ? categorias[0].id : categoriaManual || null;
      const nuevaPareja = {
        jugador1, jugador2, nombrePareja,
        whatsapp1: whatsapp1.trim(),
        whatsapp2: whatsapp2.trim(),
        jugador1Uid: null,
        jugador2Uid: null,
        categoria,
      };
      const nuevaId = await agregarPareja(torneoId, nuevaPareja);
      setParejas([...parejas, { id: nuevaId, ...nuevaPareja }]);
      setContactos({ ...contactos, [nuevaId]: { whatsapp1: whatsapp1.trim(), whatsapp2: whatsapp2.trim() } });
      setNombre1(""); setApellido1(""); setNombre2(""); setApellido2("");
      setWhatsapp1(""); setWhatsapp2("");
      toast.success("Pareja agregada");
    } catch (err) {
      console.error("Error al agregar pareja:", err);
      toast.error("No pudimos agregar la pareja. Intentá de nuevo.");
    }
    setGuardando(false);
  };

  const handleEliminarPareja = async (parejaId) => {
    const ok = await confirmar({ titulo: "Eliminar pareja", mensaje: "¿Eliminar esta pareja del torneo?", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    try {
      await eliminarPareja(torneoId, parejaId);
      setParejas(parejas.filter((p) => p.id !== parejaId));
      toast.success("Pareja eliminada");
    } catch (err) {
      console.error("Error al eliminar pareja:", err);
      toast.error("No pudimos eliminar la pareja. Intentá de nuevo.");
    }
  };

  const confirmarInscripcion = async (insc) => {
    try {
      await actualizarInscripcion(torneoId, insc.id, { status: "confirmada" });
      // Agregar como pareja confirmada: la pareja conserva los uids y contactos de la inscripción
      const nombrePareja = `${insc.apellido1}-${insc.apellido2}`;
      const jugador1 = `${insc.nombre1} ${insc.apellido1}`;
      const jugador2 = `${insc.nombre2} ${insc.apellido2}`;
      const nuevaPareja = {
        jugador1,
        jugador2,
        nombrePareja,
        jugador1Uid: insc.jugador1Uid ?? null,
        jugador2Uid: insc.jugador2Uid ?? null,
        whatsapp1: insc.whatsapp1 || "",
        whatsapp2: insc.whatsapp2 || "",
        email1: insc.email1 || "",
        email2: insc.email2 || "",
        categoria: insc.categoria || null,
        inscripcionId: insc.id,
      };
      const nuevaId = await agregarPareja(torneoId, nuevaPareja);
      setParejas([...parejas, { id: nuevaId, ...nuevaPareja }]);
      setContactos({
        ...contactos,
        [nuevaId]: {
          whatsapp1: insc.whatsapp1 || "",
          whatsapp2: insc.whatsapp2 || "",
          email1: insc.email1 || "",
          email2: insc.email2 || "",
        },
      });
      setInscripciones(
        inscripciones.map((i) =>
          i.id === insc.id ? { ...i, status: "confirmada" } : i,
        ),
      );
      // Avisar a los jugadores vinculados
      const torneoNombre = torneo?.nombre || "torneo";
      if (insc.jugador1Uid) notificarInscripcionConfirmada(insc.jugador1Uid, torneoNombre, torneoId);
      if (insc.jugador2Uid) notificarInscripcionConfirmada(insc.jugador2Uid, torneoNombre, torneoId);
      toast.success("Inscripción confirmada");
    } catch (err) {
      console.error("Error al confirmar inscripción:", err);
      toast.error("No pudimos confirmar la inscripción. Intentá de nuevo.");
    }
  };

  const rechazarInscripcion = async (inscId) => {
    if (!motivoRechazo.trim()) return;
    const motivo = motivoRechazo.trim();
    const insc = inscripciones.find((i) => i.id === inscId);
    try {
      await actualizarInscripcion(torneoId, inscId, {
        status: "rechazada",
        motivoRechazo: motivo,
      });
      setInscripciones(
        inscripciones.map((i) =>
          i.id === inscId
            ? { ...i, status: "rechazada", motivoRechazo: motivo }
            : i,
        ),
      );
      setRechazandoId(null);
      setMotivoRechazo("");
      // Avisar a los jugadores vinculados con el motivo
      const torneoNombre = torneo?.nombre || "torneo";
      if (insc?.jugador1Uid) notificarInscripcionRechazada(insc.jugador1Uid, torneoNombre, torneoId, motivo);
      if (insc?.jugador2Uid) notificarInscripcionRechazada(insc.jugador2Uid, torneoNombre, torneoId, motivo);
      toast.success("Inscripción rechazada");
    } catch (err) {
      console.error("Error al rechazar inscripción:", err);
      toast.error("No pudimos rechazar la inscripción. Intentá de nuevo.");
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
                className="rounded-xl px-4 py-3 border"
                style={{ backgroundColor: "rgba(249,115,22,0.08)", borderColor: "rgba(249,115,22,0.2)" }}
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
                    Pareja completa ✓
                  </span>
                </div>
                {rechazandoId === insc.id ? (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Motivo del rechazo..."
                      value={motivoRechazo}
                      onChange={(e) => setMotivoRechazo(e.target.value)}
                      className="themed-input w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                      style={{ borderColor: "rgba(239,68,68,0.35)" }}
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
            <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Jugador 1</p>
            <div className="flex gap-2">
              <input type="text" placeholder="Nombre" value={nombre1} onChange={(e) => setNombre1(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm" />
              <input type="text" placeholder="Apellido" value={apellido1} onChange={(e) => setApellido1(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm" required />
            </div>
            <input type="tel" placeholder="WhatsApp Jugador 1 (ej: 5493851234567)" value={whatsapp1} onChange={(e) => setWhatsapp1(e.target.value.replace(/\D/g, ""))}
              className="themed-input rounded-xl px-4 py-2 text-sm" />

            <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-muted)" }}>Jugador 2</p>
            <div className="flex gap-2">
              <input type="text" placeholder="Nombre" value={nombre2} onChange={(e) => setNombre2(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm" />
              <input type="text" placeholder="Apellido" value={apellido2} onChange={(e) => setApellido2(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm" required />
            </div>
            <input type="tel" placeholder="WhatsApp Jugador 2 (ej: 5493851234567)" value={whatsapp2} onChange={(e) => setWhatsapp2(e.target.value.replace(/\D/g, ""))}
              className="themed-input rounded-xl px-4 py-2 text-sm" />

            {categorias.length > 1 && (
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>Categoría *</label>
                <select value={categoriaManual} onChange={(e) => setCategoriaManual(e.target.value)} required
                  className="themed-input rounded-xl px-4 py-2 text-sm w-full">
                  <option value="">Elegí una categoría</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
            )}
            {categorias.length === 1 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Categoría: <span className="font-semibold">{categorias[0].label}</span>
              </p>
            )}

            {apellido1.trim() && apellido2.trim() && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Nombre de pareja: <span className="font-semibold">{apellido1.trim()}-{apellido2.trim()}</span>
              </p>
            )}

            <div className="text-xs rounded-lg px-3 py-2 border" style={{ color: "#3b82f6", backgroundColor: "rgba(59,130,246,0.08)", borderColor: "rgba(59,130,246,0.2)" }}>
              💡 Agregá el WhatsApp de cada jugador para enviarles un link de vinculación. Así podrán usar la app, recibir puntos y participar de reclamos.
            </div>

            <button type="submit" disabled={guardando || !apellido1.trim() || !apellido2.trim() || (categorias.length > 1 && !categoriaManual)}
              className="text-white font-semibold py-2 rounded-xl transition disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}>
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
          <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>No hay parejas inscriptas todavía</p>
        ) : (
          <div className="flex flex-col gap-3">
            {parejas.map((p, index) => {
              const linkJ1 = `${window.location.origin}/vincular/${torneoId}/${p.id}/1`;
              const linkJ2 = `${window.location.origin}/vincular/${torneoId}/${p.id}/2`;
              const msgJ1 = `¡Hola ${p.jugador1}! Estás inscripto en el torneo "${torneo.nombre}". Vinculá tu cuenta de Padely para recibir puntos y notificaciones: ${linkJ1}`;
              const msgJ2 = `¡Hola ${p.jugador2}! Estás inscripto en el torneo "${torneo.nombre}". Vinculá tu cuenta de Padely para recibir puntos y notificaciones: ${linkJ2}`;
              const wa1 = contactos[p.id]?.whatsapp1 || p.whatsapp1 || "";
              const wa2 = contactos[p.id]?.whatsapp2 || p.whatsapp2 || "";

              return (
                <div key={p.id} className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--bg-card-hover)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold w-6" style={{ color: "var(--text-muted)" }}>{index + 1}</span>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {p.nombrePareja || `${p.jugador1} / ${p.jugador2}`}
                      </p>
                      {labelCategoria(p.categoria) && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "var(--accent-light)", color: "var(--accent)" }}>
                          {labelCategoria(p.categoria)}
                        </span>
                      )}
                    </div>
                    <button onClick={() => handleEliminarPareja(p.id)}
                      className="text-red-400 hover:text-red-600 text-xs font-semibold transition">Eliminar</button>
                  </div>

                  {/* Jugador 1 */}
                  <div className="flex items-center justify-between ml-9 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{p.jugador1}</span>
                      {p.jugador1Uid ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">✓ Vinculado</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>Sin vincular</span>
                      )}
                    </div>
                    {!p.jugador1Uid && (
                      <div className="flex gap-1">
                        <button onClick={() => { navigator.clipboard.writeText(linkJ1); toast.success("Link copiado"); }}
                          className="text-[10px] px-2 py-1 rounded-lg transition" style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border-card)" }}>
                          🔗 Link
                        </button>
                        {wa1 && (
                          <a href={`https://wa.me/${wa1}?text=${encodeURIComponent(msgJ1)}`} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] px-2 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 transition">
                            📱 WA
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Jugador 2 */}
                  <div className="flex items-center justify-between ml-9">
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{p.jugador2}</span>
                      {p.jugador2Uid ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">✓ Vinculado</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>Sin vincular</span>
                      )}
                    </div>
                    {!p.jugador2Uid && (
                      <div className="flex gap-1">
                        <button onClick={() => { navigator.clipboard.writeText(linkJ2); toast.success("Link copiado"); }}
                          className="text-[10px] px-2 py-1 rounded-lg transition" style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border-card)" }}>
                          🔗 Link
                        </button>
                        {wa2 && (
                          <a href={`https://wa.me/${wa2}?text=${encodeURIComponent(msgJ2)}`} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] px-2 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 transition">
                            📱 WA
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
