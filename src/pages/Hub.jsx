import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleDot, MapPin, Star } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  getClubesConCanchas,
  getReservas,
  getTurnosFijos,
} from "../services/canchaService";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getTodayLocal, addDaysLocal, horaActualStr } from "../utils/formatDate";
import { formatPrecio } from "../utils/format";
import { Badge, Button, Card, Field, Input, Pills, SearchInput, Select } from "../components/ui";

// Horas del filtro de rango: de 07:00 a 23:00
const HORAS = Array.from({ length: 17 }, (_, i) => i + 7);
const hh = (h) => `${h.toString().padStart(2, "0")}:00`;

const PILLS_COBERTURA = [
  { value: "", label: "Todas" },
  { value: "techada", label: "Techada" },
  { value: "airelibre", label: "Aire libre" },
];

export default function Hub() {
  const { user } = useAuthStore();
  const [clubes, setClubes] = useState([]);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(getTodayLocal());
  const [reservasPorClub, setReservasPorClub] = useState({});
  const [turnosFijosPorClub, setTurnosFijosPorClub] = useState({});
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroSuperficie, setFiltroSuperficie] = useState("");
  const [filtroTechada, setFiltroTechada] = useState("");
  const [favoritos, setFavoritos] = useState([]);
  const [ciudadJugador, setCiudadJugador] = useState("");
  const [verTodasCiudades, setVerTodasCiudades] = useState(false);
  const [horaDesde, setHoraDesde] = useState("");
  const [horaHasta, setHoraHasta] = useState("");

  useEffect(() => {
    const cargarFavoritos = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setFavoritos(snap.data().favoritos || []);
      } catch (err) { console.error(err); }
    };
    cargarFavoritos();
  }, [user]);

  useEffect(() => {
    const cargarCiudad = async () => {
      if (!user) return;
      try {
        const { getUserData } = await import("../services/authService");
        const userData = await getUserData(user.uid);
        if (userData?.ciudad) setCiudadJugador(userData.ciudad);
        else if (userData?.provincia) setCiudadJugador(userData.provincia);
      } catch (err) { console.error("Error cargando ciudad:", err); }
    };
    cargarCiudad();
  }, [user]);

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      try {
        const data = await getClubesConCanchas();
        setClubes(data);
        const reservasMap = {};
        const turnosMap = {};
        // Sin sesión no se leen reservas ni turnos fijos (no son públicos): no hay disponibilidad para mostrar
        if (user) {
          for (const club of data) {
            try {
              const [reservas, tf] = await Promise.all([
                getReservas(club.id, fechaSeleccionada),
                getTurnosFijos(club.id),
              ]);
              reservasMap[club.id] = reservas;
              turnosMap[club.id] = tf;
            } catch {
              reservasMap[club.id] = [];
              turnosMap[club.id] = [];
            }
          }
        }
        setReservasPorClub(reservasMap);
        setTurnosFijosPorClub(turnosMap);
      } catch (err) {
        console.error("Error al cargar clubes:", err);
      }
      setCargando(false);
    };
    cargar();
  }, [fechaSeleccionada, user]);

  const estaOcupado = (clubId, canchaId, hora) => {
    const reservas = reservasPorClub[clubId] || [];
    return reservas.some(
      (r) => r.canchaId === canchaId && r.hora === hora && r.status !== "cancelada"
    );
  };

  const esTurnoFijoHub = (clubId, canchaId, hora) => {
    const partes = fechaSeleccionada.split("-");
    const hoy = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    const diasMap = { 0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
    const diaHoy = diasMap[hoy.getDay()];
    const turnos = turnosFijosPorClub[clubId] || [];
    return turnos.some(
      (t) => t.canchaId === canchaId && t.dia === diaHoy && (t.horas || [t.hora]).includes(hora) && t.status === "activo"
    );
  };

  // Ventana de reserva: desde hoy hasta 30 días
  const fechaMin = getTodayLocal();
  const fechaMax = addDaysLocal(fechaMin, 30);
  const cambiarFecha = (valor) => {
    if (!valor) return;
    if (valor < fechaMin) return setFechaSeleccionada(fechaMin);
    if (valor > fechaMax) return setFechaSeleccionada(fechaMax);
    setFechaSeleccionada(valor);
  };

  const getInfoClub = (club) => {
    // Si es hoy, una hora que ya empezó no se puede reservar
    const esHoy = fechaSeleccionada === getTodayLocal();
    const horaAhora = horaActualStr();
    let libres = 0;
    let libresEnRango = 0;
    let precioMin = Infinity;
    const canchasInfo = [];
    const superficies = new Set();
    let tieneTechada = false;
    let tieneAireLibre = false;

    (club.canchas || []).forEach((cancha) => {
      superficies.add(cancha.superficie);
      if (cancha.techada) tieneTechada = true;
      else tieneAireLibre = true;

      let canchaLibres = 0;
      let canchaLibresEnRango = 0;
      const horasLibres = [];
      (cancha.horariosDisponibles || []).forEach((hora) => {
        if (!user) {
          // Sin sesión: solo el precio mínimo; la disponibilidad se ve al iniciar sesión
          const precio = (cancha.horarios || {})[hora] ?? cancha.precioBase ?? 0;
          if (precio < precioMin) precioMin = precio;
          return;
        }
        if (esHoy && hora <= horaAhora) return;
        if (!estaOcupado(club.id, cancha.id, hora) && !esTurnoFijoHub(club.id, cancha.id, hora)) {
          canchaLibres++;
          libres++;
          horasLibres.push(hora);
          const precio = (cancha.horarios || {})[hora] ?? cancha.precioBase ?? 0;
          if (precio < precioMin) precioMin = precio;
          if (horaDesde && horaHasta && hora >= horaDesde && hora < horaHasta) {
            canchaLibresEnRango++;
            libresEnRango++;
          }
        }
      });
      canchasInfo.push({ ...cancha, canchaLibres, canchaLibresEnRango, horasLibres });
    });

    return { libres, libresEnRango, precioMin: precioMin === Infinity ? 0 : precioMin, canchasInfo, superficies: [...superficies], tieneTechada, tieneAireLibre };
  };

  const toggleFavorito = async (clubId) => {
    if (!user) return;
    const nuevo = favoritos.includes(clubId)
      ? favoritos.filter((id) => id !== clubId)
      : [...favoritos, clubId];
    setFavoritos(nuevo);
    try {
      await updateDoc(doc(db, "users", user.uid), { favoritos: nuevo });
    } catch (err) {
      console.error("Error al actualizar favoritos:", err);
    }
  };

  // Filtrar clubes
  let clubesFiltrados = clubes;

  if (ciudadJugador && !verTodasCiudades) {
    clubesFiltrados = clubesFiltrados.filter((club) =>
      (club.ciudad || "").toLowerCase().includes(ciudadJugador.toLowerCase())
    );
  }

  if (busqueda.trim()) {
    clubesFiltrados = clubesFiltrados.filter((club) =>
      club.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (club.ciudad || "").toLowerCase().includes(busqueda.toLowerCase()) ||
      (club.direccion || "").toLowerCase().includes(busqueda.toLowerCase())
    );
  }

  if (filtroSuperficie) {
    clubesFiltrados = clubesFiltrados.filter((club) =>
      (club.canchas || []).some((c) => c.superficie === filtroSuperficie)
    );
  }

  if (filtroTechada) {
    clubesFiltrados = clubesFiltrados.filter((club) =>
      (club.canchas || []).some((c) =>
        filtroTechada === "techada" ? c.techada : !c.techada
      )
    );
  }

  let clubesConInfo = clubesFiltrados.map((club) => ({
    ...club,
    ...getInfoClub(club),
    esFavorito: favoritos.includes(club.id),
  }));

  if (horaDesde && horaHasta) {
    clubesConInfo = clubesConInfo.filter((c) => c.libresEnRango > 0);
  }

  clubesConInfo.sort((a, b) => {
    if (!user) return (a.nombre || "").localeCompare(b.nombre || "");
    if (a.esFavorito && !b.esFavorito) return -1;
    if (!a.esFavorito && b.esFavorito) return 1;
    if (horaDesde && horaHasta) return b.libresEnRango - a.libresEnRango;
    return b.libres - a.libres;
  });

  // Obtener superficies únicas
  const todasSuperficies = [...new Set(clubes.flatMap((c) => (c.canchas || []).map((ca) => ca.superficie)).filter(Boolean))];

  const enRango = Boolean(horaDesde && horaHasta);
  const hayFiltros = Boolean(filtroSuperficie || filtroTechada || horaDesde || horaHasta);

  // Pie de la tarjeta: cuántos horarios quedan (en el rango elegido, si hay)
  function disponibilidad(club) {
    if (!user) {
      return <span className="body-sm font-semibold! text-lime-text">Ingresá para ver horarios</span>;
    }
    const n = enRango ? club.libresEnRango : club.libres;
    if (n <= 0) {
      return (
        <span className="body-sm text-ink-3">
          {enRango ? "Sin disponibilidad en ese horario" : "Sin disponibilidad"}
        </span>
      );
    }
    const plural = n !== 1 ? "s" : "";
    return (
      <span className="body-sm text-ink-2 inline-flex items-baseline gap-1">
        <span className="numeral-md text-lime-text pd-tnum">{n}</span>
        {enRango ? `disponible${plural} entre ${horaDesde} – ${horaHasta}` : `horario${plural} disponible${plural}`}
      </span>
    );
  }

  const encabezado = (
    <header className="mb-5">
      <h1 className="display-lg">Canchas disponibles</h1>
      <p className="body-sm text-ink-2 mt-1">Encontrá y reservá tu cancha</p>
    </header>
  );

  if (cargando) {
    return (
      <div aria-busy="true">
        {encabezado}
        <p className="sr-only">Cargando canchas…</p>
        <div className="pd-skeleton h-11 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="pd-skeleton h-56 rounded-lg!" />
          <div className="pd-skeleton h-56 rounded-lg!" />
          <div className="pd-skeleton h-56 rounded-lg!" />
          <div className="pd-skeleton h-56 rounded-lg!" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {encabezado}

      {/* Filtros principales */}
      <div className="flex flex-col gap-3 mb-5">
        {/* Fecha y rango horario: solo con sesión (sin ella no hay disponibilidad) */}
        {user && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Fecha" className="col-span-2">
              <Input type="date" value={fechaSeleccionada} min={fechaMin} max={fechaMax} onChange={(e) => cambiarFecha(e.target.value)} />
            </Field>
            <Field label="Desde">
              <Select
                wrapperClassName="block"
                value={horaDesde}
                onChange={(e) => {
                  setHoraDesde(e.target.value);
                  // Si "Hasta" queda vacío o antes/igual que "Desde", lo corremos 3 horas (antes se hacía en un useEffect)
                  if (e.target.value && (!horaHasta || horaHasta <= e.target.value)) {
                    const h = parseInt(e.target.value.split(":")[0]) + 3;
                    setHoraHasta(h <= 23 ? `${h.toString().padStart(2, "0")}:00` : "23:00");
                  }
                }}
              >
                <option value="">Cualquier hora</option>
                {HORAS.map((h) => (
                  <option key={h} value={hh(h)}>{hh(h)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Hasta">
              <Select wrapperClassName="block" value={horaHasta} onChange={(e) => setHoraHasta(e.target.value)}>
                <option value="">Cualquier hora</option>
                {HORAS
                  .filter((h) => !horaDesde || h > parseInt(horaDesde.split(":")[0]))
                  .map((h) => (
                    <option key={h} value={hh(h)}>{hh(h)}</option>
                  ))}
              </Select>
            </Field>
          </div>
        )}

        <SearchInput
          wrapperClassName="block"
          placeholder="Buscar club..."
          aria-label="Buscar club"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <div className="grid sm:grid-cols-2 gap-3">
          {todasSuperficies.length > 0 && (
            <div>
              <p className="pd-eyebrow mb-2!">Superficie</p>
              <Pills
                ariaLabel="Superficie"
                value={filtroSuperficie}
                onChange={setFiltroSuperficie}
                items={[{ value: "", label: "Todas" }, ...todasSuperficies.map((s) => ({ value: s, label: s }))]}
              />
            </div>
          )}
          <div>
            <p className="pd-eyebrow mb-2!">Cobertura</p>
            <Pills ariaLabel="Cobertura" value={filtroTechada} onChange={setFiltroTechada} items={PILLS_COBERTURA} />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {ciudadJugador && !verTodasCiudades && (
              <span className="body-sm text-ink-2 inline-flex items-center gap-1">
                <MapPin className="pd-icon" size={20} aria-hidden="true" />
                {ciudadJugador}
              </span>
            )}
            {ciudadJugador && (
              <Button variant="ghost" size="sm" onClick={() => setVerTodasCiudades(!verTodasCiudades)}>
                {verTodasCiudades ? "Solo mi ciudad" : "Ver todas las ciudades"}
              </Button>
            )}
          </div>
          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFiltroSuperficie(""); setFiltroTechada(""); setHoraDesde(""); setHoraHasta(""); }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Sin resultados */}
      {clubesConInfo.length === 0 && (
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">
            {ciudadJugador && !verTodasCiudades ? `No hay canchas disponibles en ${ciudadJugador}` : "No hay canchas disponibles"}
          </p>
          <p className="body-sm text-ink-2 mt-1">
            {horaDesde && horaHasta
              ? `No hay disponibilidad entre ${horaDesde} y ${horaHasta}. Probá con otro horario.`
              : "Probá cambiando la fecha o los filtros."}
          </p>
          {ciudadJugador && !verTodasCiudades && (
            <Button className="mt-4" onClick={() => setVerTodasCiudades(true)}>
              Ver canchas en todas las ciudades
            </Button>
          )}
        </Card>
      )}

      {/* Tarjetas de clubes: toda la tarjeta es el link al club; el favorito queda afuera, encima */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {clubesConInfo.map((club) => {
          const nCanchas = club.canchasInfo.length;
          return (
            <div key={club.id} className="relative">
              <Card
                variant="hover"
                as={Link}
                to={`/club/${club.id}`}
                state={{ fecha: fechaSeleccionada, horaDesde, horaHasta }}
                className="block h-full"
              >
                <Card.Title className={user ? "pr-10" : undefined}>{club.nombre}</Card.Title>
                {(club.ciudad || club.direccion) && (
                  <Card.Meta className="flex items-center gap-1">
                    <MapPin className="pd-icon" size={20} aria-hidden="true" />
                    <span className="truncate">
                      {club.ciudad}{club.direccion && ` · ${club.direccion}`}
                    </span>
                  </Card.Meta>
                )}

                <div className="flex gap-2 mt-3 flex-wrap">
                  <Badge>{nCanchas} {nCanchas !== 1 ? "canchas" : "cancha"}</Badge>
                  {club.superficies.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                  {club.tieneTechada && <Badge>Techada</Badge>}
                </div>

                {/* Canchas resumen */}
                <ul className="flex flex-col gap-2 mt-3">
                  {club.canchasInfo.map((cancha) => {
                    const n = enRango ? cancha.canchaLibresEnRango : cancha.canchaLibres;
                    return (
                      <li key={cancha.id} className="flex items-center justify-between gap-3 rounded-sm bg-surface-sunken px-3 py-2 body-sm">
                        <span className="min-w-0 truncate">
                          <span className="font-semibold text-ink">{cancha.nombre}</span>
                          <span className="text-ink-3"> · {cancha.superficie} · {cancha.techada ? "Techada" : "Aire libre"}</span>
                        </span>
                        {user && (
                          n > 0 ? (
                            <span className="font-semibold text-lime-text pd-tnum whitespace-nowrap">
                              {n} {n !== 1 ? "libres" : "libre"}
                            </span>
                          ) : (
                            <span className="text-ink-3 whitespace-nowrap">{enRango ? "—" : "Completa"}</span>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>

                {/* Footer */}
                <Card.Foot className="justify-between flex-wrap border-t border-line pt-3">
                  {disponibilidad(club)}
                  {club.precioMin > 0 && (
                    <span className="body-sm text-ink-2 inline-flex items-baseline gap-1">
                      Desde <span className="numeral-md text-ink pd-tnum">{formatPrecio(club.precioMin)}</span>
                    </span>
                  )}
                </Card.Foot>
              </Card>
              {user && (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  className="absolute top-3 right-3"
                  aria-label={club.esFavorito ? `Quitar ${club.nombre} de favoritos` : `Agregar ${club.nombre} a favoritos`}
                  aria-pressed={club.esFavorito}
                  onClick={() => toggleFavorito(club.id)}
                  icon={
                    <Star
                      className={club.esFavorito ? "pd-icon text-ink" : "pd-icon text-ink-3"}
                      size={20}
                      fill={club.esFavorito ? "currentColor" : "none"}
                      aria-hidden="true"
                    />
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
