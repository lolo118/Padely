import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  getTorneoById,
  getParejas,
  getGrupos,
  getBracket,
  crearSolicitudInscripcion,
  getInscripciones,
} from "../services/torneoService";

const estadoBadge = {
  inscripcion: "bg-blue-100 text-blue-700",
  en_curso: "bg-green-100 text-green-700",
  finalizado: "bg-gray-100 text-gray-500",
  cancelado: "bg-red-100 text-red-500",
};

const estadoLabel = {
  inscripcion: "Inscripción abierta",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

const formatoLabel = {
  mini: "Mini torneo",
  normal: "Torneo normal",
  liga: "Liga",
  eliminacion: "Eliminación directa",
};

function getNombrePareja(p) {
  if (!p) return "Por definir";
  return p.nombrePareja || `${p.jugador1} / ${p.jugador2}`;
}

const tabs = ["Info", "Parejas", "Grupos", "Bracket"];

export default function DetalleTorneoPublico() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [torneo, setTorneo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Info");
  const [parejas, setParejas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [bracket, setBracket] = useState(null);
  const [inscripciones, setInscripciones] = useState([]);

  // Formulario inscripción
  const [mostrarFormInsc, setMostrarFormInsc] = useState(false);
  const [nombre1, setNombre1] = useState("");
  const [apellido1, setApellido1] = useState("");
  const [email1, setEmail1] = useState("");
  const [whatsapp1, setWhatsapp1] = useState("");
  const [nombre2, setNombre2] = useState("");
  const [apellido2, setApellido2] = useState("");
  const [email2, setEmail2] = useState("");
  const [whatsapp2, setWhatsapp2] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [inscripcionEnviada, setInscripcionEnviada] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const [torneoData, parejasData, gruposData, bracketData, inscData] =
          await Promise.all([
            getTorneoById(id),
            getParejas(id),
            getGrupos(id),
            getBracket(id),
            getInscripciones(id),
          ]);
        setTorneo(torneoData);
        setParejas(parejasData);
        setGrupos(gruposData);
        if (bracketData) setBracket(bracketData);
        setInscripciones(inscData);
      } catch (err) {
        console.error("Error al cargar torneo:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [id]);

  const yaInscripto = user
    ? inscripciones.some(
        (i) =>
          (i.jugador1Uid === user.uid || i.jugador2Uid === user.uid) &&
          i.status !== "rechazada",
      )
    : false;

  const handleInscripcion = async (e) => {
    e.preventDefault();
    if (!apellido1.trim() || !apellido2.trim()) return;
    if (!email2.trim() && !whatsapp2.trim()) return;
    setEnviando(true);
    try {
      await crearSolicitudInscripcion(id, {
        nombre1: nombre1.trim(),
        apellido1: apellido1.trim(),
        email1: email1.trim() || user?.email || "",
        whatsapp1: whatsapp1.trim(),
        jugador1Uid: user?.uid || null,
        nombre2: nombre2.trim(),
        apellido2: apellido2.trim(),
        email2: email2.trim(),
        whatsapp2: whatsapp2.trim(),
        jugador2Uid: null,
      });
      setInscripcionEnviada(true);
      setMostrarFormInsc(false);
    } catch (err) {
      console.error("Error al crear inscripción:", err);
    }
    setEnviando(false);
  };

  if (loading)
    return <div className="text-center text-gray-400 py-12">Cargando...</div>;

  if (!torneo)
    return (
      <div className="text-center text-gray-400 py-12">
        Torneo no encontrado
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate("/torneos")}
          className="text-gray-400 hover:text-gray-600 text-xl"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">{torneo.nombre}</h1>
          <p className="text-sm text-gray-400">
            {torneo.sede} — {torneo.ciudad}, {torneo.provincia}
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            estadoBadge[torneo.status]
          }`}
        >
          {estadoLabel[torneo.status]}
        </span>
      </div>

      {/* Botón inscripción */}
      {torneo.status === "inscripcion" &&
        torneo.inscripcionAbierta &&
        !yaInscripto &&
        !inscripcionEnviada && (
          <button
            onClick={() => setMostrarFormInsc(true)}
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition mb-4"
          >
            Inscribirme a este torneo
          </button>
        )}

      {inscripcionEnviada && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
          <p className="text-green-700 font-semibold">Solicitud enviada</p>
          <p className="text-green-600 text-sm mt-1">
            Se envió una invitación a tu compañero/a. Una vez que acepte y se
            procese el pago, el organizador revisará tu inscripción.
          </p>
        </div>
      )}

      {yaInscripto && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-center">
          <p className="text-blue-700 font-semibold">
            Ya tenés una inscripción en este torneo
          </p>
        </div>
      )}

      {/* Formulario inscripción */}
      {mostrarFormInsc && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-green-200 mb-4">
          <h2 className="font-semibold text-green-700 mb-3">Inscripción</h2>
          <form onSubmit={handleInscripcion} className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-500">
              Tus datos (Jugador 1)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre"
                value={nombre1}
                onChange={(e) => setNombre1(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <input
                type="text"
                placeholder="Apellido"
                value={apellido1}
                onChange={(e) => setApellido1(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email"
                value={email1}
                onChange={(e) => setEmail1(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                placeholder="WhatsApp"
                value={whatsapp1}
                onChange={(e) => setWhatsapp1(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <p className="text-xs font-semibold text-gray-500 mt-2">
              Datos de tu compañero/a (Jugador 2)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre"
                value={nombre2}
                onChange={(e) => setNombre2(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <input
                type="text"
                placeholder="Apellido"
                value={apellido2}
                onChange={(e) => setApellido2(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email"
                value={email2}
                onChange={(e) => setEmail2(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                placeholder="WhatsApp"
                value={whatsapp2}
                onChange={(e) => setWhatsapp2(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <p className="text-xs text-gray-400">
              Se necesita al menos email o WhatsApp del compañero para enviar la
              invitación
            </p>

            {apellido1.trim() && apellido2.trim() && (
              <p className="text-xs text-gray-500">
                Nombre de pareja:{" "}
                <span className="font-semibold">
                  {apellido1.trim()}-{apellido2.trim()}
                </span>
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMostrarFormInsc(false)}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  enviando ||
                  !apellido1.trim() ||
                  !apellido2.trim() ||
                  (!email2.trim() && !whatsapp2.trim())
                }
                className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
              >
                {enviando ? "Enviando..." : "Enviar solicitud"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
              tab === t
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Info */}
      {tab === "Info" && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-700 mb-3">Detalles</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-400 block">Formato</span>
                <span className="font-medium text-gray-700">
                  {formatoLabel[torneo.formato]}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Categoría Género</span>
                <span className="font-medium text-gray-700 capitalize">
                  {Array.isArray(torneo.categoriaGenero)
                    ? torneo.categoriaGenero.join(", ")
                    : "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Categoría Nivel</span>
                <span className="font-medium text-gray-700">
                  {torneo.categoriasConfig
                    ? Object.entries(torneo.categoriasConfig)
                        .map(
                          ([g, niveles]) =>
                            `${g.charAt(0).toUpperCase() + g.slice(1)}: ${niveles.join(", ")}`,
                        )
                        .join(" | ")
                    : "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Máx. parejas</span>
                <span className="font-medium text-gray-700">
                  {torneo.maxParejas}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Inscripción</span>
                <span className="font-medium text-gray-700">
                  {torneo.inscripcion > 0
                    ? `$${torneo.inscripcion}`
                    : "Gratuita"}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Fechas</span>
                <span className="font-medium text-gray-700">
                  {torneo.fechaInicio} → {torneo.fechaFin}
                </span>
              </div>
            </div>

            {torneo.direccionSede && (
              <div className="mt-3 pt-3 border-t border-gray-100 text-sm">
                <span className="text-gray-400 block">Dirección</span>
                <span className="font-medium text-gray-700">
                  {torneo.direccionSede}
                </span>
              </div>
            )}

            {torneo.descripcion && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-gray-400 text-sm block mb-1">
                  Descripción
                </span>
                <p className="text-sm text-gray-700">{torneo.descripcion}</p>
              </div>
            )}

            {torneo.reglamento && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-gray-400 text-sm block mb-1">
                  Reglamento
                </span>
                <p className="text-sm text-gray-700 whitespace-pre-line">
                  {torneo.reglamento}
                </p>
              </div>
            )}

            {(torneo.instagramOrganizador || torneo.whatsappOrganizador) && (
              <div className="mt-3 pt-3 border-t border-gray-100 text-sm">
                <span className="text-gray-400 block mb-1">Contacto</span>
                {torneo.instagramOrganizador && (
                  <p className="text-gray-700">
                    IG: {torneo.instagramOrganizador}
                  </p>
                )}
                {torneo.whatsappOrganizador && (
                  <p className="text-gray-700">
                    WA: {torneo.whatsappOrganizador}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parejas */}
      {tab === "Parejas" && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-3">
            Parejas inscriptas ({parejas.length}/{torneo.maxParejas})
          </h2>
          {parejas.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">
              No hay parejas inscriptas todavía
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {parejas.map((p, index) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3"
                >
                  <span className="text-xs font-bold text-gray-400 w-6">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      {p.nombrePareja || `${p.jugador1} / ${p.jugador2}`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {p.jugador1} — {p.jugador2}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grupos */}
      {tab === "Grupos" && (
        <div className="flex flex-col gap-4">
          {grupos.length === 0 ? (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center py-12">
              <p className="text-gray-400">
                Los grupos aún no fueron generados
              </p>
            </div>
          ) : (
            grupos.map((grupo, gi) => (
              <div
                key={grupo.id || gi}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
              >
                <h2 className="font-semibold text-gray-700 mb-3">
                  {grupo.nombre}
                </h2>
                <div className="flex flex-col gap-1 mb-3">
                  {grupo.parejas.map((p, pi) => (
                    <div
                      key={pi}
                      className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2"
                    >
                      {getNombrePareja(p)}
                    </div>
                  ))}
                </div>
                {(grupo.partidos || []).some((p) => p.resultado) && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2">
                      Resultados
                    </h3>
                    <div className="flex flex-col gap-1">
                      {grupo.partidos
                        .filter((p) => p.resultado)
                        .map((p, pi) => (
                          <div
                            key={pi}
                            className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                          >
                            <span className="text-gray-700">
                              {getNombrePareja(p.pareja1)} vs{" "}
                              {getNombrePareja(p.pareja2)}
                            </span>
                            <span className="font-bold text-gray-700">
                              {p.resultado.sets
                                .map((s) => {
                                  let txt = `${s.g1}-${s.g2}`;
                                  if (
                                    s.tb1 !== undefined &&
                                    s.tb2 !== undefined
                                  )
                                    txt += ` (TB ${s.tb1}-${s.tb2})`;
                                  return txt;
                                })
                                .join(" / ")}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Bracket */}
      {tab === "Bracket" && (
        <div className="flex flex-col gap-4">
          {!bracket || !bracket.rondas ? (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center py-12">
              <p className="text-gray-400">El bracket aún no fue generado</p>
            </div>
          ) : (
            bracket.rondas.map((ronda, ri) => {
              const totalRondas = bracket.rondas.length;
              const faltantes = totalRondas - ri;
              let nombreRonda = `Ronda ${ri + 1}`;
              if (faltantes === 1) nombreRonda = "Final";
              else if (faltantes === 2) nombreRonda = "Semifinales";
              else if (faltantes === 3) nombreRonda = "Cuartos de final";
              else if (faltantes === 4) nombreRonda = "Octavos de final";

              return (
                <div
                  key={ri}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
                >
                  <h2 className="font-semibold text-gray-700 mb-3">
                    {nombreRonda}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {ronda.map((p, pi) => (
                      <div
                        key={pi}
                        className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
                      >
                        <div className="flex-1">
                          <p
                            className={`text-sm font-medium ${p.pareja1 ? "text-gray-700" : "text-gray-300"}`}
                          >
                            {getNombrePareja(p.pareja1)}
                          </p>
                          <p className="text-xs text-gray-400">vs</p>
                          <p
                            className={`text-sm font-medium ${p.pareja2 ? "text-gray-700" : "text-gray-300"}`}
                          >
                            {getNombrePareja(p.pareja2)}
                          </p>
                        </div>
                        {p.resultado && (
                          <span className="text-sm font-bold text-gray-700">
                            {p.resultado.sets
                              .map((s) => {
                                let txt = `${s.g1}-${s.g2}`;
                                if (s.tb1 !== undefined && s.tb2 !== undefined)
                                  txt += ` (TB ${s.tb1}-${s.tb2})`;
                                return txt;
                              })
                              .join(" / ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
