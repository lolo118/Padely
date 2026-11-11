import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getInicioReservasJugador } from "../services/canchaService";
import { getTorneosYMisInscripciones } from "../services/torneoService";
import { escucharCuentasDondeParticipo, escucharMisCuentasAbiertas } from "../services/cuentasService";
import { escucharMisPedidos } from "../services/pedidosService";
import { getMisMembresias } from "../services/membresiasService";
import { cargarFlags } from "../services/flagsService";
import { getTodayLocal } from "../utils/formatDate";
import { esJugadorNuevo, pendientesDeInicio, saludoPorHora, torneosParaInscribirse } from "../utils/inicio";
import { Card, RankMark } from "../components/ui";
import PartidosAbiertos from "../components/PartidosAbiertos";
import ProximaReserva from "../components/inicio/ProximaReserva";
import Pendientes from "../components/inicio/Pendientes";
import ReservarDeNuevo from "../components/inicio/ReservarDeNuevo";
import PasesInicio from "../components/inicio/PasesInicio";
import TorneosInicio from "../components/inicio/TorneosInicio";
import BuscarClub from "../components/inicio/BuscarClub";
import Bienvenida from "../components/inicio/Bienvenida";

// Inicio del jugador: lo que quiere hacer en cinco segundos. Arriba la próxima reserva (o "Reservar cancha"), lo que
// tiene pendiente, reservar de nuevo en sus clubes, su Pase, sus torneos y el buscador; los números van al final.
// Lecturas: sus reservas (1 consulta + los clubes que se muestran), torneos abiertos con sus inscripciones, sus
// cuentas abiertas (titular y participante) y sus pedidos (escuchas), y sus Pases si flags.membresias.
const vacio = { total: 0, proximas: [], clubes: {}, habituales: [] };

