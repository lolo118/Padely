import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  CircleDot,
  ClipboardList,
  Copy,
  AtSign,
  MapPin,
  MessageCircle,
  Phone,
  Share,
  Trophy,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  getTorneoById,
  getParejas,
  getGrupos,
  getCuadros,
  crearSolicitudInscripcion,
  getInscripciones,
  puedeInscribirse,
  crearReclamo,
  getReclamos,
  adherirseAReclamo,
  dejarDescargo,
} from "../services/torneoService";
import { getUserData } from "../services/authService";
import { getClubConfig } from "../services/canchaService";
import { logEvento } from "../lib/firebase";
import { formatDiaCorto, formatFecha } from "../utils/formatDate";
import { formatPrecio } from "../utils/format";
import {
  calcularTabla,
  etiquetaProgramacion,
  getGanador,
  getNombrePareja,
  listaCategorias,
  cuadrosDeTorneo,
  cuadroDePareja,
  parejasDeCuadro,
  parejasSinCuadro,
  cuadroDeGrupo,
  labelDeCuadro,
  nombreRonda,
  sedeDeTorneo,
  clubAceptado,
  canchasDelTorneo,
} from "../utils/torneo";
import { notificarInscripcionTorneo, notificarReclamoContra, notificarNuevoReclamo } from "../services/notificationService";
import { toast } from "../components/Toast";
import {
  Badge,
  Button,
  Card,
  CategorySelect,
  ChampionCard,
  Field,
  Input,
  MarcaCategoria,
  MatchCard,
  Pills,
  Select,
  Standings,
  Tabs,
  Textarea,
} from "../components/ui";

