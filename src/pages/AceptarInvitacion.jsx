import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  getTorneoById,
  getInscripciones,
  actualizarInscripcion,
} from "../services/torneoService";

export default function AceptarInvitacion() {
  const { torneoId, inscripcionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [torneo, setTorneo] = useState(null);
  const [inscripcion, setInscripcion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [estado, setEstado] = useState(null); // "aceptada", "pagada", "error"

  useEffect(() => {
    const cargar = async () => {
      try {
        const [torneoData, inscData] = await Promise.all([
          getTorneoById(torneoId),
          getInscripciones(torneoId),
        ]);
        setTorneo(torneoData);
        const insc = inscData.find((i) => i.id === inscripcionId);
        if (insc) {
          setInscripcion(insc);
          if (insc.status !== "esperando_companero") {
            setEstado(insc.status);
          }
        }
      } catch (err) {
        console.error("Error al cargar invitación:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [torneoId, inscripcionId]);

  const aceptarInvitacion = async () => {
    setProcesando(true);
    try {
      await actualizarInscripcion(torneoId, inscripcionId, {
        status: "pendiente_pago",
        jugador2Uid: user?.uid || null,
        jugador2Confirmado: true,
      });
      setInscripcion({ ...inscripcion, status: "pendiente_pago" });
      setEstado("pendiente_pago");
    } catch (err) {
      console.error("Error al aceptar:", err);
      setEstado("error");
    }
    setProcesando(false);
  };

  const simularPago = async () => {
    setProcesando(true);
    try {
      await actualizarInscripcion(torneoId, inscripcionId, {
        status: "pendiente_aprobacion",
        pagado: true,
        fechaPago: new Date().toISOString(),
      });
      setInscripcion({ ...inscripcion, status: "pendiente_aprobacion" });
      setEstado("pendiente_aprobacion");
    } catch (err) {
      console.error("Error al procesar pago:", err);
      setEstado("error");
    }
    setProcesando(false);
  };

  if (loading) {
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        Cargando invitación...
      </div>
    );
  }

  if (!torneo || !inscripcion) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="text-5xl mb-4">❌</div>
        <p className="font-medium" style={{ color: "var(--text-muted)" }}>Invitación no encontrada</p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          El link puede estar vencido o ser incorrecto
        </p>
        <button
          onClick={() => navigate("/torneos")}
          className="mt-4 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition"
        >
          Ver torneos
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="themed-card border rounded-2xl p-6 mb-4">
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">🏸</div>
          <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Invitación a torneo
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{torneo.nombre}</p>
        </div>

        {/* ✅ Bloque reemplazado según consigna */}
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "var(--bg-card-hover)" }}>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Sede</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>{torneo.sede}</span>
            </div>
            <div>
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Ubicación</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {torneo.ciudad}, {torneo.provincia}
              </span>
            </div>
            {torneo.direccionSede && (
              <div className="col-span-2">
                <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Dirección</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {torneo.direccionSede}
                </span>
              </div>
            )}
            <div>
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Fechas</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {torneo.fechaInicio} → {torneo.fechaFin}
              </span>
            </div>
            <div>
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Inscripción</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {torneo.inscripcion > 0 ? `$${torneo.inscripcion}` : "Gratuita"}
              </span>
            </div>
            <div>
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Formato</span>
              <span className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>
                {torneo.formato}
              </span>
            </div>
            <div>
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Máx. parejas</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {torneo.maxParejas}
              </span>
            </div>
            {Array.isArray(torneo.categoriaGenero) && (
              <div>
                <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Género</span>
                <span className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>
                  {torneo.categoriaGenero.join(", ")}
                </span>
              </div>
            )}
            {torneo.categoriasConfig && (
              <div className="col-span-2">
                <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Categorías</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {Object.entries(torneo.categoriasConfig)
                    .map(
                      ([g, niveles]) =>
                        `${g.charAt(0).toUpperCase() + g.slice(1)}: ${niveles.join(", ")}`,
                    )
                    .join(" | ")}
                </span>
              </div>
            )}
          </div>
          {torneo.reglamento && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border-card)" }}>
              <span className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>
                Reglamento
              </span>
              <p className="text-xs whitespace-pre-line" style={{ color: "var(--text-primary)" }}>
                {torneo.reglamento}
              </p>
            </div>
          )}
        </div>

        {/* Estado: esperando confirmación */}
        {!estado && inscripcion.status === "esperando_companero" && (
          <div className="flex flex-col gap-2">
            <button
              onClick={aceptarInvitacion}
              disabled={procesando}
              className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
            >
              {procesando ? "Aceptando..." : "Aceptar invitación"}
            </button>
            <button
              onClick={() => navigate("/torneos")}
              className="w-full font-semibold py-2 rounded-xl bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] transition"
            >
              Rechazar
            </button>
          </div>
        )}

        {/* Estado: pendiente de pago */}
        {estado === "pendiente_pago" && (
          <div className="flex flex-col gap-3">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
              <p className="text-yellow-700 font-semibold">
                Invitación aceptada
              </p>
              <p className="text-yellow-600 text-sm mt-1">
                Ahora necesitan completar el pago de inscripción
              </p>
            </div>
            {torneo.inscripcion > 0 ? (
              <div className="themed-card border rounded-xl p-4">
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                  Total a pagar: ${torneo.inscripcion}
                </p>
                <button
                  onClick={simularPago}
                  disabled={procesando}
                  className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
                >
                  {procesando ? "Procesando..." : "Simular pago"}
                </button>
                <p className="text-xs mt-2 text-center" style={{ color: "var(--text-muted)" }}>
                  En producción esto se conectaría a MercadoPago
                </p>
              </div>
            ) : (
              <button
                onClick={simularPago}
                disabled={procesando}
                className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
              >
                {procesando
                  ? "Procesando..."
                  : "Confirmar inscripción gratuita"}
              </button>
            )}
          </div>
        )}

        {/* Estado: pendiente de aprobación */}
        {estado === "pendiente_aprobacion" && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <div className="text-3xl mb-2">⏳</div>
            <p className="text-orange-700 font-semibold">Pago registrado</p>
            <p className="text-orange-600 text-sm mt-1">
              Tu inscripción está pendiente de aprobación por el organizador. Te
              notificaremos cuando sea confirmada.
            </p>
            <button
              onClick={() => navigate(`/torneos/${torneoId}`)}
              className="mt-3 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition"
            >
              Ver torneo
            </button>
          </div>
        )}

        {/* Estado: confirmada */}
        {estado === "confirmada" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-green-700 font-semibold">
              Inscripción confirmada
            </p>
            <p className="text-green-600 text-sm mt-1">
              Ya están inscriptos en el torneo. ¡Éxitos!
            </p>
            <button
              onClick={() => navigate(`/torneos/${torneoId}`)}
              className="mt-3 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition"
            >
              Ver torneo
            </button>
          </div>
        )}

        {/* Estado: rechazada */}
        {estado === "rechazada" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="text-3xl mb-2">❌</div>
            <p className="text-red-700 font-semibold">Inscripción rechazada</p>
            {inscripcion.motivoRechazo && (
              <p className="text-red-600 text-sm mt-1">
                Motivo: {inscripcion.motivoRechazo}
              </p>
            )}
            <button
              onClick={() => navigate("/torneos")}
              className="mt-3 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition"
            >
              Ver otros torneos
            </button>
          </div>
        )}

        {estado === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-600 text-sm">
              Hubo un error. Intentá de nuevo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