export default function Inicio() {
  const { user, perfil } = useAuthStore();
  const uid = user?.uid || null;
  const [hoy] = useState(() => getTodayLocal());
  const [reservas, setReservas] = useState(null);
  const [torneos, setTorneos] = useState(null);
  const [cuentasTitular, setCuentasTitular] = useState([]);
  const [cuentasParticipo, setCuentasParticipo] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [flags, setFlags] = useState({});
  const [socios, setSocios] = useState(null); // null: sin leer (o flags.membresias apagado)

  // Favoritos del perfil (users/{uid}.favoritos): completan "Reservar de nuevo" si hay lugar
  const favoritosClave = (perfil?.favoritos || []).join(",");

  useEffect(() => {
    let vivo = true;
    cargarFlags().then((f) => vivo && setFlags(f || {}));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!uid) return undefined;
    let vivo = true;
    const favoritos = favoritosClave ? favoritosClave.split(",") : [];
    getInicioReservasJugador(uid, { favoritos })
      .then((r) => vivo && setReservas(r))
      .catch((err) => {
        console.error("Error cargando las reservas del inicio:", err);
        if (vivo) setReservas(vacio);
      });
    return () => {
      vivo = false;
    };
  }, [uid, favoritosClave]);

  useEffect(() => {
    if (!uid) return undefined;
    let vivo = true;
    getTorneosYMisInscripciones(uid)
      .then((t) => vivo && setTorneos(t))
      .catch((err) => {
        console.error("Error cargando los torneos del inicio:", err);
        if (vivo) setTorneos({ abiertos: [], inscripciones: [] });
      });
    return () => {
      vivo = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;
    const corteTitular = escucharMisCuentasAbiertas(uid, setCuentasTitular, (err) => console.error("Error escuchando mis cuentas:", err));
    const corteParticipo = escucharCuentasDondeParticipo(uid, setCuentasParticipo, (err) => console.error("Error escuchando los turnos donde participo:", err));
    const cortePedidos = escucharMisPedidos(uid, setPedidos, (err) => console.error("Error escuchando mis pedidos:", err));
    return () => {
      corteTitular();
      corteParticipo();
      cortePedidos();
    };
  }, [uid]);

  // Pases (P3-16): solo con flags.membresias
  useEffect(() => {
    if (!uid || flags.membresias !== true) return undefined;
    let vivo = true;
    getMisMembresias(uid).then((l) => vivo && setSocios(l || []));
    return () => {
      vivo = false;
    };
  }, [uid, flags.membresias]);

  const datos = reservas || vacio;
  const proxima = datos.proximas[0] || null;
  const claveProxima = proxima ? `${proxima.clubId}/${proxima.grupoId || proxima.id}` : null;
  const cuentaProxima = proxima ? cuentasTitular.find((c) => `${c.clubId}/${c.id}` === claveProxima) || cuentasParticipo.find((c) => `${c.clubId}/${c.id}` === claveProxima) || null : null;
  const pedidosProxima = proxima ? pedidos.filter((p) => `${p.clubId}/${p.cuentaId}` === claveProxima) : [];
  const inscripciones = useMemo(() => torneos?.inscripciones || [], [torneos]);
  const cuentas = useMemo(() => [...cuentasTitular, ...cuentasParticipo], [cuentasTitular, cuentasParticipo]);
  const pendientes = useMemo(() => pendientesDeInicio({ uid, proximas: datos.proximas, cuentas, inscripciones, excluir: claveProxima }), [uid, datos.proximas, cuentas, inscripciones, claveProxima]);
  const nombresClub = useMemo(() => Object.fromEntries(Object.entries(datos.clubes).map(([id, c]) => [id, c?.nombre || ""])), [datos.clubes]);

  const nombre = perfil?.nombre || user?.email?.split("@")[0] || "Jugador";
  const saludo = saludoPorHora(new Date().getHours());
  const encabezado = (
    <header>
      <p className="pd-eyebrow">{saludo}</p>
      <h1 className="heading-lg m-0 truncate">{nombre}</h1>
    </header>
  );

  if (!reservas || !torneos || (flags.membresias === true && socios === null)) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {encabezado}
        <p className="sr-only">Cargando inicio…</p>
        <div className="pd-skeleton h-44 rounded-lg!" />
        <div className="pd-skeleton h-24 rounded-lg!" />
        <div className="pd-skeleton h-24 rounded-lg!" />
      </div>
    );
  }

  // La categoría (nivel) la asigna el sistema de puntos, no cuenta como dato faltante
  const perfilIncompleto = !!perfil && (!perfil.telefono || !perfil.genero);
  const confirmadas = inscripciones.filter((i) => i.status === "confirmada");
  const abiertos = torneosParaInscribirse(torneos.abiertos, inscripciones, { hoy, max: confirmadas.length ? 2 : 3 });
  const nuevo = esJugadorNuevo({ reservas: datos.total, cuentas: cuentas.length, pases: socios?.length || 0, inscripciones: inscripciones.length });
  const conNumeros = !!perfil && ((Number(perfil.puntos) || 0) > 0 || (Number(perfil.torneosJugados) || 0) > 0 || !!perfil.nivel);
  const partidos = flags.partidosAbiertos === true && <PartidosAbiertos ciudad={perfil?.ciudad || ""} titulo="Partidos que buscan jugadores" max={3} />;

  if (nuevo) {
    return (
      <div className="flex flex-col gap-6">
        {encabezado}
        <Bienvenida perfilIncompleto={perfilIncompleto} />
        <BuscarClub />
        <TorneosInicio abiertos={abiertos} />
        {partidos}
        <LinksChicos />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {encabezado}

      <ProximaReserva reserva={proxima} club={proxima ? datos.clubes[proxima.clubId] : null} cuenta={cuentaProxima} pedidos={pedidosProxima} hoy={hoy} uid={uid} otras={Math.max(0, datos.proximas.length - 1)} />

      <Pendientes items={pendientes} hoy={hoy} nombresClub={nombresClub} />

      {perfilIncompleto && (
        <Link to="/perfil" className="pd-card pd-card-hover p-3! flex items-center gap-3">
          <TriangleAlert className="pd-icon text-warning shrink-0" size={20} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="heading-sm block">Completá tu perfil</span>
            <span className="body-sm text-ink-2 block">Teléfono y género, para inscribirte a torneos</span>
          </span>
          <ChevronRight className="pd-icon text-ink-3 shrink-0" size={16} aria-hidden="true" />
        </Link>
      )}

      <ReservarDeNuevo clubes={datos.habituales} hoy={hoy} />

      {flags.membresias === true && <PasesInicio socios={socios} />}

      <TorneosInicio inscripciones={confirmadas} abiertos={abiertos} />

      {partidos}

      <BuscarClub />

      {conNumeros && <Numeros perfil={perfil} />}

      <LinksChicos />
    </div>
  );
}

// Puntos, categoría y torneos jugados: secundarios, en una fila chica que lleva al perfil
function Numeros({ perfil }) {
  return (
    <Card as={Link} to="/perfil" variant="hover" className="p-3! grid grid-cols-3 gap-2 text-center">
      <span className="flex flex-col items-center">
        <span className="numeral-md pd-tnum">{perfil.puntos || 0}</span>
        <span className="caption text-ink-3">Puntos</span>
      </span>
      <span className="flex flex-col items-center">
        <span className="flex items-center gap-1">
          <RankMark nivel={perfil.nivel} size={20} />
          <span className="numeral-md">{perfil.nivel || "—"}</span>
        </span>
        <span className="caption text-ink-3">Categoría</span>
      </span>
      <span className="flex flex-col items-center">
        <span className="numeral-md pd-tnum">{perfil.torneosJugados || 0}</span>
        <span className="caption text-ink-3">Torneos</span>
      </span>
    </Card>
  );
}

// Lo que no entra en las secciones: links chicos (la Tienda y Noticias viven también en el menú)
function LinksChicos() {
  return (
    <nav aria-label="Más" className="flex flex-wrap justify-center gap-x-4 gap-y-2 body-sm">
      <Link to="/mis-reservas" className="text-ink-2 underline">
        Mis reservas
      </Link>
      <Link to="/marketplace" className="text-ink-2 underline">
        Tienda
      </Link>
      <Link to="/noticias" className="text-ink-2 underline">
        Noticias
      </Link>
    </nav>
  );
}