const estadoTone = {
  inscripcion: "court",
  en_curso: "lime",
  finalizado: "neutral",
  cancelado: "danger",
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

const motivoLabel = {
  categoria_incorrecta: "Categoría incorrecta",
  conducta_antideportiva: "Conducta antideportiva",
};

const textoParejas = (n) => `${n} ${n === 1 ? "pareja" : "parejas"}`;

// Los valores de las tabs son el estado de siempre; solo cambia la etiqueta visible ("Bracket" se lee "Cuadro")
const tabLabel = { Bracket: "Cuadro" };

const getTabs = (formato) => {
  if (formato === "liga") return ["Info", "Parejas", "Liga"];
  if (formato === "eliminacion") return ["Info", "Parejas", "Bracket"];
  return ["Info", "Parejas", "Grupos", "Bracket"];
};

// ===== Helpers de presentación (puros) =====
// MatchCard espera ganador 0 | 1 | null; getGanador devuelve 1 | 2 | null
const indiceGanador = (resultado) => {
  const g = resultado ? getGanador(resultado) : null;
  return g === 1 ? 0 : g === 2 ? 1 : null;
};

const parejasDePartido = (p) => [
  { nombre: getNombrePareja(p.pareja1), sets: p.resultado ? p.resultado.sets.map((s) => s.g1) : [] },
  { nombre: getNombrePareja(p.pareja2), sets: p.resultado ? p.resultado.sets.map((s) => s.g2) : [] },
];

// Los tie-breaks van en el pie de la tarjeta ("TB 7–5")
const pieDePartido = (p) => {
  const tbs = (p.resultado?.sets || []).filter((s) => s.tb1 !== undefined && s.tb2 !== undefined);
  return tbs.length > 0 ? tbs.map((s) => `TB ${s.tb1}–${s.tb2}`).join(" · ") : undefined;
};

// `cancha` es el nombre de la cancha ("Cancha 2", "Central"); los torneos viejos guardaban solo el número
// Se muestra como "sáb 18 oct · 20:00 · Cancha 2" (lo que falte se omite); va entero por `hora` porque MatchCard
// une [cancha, hora] en ese orden.
const lugarDePartido = (p) => {
  const cancha = p.cancha ? (/^\d+$/.test(String(p.cancha)) ? `Cancha ${p.cancha}` : String(p.cancha)) : "";
  return { hora: etiquetaProgramacion({ dia: p.dia, hora: p.hora, cancha }, formatDiaCorto) || undefined };
};

// La ronda decide el vestido de la tarjeta: final (negro y oro), semi (banda heat), pendiente o normal
const variantDeRonda = (totalRondas, rondaIdx, partido) => {
  const faltantes = totalRondas - rondaIdx;
  if (faltantes === 1) return "final";
  if (faltantes === 2) return "semi";
  return partido.resultado ? "default" : "pending";
};

// Una categoría va siempre con su marca y su nombre
const etiquetaConMarca = (nivel, texto) =>
  nivel ? (
    <span className="inline-flex items-center gap-1">
      <MarcaCategoria cat={nivel} size={20} />
      {texto}
    </span>
  ) : (
    texto
  );

export default function DetalleTorneoPublico() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [torneo, setTorneo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Info");
  const [parejas, setParejas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  // { [cuadroId]: { label, rondas } } — un bracket por cuadro
  const [cuadrosData, setCuadrosData] = useState({});
  // Cuadro elegido a mano con las pastillas; mientras no se elija, se calcula uno por defecto
  const [cuadroSel, setCuadroSel] = useState(null);
  const [cuadroElegido, setCuadroElegido] = useState(false);
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
  const [linkInvitacion, setLinkInvitacion] = useState("");
  const [restriccionCategoria, setRestriccionCategoria] = useState(null);
  const [categoriaJugador, setCategoriaJugador] = useState("");
  const [categoriaInsc, setCategoriaInsc] = useState("");

  const [reclamos, setReclamos] = useState([]);
  const [mostrarFormReclamo, setMostrarFormReclamo] = useState(null);
  const [motivoReclamo, setMotivoReclamo] = useState("categoria_incorrecta");
  const [comentarioReclamo, setComentarioReclamo] = useState("");
  const [enviandoReclamo, setEnviandoReclamo] = useState(false);
  const [descargoTexto, setDescargoTexto] = useState("");
  const [mostrarInfoReclamos, setMostrarInfoReclamos] = useState(false);
  // Documento público del club sede (solo cuando el club aceptó): de acá sale la dirección
  const [clubSede, setClubSede] = useState(null);

  // Una sola lectura del club por torneo; si falla, la sede se muestra sin dirección
  const clubSedeId = clubAceptado(torneo) ? torneo.club.id : null;
  useEffect(() => {
    if (!clubSedeId) return;
    let vigente = true;
    getClubConfig(clubSedeId)
      .then((datos) => {
        if (vigente) setClubSede(datos);
      })
      .catch(() => {
        // Sin dirección: el link al club alcanza
      });
    return () => {
      vigente = false;
    };
  }, [clubSedeId]);

  useEffect(() => {
    if (!user) return;
    getUserData(user.uid).then((data) => {
      if (data) {
        setNombre1(data.nombre?.split(" ")[0] || "");
        setApellido1(data.nombre?.split(" ").slice(1).join(" ") || "");
        setEmail1(data.email || user.email || "");
        setWhatsapp1(data.telefono || "");
      }
    });
  }, [user]);

  // Reclamos
  useEffect(() => {
    const cargar = async () => {
      try {
        const [torneoData, parejasData, gruposData, cuadrosCargados, inscData] =
          await Promise.all([
            getTorneoById(id),
            getParejas(id),
            getGrupos(id),
            getCuadros(id),
            // Las inscripciones no son públicas: sin sesión no se leen
            user ? getInscripciones(id) : Promise.resolve([]),
          ]);
        setTorneo(torneoData);
        setParejas(parejasData);
        // Con una sola categoría se asigna sola; con varias el jugador la elige en el formulario
        const cats = listaCategorias(torneoData);
        if (cats.length === 1) setCategoriaInsc(cats[0].id);
        setGrupos(
          gruposData.sort((a, b) =>
            (a.nombre || "").localeCompare(b.nombre || ""),
          ),
        );
        setCuadrosData(cuadrosCargados || {});
        setInscripciones(inscData);

        // Si el torneo está en curso, mostrar grupos por defecto
        if (
          torneoData &&
          torneoData.status === "en_curso" &&
          gruposData.length > 0
        ) {
          setTab(torneoData.formato === "liga" ? "Liga" : "Grupos");
        }

        // Cargar reclamos (no son públicos: solo con sesión)
        if (user) try {
          const reclamosData = await getReclamos(id);
          setReclamos(reclamosData);
        } catch (e) {
          console.error("Error al cargar reclamos:", e);
        }

        // Verificar restricción de categoría
        if (user && torneoData) {
          const userData = await getUserData(user.uid);
          if (userData) {
            setCategoriaJugador(userData.nivel || "");
            const categoriasTorneo = torneoData.categoriasConfig
              ? Object.values(torneoData.categoriasConfig).flat()
              : [];
            if (userData.nivel && categoriasTorneo.length > 0) {
              const puedeEnAlguna = categoriasTorneo.some((cat) =>
                puedeInscribirse(userData.nivel, cat),
              );
              if (!puedeEnAlguna) {
                setRestriccionCategoria(
                  `Tu categoría (${userData.nivel}) es superior a las categorías de este torneo. No podés inscribirte en una categoría menor.`,
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("Error al cargar torneo:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [id, user]);

  const miPareja = parejas.find(
    (p) => p.jugador1Uid === user?.uid || p.jugador2Uid === user?.uid,
  );

  // ===== Cuadros =====
  // Sin setState en efectos: el cuadro por defecto se deriva en el render y solo las pastillas lo pisan.
  const cuadros = torneo ? cuadrosDeTorneo(torneo) : [];
  const variosCuadros = cuadros.length > 1;
  const cuadroPorDefecto = (() => {
    if (cuadros.length === 0) return null;
    const mio = miPareja ? cuadroDePareja(miPareja, torneo) : null;
    if (mio && cuadros.some((c) => c.id === mio)) return mio;
    const conParejas = cuadros.find(
      (c) => parejasDeCuadro(parejas, c.id, torneo).length > 0,
    );
    return conParejas ? conParejas.id : cuadros[0].id;
  })();
  const cuadroActual =
    cuadroElegido && cuadroSel && cuadros.some((c) => c.id === cuadroSel)
      ? cuadroSel
      : cuadroPorDefecto;
  const gruposDelCuadro = grupos.filter(
    (g) => cuadroDeGrupo(g, torneo) === cuadroActual,
  );
  const rondas = cuadrosData[cuadroActual]?.rondas || null;
  const labelCuadroActual = variosCuadros ? labelDeCuadro(cuadroActual, torneo) : undefined;

  // Pastillas para cambiar de cuadro (solo con más de un cuadro); viven en el hero
  const selectorCuadros = variosCuadros ? (
    <Pills
      className="mt-4"
      ariaLabel="Cuadro"
      items={cuadros.map((c) => ({
        value: c.id,
        label: etiquetaConMarca(c.nivel, c.label),
        count: parejasDeCuadro(parejas, c.id, torneo).length,
      }))}
      value={cuadroActual}
      onChange={(valor) => {
        setCuadroSel(valor);
        setCuadroElegido(true);
      }}
    />
  ) : null;

  const handleReclamo = async (partido, grupoNombre, grupo) => {
    if (!miPareja) return;
    setEnviandoReclamo(true);
    try {
      const parejaDenunciada =
        partido.pareja1.id === miPareja.id ? partido.pareja2 : partido.pareja1;
      const cuadroReclamo = grupo ? cuadroDeGrupo(grupo, torneo) : null;
      await crearReclamo(id, {
        parejaDenunciante: {
          id: miPareja.id,
          nombrePareja: miPareja.nombrePareja,
          jugador1: miPareja.jugador1,
          jugador2: miPareja.jugador2,
        },
        parejaDenunciada: {
          id: parejaDenunciada.id,
          nombrePareja: parejaDenunciada.nombrePareja,
          jugador1: parejaDenunciada.jugador1,
          jugador2: parejaDenunciada.jugador2,
        },
        motivo: motivoReclamo,
        comentario: comentarioReclamo,
        grupoNombre,
        ...(grupo
          ? {
              cuadroId: cuadroReclamo,
              cuadroLabel: labelDeCuadro(cuadroReclamo, torneo),
            }
          : {}),
      });
      const reclamosData = await getReclamos(id);
      setReclamos(reclamosData);
      setMostrarFormReclamo(null);
      setComentarioReclamo("");
      // Notify denounced pair and organizer
      if (parejaDenunciada.jugador1Uid) notificarReclamoContra(parejaDenunciada.jugador1Uid, torneo.nombre, id);
      if (parejaDenunciada.jugador2Uid) notificarReclamoContra(parejaDenunciada.jugador2Uid, torneo.nombre, id);
      if (torneo.organizerId) notificarNuevoReclamo(torneo.organizerId, torneo.nombre, id);
      toast.success("Reclamo enviado correctamente");
    } catch (err) {
      console.error("Error:", err);
      toast.error("No pudimos enviar el reclamo. Intentá de nuevo.");
    }
    setEnviandoReclamo(false);
  };

  const handleAdherirse = async (reclamoId) => {
    if (!miPareja) return;
    try {
      await adherirseAReclamo(id, reclamoId, {
        id: miPareja.id,
        nombrePareja: miPareja.nombrePareja,
        jugador1: miPareja.jugador1,
        jugador2: miPareja.jugador2,
      });
      const reclamosData = await getReclamos(id);
      setReclamos(reclamosData);
      toast.success("Te adheriste al reclamo");
    } catch (err) {
      console.error("Error:", err);
      toast.error("No pudimos registrar tu adhesión. Intentá de nuevo.");
    }
  };

  const handleDescargo = async (reclamoId) => {
    if (!descargoTexto.trim()) return;
    try {
      await dejarDescargo(id, reclamoId, descargoTexto);
      const reclamosData = await getReclamos(id);
      setReclamos(reclamosData);
      setDescargoTexto("");
      toast.success("Descargo enviado");
    } catch (err) {
      console.error("Error:", err);
      toast.error("No pudimos enviar el descargo. Intentá de nuevo.");
    }
  };

  // Un jugador ya vinculado a una pareja (miPareja) cuenta como inscripto
  const yaInscripto =
    !!miPareja ||
    (user
      ? inscripciones.some(
          (i) =>
            (i.jugador1Uid === user.uid || i.jugador2Uid === user.uid) &&
            i.status !== "rechazada",
        )
      : false);

  const categorias = listaCategorias(torneo);
  const cupoCompleto = !!torneo && parejas.length >= Number(torneo.maxParejas || 0);
  // El CategorySelect muestra solo el nivel: sirve cuando todas las categorías son del mismo género.
  // Con varios géneros el jugador elige entre pastillas con la etiqueta completa ("7ma Masculino").
  const unSoloGenero = new Set(categorias.map((c) => c.genero)).size === 1;
  const categoriaElegida = categorias.find((c) => c.id === categoriaInsc);

  const handleInscripcion = async (e) => {
    e.preventDefault();
    if (!apellido1.trim() || !apellido2.trim()) return;
    if (!email2.trim() && !whatsapp2.trim()) return;
    if (categorias.length > 1 && !categoriaInsc) return;
    setEnviando(true);
    try {
      const inscId = await crearSolicitudInscripcion(id, {
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
        categoria: categorias.length === 1 ? categorias[0].id : categoriaInsc || null,
      });
      logEvento("inscripcion_creada", { torneoId: id });
      const link = `${window.location.origin}/invitacion/${id}/${inscId}`;
      setLinkInvitacion(link);
      setInscripcionEnviada(true);
      setMostrarFormInsc(false);
      if (torneo.organizerId) {
        notificarInscripcionTorneo(torneo.organizerId, `${nombre1} ${apellido1}`, torneo.nombre, id);
      }
    } catch (err) {
      console.error("Error al crear inscripción:", err);
      toast.error("No pudimos enviar la inscripción. Intentá de nuevo.");
    }
    setEnviando(false);
  };

  if (loading)
    return (
      <div className="max-w-[960px] mx-auto grid gap-4" aria-busy="true">
        <span className="sr-only">Cargando…</span>
        <div className="pd-skeleton h-48 rounded-lg!" />
        <div className="pd-skeleton h-11" />
        <div className="pd-skeleton h-64 rounded-lg!" />
      </div>
    );

  if (!torneo)
    return (
      <div className="max-w-[960px] mx-auto">
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <h1 className="heading-md">Torneo no encontrado</h1>
          <p className="body-sm text-ink-2 mt-1 mb-4">El link puede estar mal escrito o el torneo ya no está disponible.</p>
          <Button as="link" to="/torneos">
            Ver torneos
          </Button>
        </Card>
      </div>
    );

  const tabsItems = getTabs(torneo?.formato || "normal").map((t) => ({
    value: t,
    label: tabLabel[t] || t,
    count: t === "Parejas" ? parejas.length : undefined,
  }));
  const reclamosAbiertos = reclamos.filter((r) => r.estado === "abierto");
  const avanzan = Number(torneo.parejasQueAvanzan) || 2;

  // Sede: el club de Padely (con link y dirección) cuando aceptó; si no, el texto de siempre
  const sede = sedeDeTorneo(torneo);
  const sedeEsClub = clubAceptado(torneo);
  const direccionSede = sedeEsClub ? clubSede?.direccion || sede.direccion : torneo.direccionSede;
  const canchasSede = sedeEsClub ? canchasDelTorneo(torneo) : [];
  const linkClubSede = sedeEsClub ? (
    <Link to={`/club/${sede.clubId}`} className="inline-flex items-center gap-1 text-court hover:underline">
      <Building2 className="pd-icon" size={20} aria-hidden="true" />
      {sede.nombre}
    </Link>
  ) : null;

  // Un partido de grupo o de liga como MatchCard (sin botones adentro; el reclamo va debajo)
  const tarjetaPartido = (p, ronda, extra = {}) => (
    <MatchCard
      className="max-w-none!"
      ronda={ronda}
      cuadro={labelCuadroActual}
      {...lugarDePartido(p)}
      parejas={parejasDePartido(p)}
      ganador={indiceGanador(p.resultado)}
      variant={p.resultado ? "default" : "pending"}
      foot={pieDePartido(p)}
      {...extra}
    />
  );

  return (
    <div className="max-w-[960px] mx-auto grid gap-4">
      {/* Hero: night en los dos temas */}
      <Card variant="night" as="header">
        <div className="flex items-start justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            className="-ml-2"
            aria-label="Volver a torneos"
            icon={<ArrowLeft className="pd-icon" size={20} aria-hidden="true" />}
            onClick={() => navigate("/torneos")}
          />
          <Badge tone={estadoTone[torneo.status] || "neutral"}>{estadoLabel[torneo.status] || torneo.status}</Badge>
        </div>
        {sedeEsClub ? (
          <p className="pd-eyebrow mt-3!">
            {sede.nombre}
            {sede.ciudad ? ` · ${sede.ciudad}` : ""}
          </p>
        ) : (
          formatoLabel[torneo.formato] && <p className="pd-eyebrow mt-3!">{formatoLabel[torneo.formato]}</p>
        )}
        <h1 className="display-lg mt-1">{torneo.nombre}</h1>
        {sedeEsClub ? (
          <p className="body-sm text-ink-2 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {linkClubSede}
            {direccionSede && <span>{direccionSede}</span>}
          </p>
        ) : (
          <p className="body-sm text-ink-2 mt-2">
            {torneo.sede} — {torneo.ciudad}, {torneo.provincia}
          </p>
        )}
        <p className="body-sm text-ink-2 pd-tnum">
          {formatFecha(torneo.fechaInicio)} → {formatFecha(torneo.fechaFin)}
        </p>
        {selectorCuadros}
      </Card>

      {/* Sin sesión: inscripción, reclamos y vinculación requieren cuenta */}
      {!user && (
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <h2 className="heading-md">Iniciá sesión para inscribirte</h2>
          <p className="body-sm text-ink-2 mt-1 mb-4">
            {torneo.status === "inscripcion" && torneo.inscripcionAbierta
              ? "Con tu cuenta podés anotarte con tu pareja, seguir tus partidos y abrir reclamos."
              : "Con tu cuenta podés seguir tus partidos, tus reclamos y tu ranking."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button as="link" to={`/login?next=${encodeURIComponent(`/torneos/${id}`)}`} variant="primary">
              Iniciar sesión
            </Button>
            <Button as="link" to="/register">
              Crear cuenta
            </Button>
          </div>
        </Card>
      )}

      {/* Botón inscripción */}
      {user &&
        torneo.status === "inscripcion" &&
        torneo.inscripcionAbierta &&
        !yaInscripto &&
        !inscripcionEnviada && (
          <>
            {restriccionCategoria ? (
              <Card className="flex items-start gap-3">
                <AlertTriangle className="pd-icon text-danger mt-0.5" size={20} aria-hidden="true" />
                <div>
                  <p className="heading-sm">No podés inscribirte</p>
                  <p className="body-sm text-ink-2 mt-0.5">{restriccionCategoria}</p>
                </div>
              </Card>
            ) : cupoCompleto ? (
              <Card className="text-center">
                <p className="heading-sm">Cupo completo</p>
                <p className="body-sm text-ink-2 mt-0.5 pd-tnum">
                  Ya se inscribieron {parejas.length} de {torneo.maxParejas} parejas
                </p>
              </Card>
            ) : (
              // Mientras el formulario está abierto, su "Enviar solicitud" es el único primary de la pantalla
              !mostrarFormInsc && (
                <Button variant="primary" block onClick={() => setMostrarFormInsc(true)}>
                  Inscribirme a este torneo
                </Button>
              )
            )}
          </>
        )}

      {yaInscripto && !inscripcionEnviada && (
        <Card className="flex items-center gap-3">
          <Check className="pd-icon text-success" size={20} aria-hidden="true" />
          <p className="body-md font-semibold!">
            Ya estás inscripto en este torneo{miPareja?.nombrePareja ? ` · ${miPareja.nombrePareja}` : ""}
          </p>
        </Card>
      )}

      {/* Solicitud enviada */}
      {inscripcionEnviada && (
        <Card>
          <div className="flex items-center gap-2">
            <Check className="pd-icon text-success" size={20} aria-hidden="true" />
            <h2 className="heading-md">Solicitud creada</h2>
          </div>
          <p className="body-sm text-ink-2 mt-1">Enviá este link a tu compañero/a para que acepte la invitación:</p>
          <p className="body-sm break-all rounded-sm bg-surface-sunken p-3 mt-3">{linkInvitacion}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              className="flex-1"
              icon={<Copy className="pd-icon" size={20} aria-hidden="true" />}
              onClick={() => {
                navigator.clipboard.writeText(linkInvitacion);
              }}
            >
              Copiar link
            </Button>
            {whatsapp2.trim() && (
              <a
                href={`https://wa.me/${whatsapp2.trim().replace(/\D/g, "")}?text=${encodeURIComponent(
                  `¡Hola! Te invité a jugar como pareja en el torneo "${torneo.nombre}". Aceptá la invitación acá: ${linkInvitacion}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pd-btn flex-1"
              >
                <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
                Enviar por WhatsApp
              </a>
            )}
          </div>
        </Card>
      )}

      {/* Formulario inscripción */}
      {mostrarFormInsc && (
        <Card>
          <Card.Title as="h2">Inscripción</Card.Title>
          <form onSubmit={handleInscripcion} className="grid gap-4 mt-4">
            <p className="pd-eyebrow">Tus datos (jugador 1)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input type="text" placeholder="Nombre" value={nombre1} onChange={(e) => setNombre1(e.target.value)} required />
              </Field>
              <Field label="Apellido">
                <Input
                  type="text"
                  placeholder="Apellido"
                  value={apellido1}
                  onChange={(e) => setApellido1(e.target.value)}
                  required
                />
              </Field>
              <Field label="Email">
                <Input type="email" placeholder="Email" value={email1} onChange={(e) => setEmail1(e.target.value)} />
              </Field>
              <Field label="WhatsApp">
                <Input
                  type="text"
                  inputMode="tel"
                  placeholder="WhatsApp"
                  value={whatsapp1}
                  onChange={(e) => setWhatsapp1(e.target.value)}
                />
              </Field>
            </div>

            <p className="pd-eyebrow mt-2!">Datos de tu compañero/a (jugador 2)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input type="text" placeholder="Nombre" value={nombre2} onChange={(e) => setNombre2(e.target.value)} required />
              </Field>
              <Field label="Apellido">
                <Input
                  type="text"
                  placeholder="Apellido"
                  value={apellido2}
                  onChange={(e) => setApellido2(e.target.value)}
                  required
                />
              </Field>
              <Field label="Email">
                <Input type="email" placeholder="Email" value={email2} onChange={(e) => setEmail2(e.target.value)} />
              </Field>
              <Field label="WhatsApp">
                <Input
                  type="text"
                  inputMode="tel"
                  placeholder="WhatsApp"
                  value={whatsapp2}
                  onChange={(e) => setWhatsapp2(e.target.value)}
                />
              </Field>
            </div>
            <p className="pd-help">Se necesita al menos email o WhatsApp del compañero para enviar la invitación</p>

            {categorias.length > 1 && (
              <Field as="div" label="Categoría" help={unSoloGenero ? `Categorías ${categorias[0].genero}` : undefined}>
                {unSoloGenero ? (
                  <CategorySelect
                    aria-label="Categoría"
                    opciones={categorias.map((c) => c.nivel)}
                    value={categoriaElegida?.nivel || ""}
                    onChange={(nivel) => setCategoriaInsc(categorias.find((c) => c.nivel === nivel)?.id || "")}
                  />
                ) : (
                  <Pills
                    ariaLabel="Categoría"
                    items={categorias.map((c) => ({ value: c.id, label: etiquetaConMarca(c.nivel, c.label) }))}
                    value={categoriaInsc}
                    onChange={setCategoriaInsc}
                  />
                )}
              </Field>
            )}
            {categorias.length === 1 && (
              <p className="body-sm text-ink-2 inline-flex items-center gap-2">
                Categoría:
                <MarcaCategoria cat={categorias[0].nivel} size={20} />
                <strong>{categorias[0].label}</strong>
              </p>
            )}

            {apellido1.trim() && apellido2.trim() && (
              <p className="body-sm text-ink-2">
                Nombre de pareja:{" "}
                <strong>
                  {apellido1.trim()}-{apellido2.trim()}
                </strong>
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setMostrarFormInsc(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex-1"
                cargando={enviando ? "Enviando…" : ""}
                disabled={
                  !apellido1.trim() ||
                  !apellido2.trim() ||
                  (!email2.trim() && !whatsapp2.trim()) ||
                  (categorias.length > 1 && !categoriaInsc)
                }
              >
                Enviar solicitud
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tabs */}
      <Tabs items={tabsItems} value={tab} onChange={setTab} ariaLabel="Secciones del torneo" />

      {/* Info */}
      {tab === "Info" && (
        <div className="grid gap-4">
          <Card>
            <Card.Title as="h2">Detalles</Card.Title>
            <dl className="grid gap-3 sm:grid-cols-2 mt-3">
              {sedeEsClub && (
                <div className="sm:col-span-2">
                  <dt className="pd-eyebrow">Sede</dt>
                  <dd className="body-md">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {linkClubSede}
                      {direccionSede && (
                        <span className="inline-flex items-center gap-2 text-ink-2">
                          <MapPin className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                          {direccionSede}
                        </span>
                      )}
                    </span>
                    {canchasSede.length > 0 && (
                      <span className="flex flex-wrap gap-2 mt-2">
                        {canchasSede.map((c) => (
                          <Badge key={c.id}>{c.nombre}</Badge>
                        ))}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt className="pd-eyebrow">Formato</dt>
                <dd className="body-md">{formatoLabel[torneo.formato]}</dd>
              </div>
              <div>
                <dt className="pd-eyebrow">Género</dt>
                <dd className="body-md capitalize">
                  {Array.isArray(torneo.categoriaGenero) ? torneo.categoriaGenero.join(", ") : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="pd-eyebrow">Categorías</dt>
                <dd className="body-md">
                  {categorias.length > 0 ? (
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {categorias.map((c) => (
                        <span key={c.id}>{etiquetaConMarca(c.nivel, c.label)}</span>
                      ))}
                    </span>
                  ) : (
                    "—"
                  )}
                  {categoriaJugador && (
                    <span className="body-sm text-ink-2 flex items-center gap-2 mt-2">
                      Tu categoría:
                      <MarcaCategoria cat={categoriaJugador} size={20} />
                      <strong className="text-lime-text">{categoriaJugador}</strong>
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="pd-eyebrow">Máx. parejas</dt>
                <dd className="body-md pd-tnum">{torneo.maxParejas}</dd>
              </div>
              <div>
                <dt className="pd-eyebrow">Inscripción</dt>
                <dd className="body-md pd-tnum">{torneo.inscripcion > 0 ? formatPrecio(torneo.inscripcion) : "Gratuita"}</dd>
              </div>
              <div>
                <dt className="pd-eyebrow">Fechas</dt>
                <dd className="body-md pd-tnum">
                  {formatFecha(torneo.fechaInicio)} → {formatFecha(torneo.fechaFin)}
                </dd>
              </div>
            </dl>

            {!sedeEsClub && torneo.direccionSede && (
              <div className="mt-3 pt-3 border-t border-line">
                <p className="pd-eyebrow">Dirección</p>
                <p className="body-md flex items-center gap-2 mt-0.5">
                  <MapPin className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                  {torneo.direccionSede}
                </p>
              </div>
            )}

            {torneo.descripcion && (
              <div className="mt-3 pt-3 border-t border-line">
                <p className="pd-eyebrow mb-1!">Descripción</p>
                <p className="body-md">{torneo.descripcion}</p>
              </div>
            )}

            {torneo.reglamento && (
              <div className="mt-3 pt-3 border-t border-line">
                <p className="pd-eyebrow mb-1!">Reglamento</p>
                <p className="body-md whitespace-pre-line">{torneo.reglamento}</p>
              </div>
            )}

            {(torneo.instagramOrganizador || torneo.whatsappOrganizador) && (
              <div className="mt-3 pt-3 border-t border-line">
                <p className="pd-eyebrow mb-1!">Contacto</p>
                {torneo.instagramOrganizador && (
                  <p className="body-md flex items-center gap-2">
                    <AtSign className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                    {torneo.instagramOrganizador}
                  </p>
                )}
                {torneo.whatsappOrganizador && (
                  <p className="body-md flex items-center gap-2 pd-tnum">
                    <MessageCircle className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                    {torneo.whatsappOrganizador}
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Premios */}
          {torneo.premios && (
            <Card>
              <Card.Title as="h2" className="flex items-center gap-2">
                <Trophy className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                Premios
              </Card.Title>
              <p className="body-md text-ink-2 whitespace-pre-line mt-2">{torneo.premios}</p>
            </Card>
          )}

          {/* Inscripción incluye */}
          {torneo.inscripcionIncluye && (
            <Card>
              <Card.Title as="h2" className="flex items-center gap-2">
                <ClipboardList className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                La inscripción incluye
              </Card.Title>
              <p className="body-md text-ink-2 whitespace-pre-line mt-2">{torneo.inscripcionIncluye}</p>
            </Card>
          )}

          {/* Administradores/Contacto */}
          {torneo.administradores &&
            torneo.administradores.length > 0 &&
            torneo.administradores[0].nombre && (
              <Card>
                <Card.Title as="h2" className="flex items-center gap-2">
                  <Phone className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                  Contacto del torneo
                </Card.Title>
                <div className="grid gap-2 mt-3">
                  {torneo.administradores
                    .filter((a) => a.nombre)
                    .map((admin, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 rounded-md bg-surface-sunken px-4 py-3">
                        <span className="body-md font-medium!">{admin.nombre}</span>
                        {admin.whatsapp && (
                          <a
                            href={`https://wa.me/${admin.whatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pd-btn pd-btn-sm pd-tnum"
                          >
                            <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
                            {admin.whatsapp}
                          </a>
                        )}
                      </div>
                    ))}
                </div>
              </Card>
            )}

          {/* Compartir */}
          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1"
              icon={<Copy className="pd-icon" size={20} aria-hidden="true" />}
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/torneos/${id}`,
                );
                toast.success("Link copiado");
              }}
            >
              Copiar link
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`🏆 ${torneo.nombre}\n📍 ${sede.nombre} - ${sede.ciudad}\n📅 ${formatFecha(torneo.fechaInicio)} → ${formatFecha(torneo.fechaFin)}\n${torneo.inscripcion > 0 ? `💰 ${formatPrecio(torneo.inscripcion)}` : "🆓 Gratis"}\n\n${window.location.origin}/torneos/${id}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pd-btn flex-1"
            >
              <Share className="pd-icon" size={20} aria-hidden="true" />
              Compartir
            </a>
          </div>
        </div>
      )}

      {/* Parejas */}
      {tab === "Parejas" && (
        <Card>
          <Card.Title as="h2">
            Parejas inscriptas{" "}
            <span className="text-ink-3 pd-tnum">
              {parejas.length} / {torneo.maxParejas}
            </span>
          </Card.Title>
          {parejas.length === 0 ? (
            <p className="body-sm text-ink-2 text-center py-6">Todavía no hay parejas inscriptas.</p>
          ) : (() => {
            const renderPareja = (p, index) => {
              const cat = categorias.find((c) => c.id === p.categoria);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-md bg-surface-sunken px-4 py-3">
                  <span className="caption text-ink-3 pd-tnum w-6">{index + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="heading-sm">{p.nombrePareja || `${p.jugador1} / ${p.jugador2}`}</p>
                      {cat && <span className="caption text-ink-3">{etiquetaConMarca(cat.nivel, cat.label)}</span>}
                    </div>
                    <p className="body-sm text-ink-2">
                      {p.jugador1} — {p.jugador2}
                    </p>
                  </div>
                </div>
              );
            };

            // Con un solo cuadro: lista plana. Con varios: una sección por cuadro y "Sin categoría" al final.
            if (!variosCuadros) {
              return <div className="grid gap-2 mt-3">{parejas.map(renderPareja)}</div>;
            }

            const sinCuadro = parejasSinCuadro(parejas, torneo);
            const secciones = [
              ...cuadros.map((c) => ({
                id: c.id,
                label: c.label,
                lista: parejasDeCuadro(parejas, c.id, torneo),
              })),
              ...(sinCuadro.length > 0
                ? [{ id: "sin-cuadro", label: "Sin categoría", lista: sinCuadro }]
                : []),
            ];

            return (
              <div className="grid gap-4 mt-3">
                {secciones.map((s) => (
                  <section key={s.id}>
                    <h3 className="heading-sm mb-2">
                      {s.label} <span className="text-ink-3 font-medium pd-tnum">{textoParejas(s.lista.length)}</span>
                    </h3>
                    {s.lista.length === 0 ? (
                      <p className="body-sm text-ink-3 rounded-md bg-surface-sunken px-4 py-3">Sin parejas inscriptas todavía</p>
                    ) : (
                      <div className="grid gap-2">{s.lista.map(renderPareja)}</div>
                    )}
                  </section>
                ))}
              </div>
            );
          })()}
        </Card>
      )}

      {/* Grupos */}
      {tab === "Grupos" && (
        <div className="grid gap-4">
          {torneo.status === "en_curso" && torneo.habilitarReclamos && (
            <Card className="flex items-start gap-3">
              <AlertTriangle className="pd-icon text-warning mt-0.5" size={20} aria-hidden="true" />
              <div className="grid gap-2 min-w-0">
                <p className="body-sm text-ink-2">
                  Este torneo tiene habilitado el <strong>sistema de reclamos</strong>. Si estás vinculado a una pareja, podés
                  abrir un reclamo contra tu rival desde cada partido.
                </p>
                {!mostrarInfoReclamos && (
                  <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setMostrarInfoReclamos(true)}>
                    Más info
                  </Button>
                )}
                {mostrarInfoReclamos && (
                  <>
                    <ul className="body-sm text-ink-2 list-disc pl-5 grid gap-1">
                      <li>
                        Tocá <strong>"Abrir reclamo"</strong> debajo de tu partido para denunciar a la pareja rival.
                      </li>
                      <li>Motivos: categoría incorrecta o conducta antideportiva.</li>
                      <li>Otras parejas del torneo pueden unirse al reclamo.</li>
                      <li>La pareja denunciada puede dejar un descargo.</li>
                      <li>El organizador toma la decisión final: desestimar o descalificar.</li>
                      <li>Plazo para adherirse: {torneo.plazoReclamosMinutos || 30} minutos después de abierto el reclamo.</li>
                    </ul>
                    <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setMostrarInfoReclamos(false)}>
                      Cerrar
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )}

          {gruposDelCuadro.length === 0 ? (
            <Card className="text-center py-10!">
              <p className="body-md text-ink-2">Los grupos todavía no fueron generados.</p>
            </Card>
          ) : (
            gruposDelCuadro.map((grupo, gi) => {
              const partidos = grupo.partidos || [];
              const hayResultados = partidos.some((p) => p.resultado);
              return (
                <section key={grupo.id || gi} className="grid gap-3">
                  {/* Tabla de posiciones */}
                  {hayResultados ? (
                    <Standings
                      grupo={grupo.nombre}
                      cuadroLabel={labelCuadroActual}
                      columnas="completa"
                      rows={calcularTabla(grupo).map((row, ri) => ({ ...row, clasifica: ri < avanzan }))}
                      help={`Clasifican las primeras ${avanzan} de cada grupo.`}
                    />
                  ) : (
                    /* Lista de parejas (todavía sin resultados) */
                    <Card>
                      <Card.Row>
                        <Card.Title as="h2">{grupo.nombre}</Card.Title>
                        {labelCuadroActual && <Badge tone="court">{labelCuadroActual}</Badge>}
                      </Card.Row>
                      <div className="grid gap-1 mt-3">
                        {grupo.parejas.map((p, pi) => (
                          <div key={pi} className="body-md rounded-sm bg-surface-sunken px-3 py-2">
                            {getNombrePareja(p)}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Partidos */}
                  {partidos.length > 0 && (
                    <div>
                      <p className="pd-eyebrow mb-2!">Partidos</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        {partidos.map((p, pi) => {
                          const esPartidoMio =
                            miPareja &&
                            (p.pareja1.id === miPareja.id ||
                              p.pareja2.id === miPareja.id);
                          const parejaDenunciada = esPartidoMio
                            ? p.pareja1.id === miPareja.id
                              ? p.pareja2
                              : p.pareja1
                            : null;
                          const yaReclamo = reclamos.some(
                            (r) =>
                              r.parejaDenunciante?.id === miPareja?.id &&
                              r.parejaDenunciada?.id === parejaDenunciada?.id,
                          );
                          const partidoKey = `${gi}-${pi}`;

                          return (
                            <div key={pi} className="grid gap-2 content-start">
                              {tarjetaPartido(p, grupo.nombre)}

                              {/* Botón de reclamo */}
                              {esPartidoMio &&
                                torneo.status === "en_curso" &&
                                torneo.habilitarReclamos &&
                                !yaReclamo && (
                                  <div>
                                    {mostrarFormReclamo === partidoKey ? (
                                      <div className="grid gap-3 rounded-md border border-line p-4">
                                        <p className="heading-sm">Reclamo contra {getNombrePareja(parejaDenunciada)}</p>
                                        <Field label="Motivo">
                                          <Select value={motivoReclamo} onChange={(e) => setMotivoReclamo(e.target.value)}>
                                            <option value="categoria_incorrecta">Categoría incorrecta</option>
                                            <option value="conducta_antideportiva">Conducta antideportiva</option>
                                          </Select>
                                        </Field>
                                        <Field label="Comentario (opcional)">
                                          <Textarea
                                            value={comentarioReclamo}
                                            onChange={(e) => setComentarioReclamo(e.target.value)}
                                            placeholder="Comentario (opcional)"
                                            rows={2}
                                          />
                                        </Field>
                                        <div className="flex gap-2">
                                          <Button variant="ghost" size="sm" className="flex-1" onClick={() => setMostrarFormReclamo(null)}>
                                            Cancelar
                                          </Button>
                                          <Button
                                            variant="danger"
                                            size="sm"
                                            className="flex-1"
                                            cargando={enviandoReclamo ? "Enviando…" : ""}
                                            onClick={() => handleReclamo(p, grupo.nombre, grupo)}
                                          >
                                            Enviar reclamo
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={<AlertTriangle className="pd-icon" size={20} aria-hidden="true" />}
                                        onClick={() => setMostrarFormReclamo(partidoKey)}
                                      >
                                        Abrir reclamo
                                      </Button>
                                    )}
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                      {user && !miPareja && torneo.status === "en_curso" && torneo.habilitarReclamos && (
                        <p className="pd-help mt-2">Para abrir reclamos necesitás estar vinculado a una pareja</p>
                      )}
                    </div>
                  )}
                </section>
              );
            })
          )}

          {/* Reclamos abiertos visibles para todos */}
          {reclamosAbiertos.length > 0 && (
            <section className="grid gap-3">
              <h2 className="heading-lg">
                Reclamos abiertos <span className="text-ink-3 pd-tnum">{reclamosAbiertos.length}</span>
              </h2>
              {reclamosAbiertos.map((r) => {
                const yaAdherido =
                  miPareja &&
                  (r.adheridos || []).some((a) => a.id === miPareja?.id);
                const esDenunciante =
                  miPareja && r.parejaDenunciante?.id === miPareja?.id;
                const esDenunciado =
                  miPareja && r.parejaDenunciada?.id === miPareja?.id;

                return (
                  <Card key={r.id} className="grid gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone="warning" dot>
                          Abierto
                        </Badge>
                        <Badge>{motivoLabel[r.motivo] || "Conducta antideportiva"}</Badge>
                      </div>
                      <span className="caption text-ink-3 pd-tnum">
                        {(r.adheridos || []).length} adherido
                        {(r.adheridos || []).length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="body-md">
                      {getNombrePareja(r.parejaDenunciante)} <span className="text-ink-3">→</span>{" "}
                      {getNombrePareja(r.parejaDenunciada)}
                    </p>
                    {r.comentario && <p className="body-sm text-ink-2">{r.comentario}</p>}

                    {/* Adherirse */}
                    {miPareja &&
                      !esDenunciante &&
                      !esDenunciado &&
                      !yaAdherido && (
                        <Button size="sm" className="justify-self-start" onClick={() => handleAdherirse(r.id)}>
                          Unirme al reclamo
                        </Button>
                      )}
                    {yaAdherido && (
                      <p className="body-sm text-ink-2 flex items-center gap-2">
                        <Check className="pd-icon text-success" size={20} aria-hidden="true" />
                        Ya te adheriste a este reclamo
                      </p>
                    )}

                    {/* Descargo */}
                    {esDenunciado && !r.descargo && (
                      <div className="grid gap-2">
                        <Field label="Tu descargo">
                          <Textarea
                            value={descargoTexto}
                            onChange={(e) => setDescargoTexto(e.target.value)}
                            placeholder="Escribí tu descargo..."
                            rows={2}
                          />
                        </Field>
                        <Button size="sm" className="justify-self-start" onClick={() => handleDescargo(r.id)}>
                          Enviar descargo
                        </Button>
                      </div>
                    )}
                    {esDenunciado && r.descargo && (
                      <p className="body-sm text-ink-2">
                        <strong>Descargo enviado:</strong> {r.descargo}
                      </p>
                    )}
                  </Card>
                );
              })}
            </section>
          )}
        </div>
      )}

      {/* Liga */}
      {tab === "Liga" && (
        <div className="grid gap-4">
          {gruposDelCuadro.length === 0 ? (
            <Card className="text-center py-10!">
              <p className="body-md text-ink-2">El fixture todavía no fue generado.</p>
            </Card>
          ) : (() => {
            const grupo =
              gruposDelCuadro.find((g) => g.nombre === "Liga") || gruposDelCuadro[0];
            const tabla = calcularTabla(grupo);
            const partidos = grupo.partidos || [];
            const fechasMap = {};
            partidos.forEach((p) => { const f = p.fecha || 1; if (!fechasMap[f]) fechasMap[f] = []; fechasMap[f].push(p); });
            const fechasOrdenadas = Object.entries(fechasMap).sort(([a], [b]) => Number(a) - Number(b));

            return (
              <>
                {torneo.status === "en_curso" && torneo.habilitarReclamos && (
                  <Card className="flex items-start gap-3">
                    <AlertTriangle className="pd-icon text-warning mt-0.5" size={20} aria-hidden="true" />
                    <p className="body-sm text-ink-2">
                      Este torneo tiene habilitado el <strong>sistema de reclamos</strong>.
                    </p>
                  </Card>
                )}

                {partidos.some((p) => p.resultado) ? (
                  <Standings
                    grupo="Tabla de posiciones"
                    cuadroLabel={labelCuadroActual}
                    columnas="completa"
                    rows={tabla.map((row, ri) => ({ ...row, clasifica: ri === 0 }))}
                  />
                ) : (
                  <Card>
                    <Card.Row>
                      <Card.Title as="h2">Tabla de posiciones</Card.Title>
                      {labelCuadroActual && <Badge tone="court">{labelCuadroActual}</Badge>}
                    </Card.Row>
                    <p className="body-sm text-ink-2 text-center py-6">La tabla se actualiza cuando se cargan resultados.</p>
                  </Card>
                )}

                {fechasOrdenadas.map(([fecha, matches]) => (
                  <section key={fecha} className="grid gap-3">
                    <h2 className="heading-lg">Fecha {fecha}</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      {matches.map((p, pi) => (
                        <div key={pi}>{tarjetaPartido(p, `Fecha ${fecha}`)}</div>
                      ))}
                    </div>
                  </section>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* Bracket */}
      {tab === "Bracket" && (
        <div className="grid gap-4">
          {!rondas ? (
            <Card className="text-center py-10!">
              <p className="body-md text-ink-2">El cuadro todavía no fue generado.</p>
            </Card>
          ) : (
            <>
            {/* Campeones */}
            {(() => {
              const finalMatch = rondas[rondas.length - 1]?.[0];
              if (!finalMatch?.resultado || !finalMatch?.pareja1 || !finalMatch?.pareja2) return null;
              const g = getGanador(finalMatch.resultado);
              const campeon = g === 1 ? finalMatch.pareja1 : finalMatch.pareja2;
              const subcampeon = g === 1 ? finalMatch.pareja2 : finalMatch.pareja1;
              return (
                <ChampionCard
                  className="mx-auto"
                  cuadroLabel={labelCuadroActual}
                  campeones={getNombrePareja(campeon)}
                  subcampeones={getNombrePareja(subcampeon)}
                  torneo={torneo.nombre}
                  club={sede.nombre}
                  fecha={formatFecha(torneo.fechaFin)}
                />
              );
            })()}
            {rondas.map((ronda, ri) => {
              const nombre = nombreRonda(rondas.length, ri);
              return (
                <section key={ri} className="grid gap-3">
                  <h2 className="heading-lg">{nombre}</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {ronda.map((p, pi) => (
                      <div key={pi}>
                        {tarjetaPartido(p, nombre, { variant: variantDeRonda(rondas.length, ri, p) })}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
