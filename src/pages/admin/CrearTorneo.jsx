import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { ArrowLeft, Info, Plus, X } from "lucide-react";
import { db, logEvento } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import { crearTorneo } from "../../services/torneoService";
import { getClubesPublicos, getCanchasDeClub, getClubConfig } from "../../services/canchaService";
import { notificarSolicitudSede } from "../../services/notificationService";
import PerfilIncompleto from "../../components/PerfilIncompleto";
import SinPermiso from "../../components/SinPermiso";
import { CATEGORIAS_TORNEO } from "../../utils/categorias";
import { canchasDesdeTexto } from "../../utils/torneo";
import { Button, Card, Field, Input, MarcaCategoria, Pills, SearchInput, Select, Textarea } from "../../components/ui";
import { provinciasArgentina } from "../../utils/provincias";

const categoriasGenero = [
  { value: "masculino", label: "Masculino" },
  { value: "femenino", label: "Femenino" },
  { value: "mixto", label: "Mixto" },
];

const formatoDescripcion = {
  mini: "Fase de grupos + eliminación directa. Ideal para torneos rápidos de pocas parejas.",
  normal: "Fase de grupos (round robin) + eliminación directa. El formato más usado en padel amateur.",
  liga: "Todos contra todos (round robin) con tabla general de posiciones. Ideal para torneos largos con fechas semanales.",
  eliminacion: "Eliminación directa (single elimination) desde la primera ronda. El que pierde, queda afuera.",
};

// Los cuatro formatos como tarjetas elegibles (mismos valores y textos que tenía el select)
const formatos = [
  { value: "mini", label: "Mini torneo (grupos + eliminación)" },
  { value: "normal", label: "Torneo estándar (grupos + eliminación)" },
  { value: "liga", label: "Liga (todos contra todos)" },
  { value: "eliminacion", label: "Eliminación directa" },
];

// Dónde se juega: en un club de Padely (vínculo + canchas reales del club) o en otra sede (texto libre)
const tiposSede = [
  { value: "club", label: "Club de Padely" },
  { value: "otra", label: "Otra sede" },
];

// Sección "Sede" del formulario: pastillas club / otra sede, buscador + selector de club y las canchas del club
// como badges conmutables (por defecto todas). Los campos de "Otra sede" llegan como children.
function SeccionSede({
  tipoSede,
  onTipoSede,
  clubes,
  clubPropio,
  clubId,
  onClubId,
  busqueda,
  onBusqueda,
  canchasClub,
  cargandoCanchas,
  canchasSel,
  onToggleCancha,
  errorCanchas,
  children,
}) {
  const bloqueado = !!clubPropio;
  const texto = busqueda.trim().toLowerCase();
  const opciones = clubes.filter(
    (c) => c.id === clubId || !texto || `${c.nombre} ${c.ciudad}`.toLowerCase().includes(texto),
  );
  if (clubPropio && !opciones.some((c) => c.id === clubPropio.id)) {
    opciones.unshift({ id: clubPropio.id, nombre: clubPropio.nombre || "", ciudad: clubPropio.ciudad || "" });
  }
  const esDueno = !!clubPropio && clubId === clubPropio.id;

  return (
    <>
      <Field label="Dónde se juega" as="div">
        <Pills items={tiposSede} value={tipoSede} onChange={onTipoSede} ariaLabel="Tipo de sede" />
      </Field>

      {tipoSede === "club" ? (
        <>
          <Field label="Club" as="div" help={bloqueado ? "Tu torneo se juega en tu club" : undefined}>
            <div className="flex flex-col gap-2">
              {!bloqueado && (
                <SearchInput
                  placeholder="Buscar por nombre o ciudad"
                  aria-label="Buscar club"
                  value={busqueda}
                  onChange={(e) => onBusqueda(e.target.value)}
                />
              )}
              <Select
                aria-label="Club"
                value={clubId}
                onChange={(e) => onClubId(e.target.value)}
                disabled={bloqueado}
                required
              >
                <option value="">Elegí un club</option>
                {opciones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.ciudad ? ` · ${c.ciudad}` : ""}
                  </option>
                ))}
              </Select>
            </div>
          </Field>

          <Field
            label="Canchas del torneo"
            as="div"
            error={errorCanchas}
            help="Los partidos programados bloquean estos turnos en el club"
          >
            {canchasClub.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Canchas del torneo">
                {canchasClub.map((c) => {
                  const elegida = canchasSel.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`pd-badge border-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${elegida ? "pd-badge-lime" : ""}`}
                      aria-pressed={elegida}
                      onClick={() => onToggleCancha(c.id)}
                    >
                      {c.nombre}
                    </button>
                  );
                })}
              </div>
            ) : cargandoCanchas ? (
              <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Cargando canchas">
                <span className="pd-skeleton h-6 w-20 rounded-pill!" />
                <span className="pd-skeleton h-6 w-20 rounded-pill!" />
                <span className="pd-skeleton h-6 w-20 rounded-pill!" />
              </div>
            ) : (
              <p className="body-sm text-ink-3">
                {clubId ? "Este club todavía no cargó canchas." : "Elegí un club para ver sus canchas."}
              </p>
            )}
          </Field>
          {clubId && !esDueno && (
            <p className="pd-help">
              El club tiene que aceptar la sede. Podés crear el torneo y abrir la inscripción mientras tanto; los
              turnos se bloquean cuando acepte.
            </p>
          )}
        </>
      ) : (
        children
      )}
    </>
  );
}

export default function CrearTorneo() {
  const { user } = useAuthStore();
  const rol = useAuthStore((s) => s.rol);
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [perfilCompleto, setPerfilCompleto] = useState(true);
  // Entidad organizadora suspendida por el super-admin: no crea torneos nuevos
  const [entidadSuspendida, setEntidadSuspendida] = useState(false);
  const [mostrarInfoReclamos, setMostrarInfoReclamos] = useState(false);
  const [tipoUsuario, setTipoUsuario] = useState("club");
  // Sede: club de Padely (vínculo + canchas reales) u otra sede (texto libre). El texto de canchas de "Otra sede"
  // no forma parte del form: se convierte en [{ id, nombre }] al crear.
  const [tipoSede, setTipoSede] = useState("club");
  const [clubes, setClubes] = useState([]);
  const [clubPropio, setClubPropio] = useState(null);
  const [clubId, setClubId] = useState("");
  const [busquedaClub, setBusquedaClub] = useState("");
  const [canchasClub, setCanchasClub] = useState([]);
  const [cargandoCanchas, setCargandoCanchas] = useState(false);
  const [canchasSel, setCanchasSel] = useState([]);
  const [errorCanchas, setErrorCanchas] = useState("");
  const [canchasTexto, setCanchasTexto] = useState("");
  const [organizadorNombre, setOrganizadorNombre] = useState("");

  useEffect(() => {
    // El club del panel lo resuelve el store; se espera a tenerlo para saber si la cuenta es la dueña
    if (!user || !clubCargado) return;
    const verificar = async () => {
      try {
        const { getUserData } = await import("../../services/authService");
        const userData = await getUserData(user.uid);
        const roles = userData?.role || ["jugador"];

        if (roles.includes("organizador")) {
          setTipoUsuario("organizador");
          const q = query(collection(db, "organizers"), where("ownerUid", "==", user.uid));
          const snap = await getDocs(q);
          if (snap.docs.length > 0) {
            const ent = snap.docs[0].data();
            setOrganizadorNombre(ent.nombre || "");
            if (ent.suspendido === true) setEntidadSuspendida(true);
            if (!ent.telefono || !ent.bio || !ent.ciudad) setPerfilCompleto(false);
          } else {
            setPerfilCompleto(false);
          }
        } else if (roles.includes("club")) {
          setTipoUsuario("club");
          // El club del panel, solo cuando la cuenta es la dueña (el staff no crea torneos)
          const clubData = clubActual?.rolStaff === "dueño" ? clubActual : null;
          if (clubData && (!clubData.telefono || !clubData.direccion || !clubData.ciudad)) {
            setPerfilCompleto(false);
          }
          // El dueño de un club organiza en su club: la sede queda fija y el vínculo nace aceptado
          if (clubData) {
            setClubPropio(clubData);
            setOrganizadorNombre(clubData.nombre || "");
            setTipoSede("club");
            setClubId(clubData.id);
            setCargandoCanchas(true);
          }
        }
      } catch (err) {
        console.error("Error verificando perfil:", err);
      }
    };
    verificar();
  }, [user, clubCargado, clubActual]);

  // Clubes de Padely para el selector de sede (el servicio los cachea durante la sesión)
  useEffect(() => {
    let activo = true;
    getClubesPublicos()
      .then((lista) => {
        if (activo) setClubes(lista);
      })
      .catch((err) => console.error("Error cargando los clubes:", err));
    return () => {
      activo = false;
    };
  }, []);

  // Canchas del club elegido: por defecto el torneo usa todas
  useEffect(() => {
    if (!clubId) return;
    let activo = true;
    getCanchasDeClub(clubId)
      .then((lista) => {
        if (!activo) return;
        setCanchasClub(lista);
        setCanchasSel(lista.map((c) => c.id));
      })
      .catch((err) => console.error("Error cargando las canchas del club:", err))
      .finally(() => {
        if (activo) setCargandoCanchas(false);
      });
    return () => {
      activo = false;
    };
  }, [clubId]);

  const [form, setForm] = useState({
    nombre: "",
    formato: "mini",
    categoriaGenero: [],
    categoriasConfig: {},
    maxParejas: 8,
    inscripcion: 0,
    inscripcionIncluye: "",
    parejasQueAvanzan: 2,
    sede: "",
    direccionSede: "",
    instagramSede: "",
    facebookSede: "",
    ciudad: "",
    provincia: "",
    fechaInicio: "",
    fechaFin: "",
    descripcion: "",
    sets: 1,
    gamesPorSet: 6,
    superTiebreak: false,
    inscripcionAbierta: true,
    habilitarReclamos: true,
    plazoReclamosMinutos: 30,
    reglamento: "",
    premios: "",
    instagramOrganizador: "",
    facebookOrganizador: "",
    whatsappOrganizador: "",
    administradores: [{ nombre: "", whatsapp: "" }],
  });

  const set = (field) => (e) => {
    const val =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    let updatedForm = { ...form, [field]: val };

    // Auto-ajustar fechaFin si fechaInicio cambió
    if (field === "fechaInicio" && updatedForm.fechaFin && updatedForm.fechaFin < val) {
      updatedForm.fechaFin = val;
    }

    // Auto-configurar sets según formato
    if (field === "formato") {
      if (val === "mini") {
        updatedForm.sets = 1;
        updatedForm.gamesPorSet = 4;
      } else if (val === "normal") {
        updatedForm.sets = 3;
        updatedForm.gamesPorSet = 6;
      }
    }

    setForm(updatedForm);
  };

  const toggleGenero = (genero) => {
    const current = form.categoriaGenero;
    let updated;
    if (current.includes(genero)) {
      updated = current.filter((g) => g !== genero);
      const newConfig = { ...form.categoriasConfig };
      delete newConfig[genero];
      setForm({
        ...form,
        categoriaGenero: updated,
        categoriasConfig: newConfig,
      });
    } else {
      if (current.length >= 3) return;
      updated = [...current, genero];
      setForm({
        ...form,
        categoriaGenero: updated,
        categoriasConfig: { ...form.categoriasConfig, [genero]: [] },
      });
    }
  };

  const toggleNivel = (genero, nivel) => {
    const current = form.categoriasConfig[genero] || [];
    let updated;
    if (current.includes(nivel)) {
      updated = current.filter((n) => n !== nivel);
    } else {
      updated = [...current, nivel];
    }
    setForm({
      ...form,
      categoriasConfig: { ...form.categoriasConfig, [genero]: updated },
    });
  };

  const agregarAdmin = () => {
    setForm({
      ...form,
      administradores: [...form.administradores, { nombre: "", whatsapp: "" }],
    });
  };

  const actualizarAdmin = (index, field, value) => {
    const nuevos = [...form.administradores];
    nuevos[index] = { ...nuevos[index], [field]: value };
    setForm({ ...form, administradores: nuevos });
  };

  const eliminarAdmin = (index) => {
    if (form.administradores.length <= 1) return;
    setForm({
      ...form,
      administradores: form.administradores.filter((_, i) => i !== index),
    });
  };

  const elegirClub = (id) => {
    setClubId(id);
    setCanchasClub([]);
    setCanchasSel([]);
    setErrorCanchas("");
    setCargandoCanchas(!!id);
  };

  const toggleCancha = (canchaId) => {
    setErrorCanchas("");
    setCanchasSel((prev) => (prev.includes(canchaId) ? prev.filter((c) => c !== canchaId) : [...prev, canchaId]));
  };

  const cambiarTipoSede = (tipo) => {
    setTipoSede(tipo);
    setErrorCanchas("");
    if (tipo === "club" && clubPropio && !clubId) elegirClub(clubPropio.id);
  };

  const handleSubmit = async (e) => {
    if (entidadSuspendida) {
      e?.preventDefault?.();
      return;
    }
    e.preventDefault();
    setError("");

    if (form.categoriaGenero.length === 0) {
      setError("Seleccioná al menos una categoría género.");
      return;
    }

    const algunNivelVacio = form.categoriaGenero.some(
      (g) => !form.categoriasConfig[g] || form.categoriasConfig[g].length === 0,
    );
    if (algunNivelVacio) {
      setError("Seleccioná al menos una categoría nivel para cada género.");
      return;
    }

    const today = getTodayString();
    if (form.fechaInicio && form.fechaInicio < today) {
      setError("La fecha de inicio no puede ser anterior a hoy.");
      return;
    }

    const conClub = tipoSede === "club";
    if (conClub && !clubId) {
      setError("Elegí el club donde se juega el torneo.");
      return;
    }
    if (conClub && canchasSel.length === 0) {
      setErrorCanchas("Elegí al menos una cancha");
      setError("Elegí al menos una cancha del club.");
      return;
    }

    setLoading(true);
    try {
      // Sede: con club, el vínculo nace aceptado si quien crea es el dueño del club (si no, pendiente) y
      // sede/ciudad/provincia/dirección se copian del club para que las listas sigan funcionando.
      // Con "Otra sede", club = null y las canchas salen del texto tipeado.
      const datos = { ...form, organizadorNombre, club: null, canchas: canchasDesdeTexto(canchasTexto) };
      let clubDoc = null;
      if (conClub) {
        clubDoc = await getClubConfig(clubId);
        if (!clubDoc) {
          setError("No encontramos ese club. Elegí otro.");
          setLoading(false);
          return;
        }
        datos.club = {
          id: clubDoc.id,
          nombre: clubDoc.nombre || "",
          ciudad: clubDoc.ciudad || "",
          estado: clubDoc.ownerUid === user.uid ? "aceptado" : "pendiente",
        };
        datos.canchas = canchasClub
          .filter((c) => canchasSel.includes(c.id))
          .map((c) => ({ id: c.id, nombre: c.nombre }));
        datos.sede = clubDoc.nombre || "";
        datos.ciudad = clubDoc.ciudad || "";
        datos.provincia = clubDoc.provincia || "";
        datos.direccionSede = clubDoc.direccion || "";
      }
      const id = await crearTorneo(datos, user.uid);
      if (datos.club?.estado === "pendiente") {
        notificarSolicitudSede(clubDoc.ownerUid, form.nombre, organizadorNombre, id).catch((err) =>
          console.error("Error avisando al club:", err),
        );
      }
      logEvento("torneo_creado", { torneoId: id, formato: form.formato || "" });
      navigate(`/admin/torneos/${id}`);
    } catch {
      setError("Error al crear el torneo. Intentá de nuevo.");
      setLoading(false);
    }
  };

  function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const todayStr = getTodayString();

  // El staff del club no organiza torneos: solo el dueño (o un organizador) crea uno
  if (clubActual && clubActual.rolStaff !== "dueño" && rol !== "organizador") {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            iconOnly
            aria-label="Volver"
            icon={<ArrowLeft className="pd-icon" size={20} aria-hidden="true" />}
            onClick={() => navigate(-1)}
          />
          <h1 className="heading-lg">Crear torneo</h1>
        </div>
        <SinPermiso>Solo el dueño del club crea torneos.</SinPermiso>
      </div>
    );
  }

  if (!perfilCompleto) {
    return <PerfilIncompleto tipo={tipoUsuario} ruta={tipoUsuario === "organizador" ? "/org/entidad" : "/admin/configuracion"} />;
  }
  if (entidadSuspendida) {
    // El aviso de la suspensión lo muestra el panel del organizador arriba de esta página: no se repite
    return (
      <div className="flex flex-col gap-4">
        <h1 className="heading-lg m-0">Crear torneo</h1>
        <Button as="link" to="/org/torneos" className="self-start">
          Volver a mis torneos
        </Button>
      </div>
    );
  }

  // Chips de categoría de un género: pastillas multi (aria-pressed) con la marca de cada categoría
  const chipsNivel = (genero) => (
    <div className="pd-pills" role="group" aria-label={`Categorías ${genero}`}>
      {CATEGORIAS_TORNEO.map((nivel) => (
        <button
          key={nivel}
          type="button"
          className="pd-pill"
          aria-pressed={(form.categoriasConfig[genero] || []).includes(nivel)}
          onClick={() => toggleNivel(genero, nivel)}
        >
          <MarcaCategoria cat={nivel} size={20} />
          {nivel}
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          iconOnly
          aria-label="Volver"
          icon={<ArrowLeft className="pd-icon" size={20} aria-hidden="true" />}
          onClick={() => navigate(-1)}
        />
        <h1 className="heading-lg">Crear torneo</h1>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-danger bg-danger-soft text-danger body-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Información general */}
        <Card as="section">
          <Card.Title as="h2" className="mb-4!">
            Información general
          </Card.Title>
          <div className="flex flex-col gap-4">
            <Field label="Nombre del torneo">
              <Input
                type="text"
                placeholder="Ej: Torneo Apertura 2025"
                value={form.nombre}
                onChange={set("nombre")}
                required
              />
            </Field>
            <Field label="Descripción (opcional)">
              <Textarea
                placeholder="Información adicional del torneo…"
                value={form.descripcion}
                onChange={set("descripcion")}
                rows={3}
              />
            </Field>

            <Field label="Categoría género (hasta 3)" as="div">
              <Pills
                items={categoriasGenero}
                value={form.categoriaGenero}
                onChange={toggleGenero}
                multi
                ariaLabel="Categoría género"
              />
            </Field>

            {form.categoriaGenero.map((genero) => (
              <Field key={genero} label={`Categoría nivel — ${genero.charAt(0).toUpperCase() + genero.slice(1)}`} as="div">
                {chipsNivel(genero)}
              </Field>
            ))}
          </div>
        </Card>

        {/* Formato */}
        <Card as="section">
          <Card.Title as="h2" className="mb-4!">
            Formato
          </Card.Title>
          <div className="flex flex-col gap-4">
            <Field label="Tipo de torneo" as="div">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2" role="group" aria-label="Tipo de torneo">
                {formatos.map((f) => {
                  const elegido = form.formato === f.value;
                  return (
                    <Card
                      key={f.value}
                      as="button"
                      type="button"
                      aria-pressed={elegido}
                      onClick={() => {
                        if (elegido) return;
                        set("formato")({ target: { type: "button", value: f.value } });
                      }}
                      className={`text-left w-full cursor-pointer ${elegido ? "border-line-strong! bg-surface-hover!" : ""}`}
                    >
                      <span className="heading-sm block">{f.label}</span>
                      <span className="body-sm text-ink-2 block mt-1">{formatoDescripcion[f.value]}</span>
                    </Card>
                  );
                })}
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Sets por partido">
                <Select value={form.sets} onChange={set("sets")}>
                  <option value={1}>1 set</option>
                  <option value={2}>2 sets</option>
                  <option value={3}>3 sets</option>
                </Select>
              </Field>
              <Field
                label="Games por set"
                help={Number(form.gamesPorSet) === 4 ? "Ideal para mini torneos rápidos" : "Formato estándar de padel"}
              >
                <Select value={form.gamesPorSet} onChange={set("gamesPorSet")}>
                  <option value={4}>4 games</option>
                  <option value={6}>6 games</option>
                </Select>
              </Field>
            </div>

            {(form.formato === "mini" || form.formato === "normal") && (
              <Field label="Parejas que avanzan de cada grupo">
                <Select value={form.parejasQueAvanzan} onChange={set("parejasQueAvanzan")}>
                  <option value={1}>1 pareja (solo el primero)</option>
                  <option value={2}>2 parejas (primero y segundo)</option>
                  <option value={3}>3 parejas</option>
                </Select>
              </Field>
            )}

            <label className="flex items-center gap-3 body-md">
              <input
                type="checkbox"
                id="superTiebreak"
                checked={form.superTiebreak}
                onChange={set("superTiebreak")}
                className="h-5 w-5 accent-ink"
              />
              Super tiebreak al 10 en caso de empate
            </label>
            <label className="flex items-center gap-3 body-md">
              <input
                type="checkbox"
                id="inscripcionAbierta"
                checked={form.inscripcionAbierta}
                onChange={set("inscripcionAbierta")}
                className="h-5 w-5 accent-ink"
              />
              Inscripción abierta al público
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-3 body-md">
                <input
                  type="checkbox"
                  id="habilitarReclamos"
                  checked={form.habilitarReclamos}
                  onChange={set("habilitarReclamos")}
                  className="h-5 w-5 accent-ink"
                />
                Habilitar sistema de reclamos de categoría
              </label>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="¿Qué es el sistema de reclamos?"
                aria-expanded={mostrarInfoReclamos}
                icon={<Info className="pd-icon" size={20} aria-hidden="true" />}
                onClick={() => setMostrarInfoReclamos(!mostrarInfoReclamos)}
              />
            </div>
            {mostrarInfoReclamos && (
              <div className="rounded-md bg-surface-sunken p-4">
                <h3 className="heading-sm mb-2">Sistema de reclamos de categoría</h3>
                <div className="flex flex-col gap-1.5 body-sm text-ink-2">
                  <p>Permite a los jugadores denunciar a una pareja rival si consideran que no pertenece a la categoría del torneo.</p>
                  <p><strong>¿Cómo funciona?</strong></p>
                  <p>1. Un jugador vinculado abre un reclamo contra la pareja rival desde su vista del partido.</p>
                  <p>2. Otras parejas del torneo pueden adherirse al reclamo dentro del plazo configurado.</p>
                  <p>3. La pareja denunciada puede dejar un descargo (defensa).</p>
                  <p>4. El organizador revisa el reclamo y decide: desestimar (sin efecto) o descalificar a la pareja.</p>
                  <p><strong>Motivos disponibles:</strong> categoría incorrecta, conducta antideportiva.</p>
                  <p className="mt-1 text-ink-3">Los jugadores deben estar vinculados a sus parejas para poder abrir reclamos.</p>
                </div>
              </div>
            )}
            {form.habilitarReclamos && (
              <Field label="Plazo para adherirse al reclamo">
                <Select value={form.plazoReclamosMinutos} onChange={set("plazoReclamosMinutos")}>
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>60 minutos</option>
                </Select>
              </Field>
            )}

            <p className="flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2 body-sm text-ink-2">
              <Info className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <span>
                <strong>Mini torneo:</strong> sugiere 1 set de 4 games, rápido y dinámico. <strong>Estándar:</strong> sugiere 3 sets de 6 games, el clásico. <strong>Liga:</strong> todos juegan contra todos, ideal para temporadas largas. <strong>Eliminación directa:</strong> sin fase de grupos, máxima intensidad. Podés personalizar sets y games en cualquier formato.
              </span>
            </p>
          </div>
        </Card>

        {/* Participantes */}
        <Card as="section">
          <Card.Title as="h2" className="mb-4!">
            Participantes
          </Card.Title>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Máximo de parejas">
                <Input
                  type="number"
                  inputMode="numeric"
                  min="4"
                  max="256"
                  placeholder="Ej: 32"
                  value={form.maxParejas}
                  onChange={set("maxParejas")}
                />
              </Field>
              <Field label="Costo de inscripción ($)">
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={form.inscripcion}
                  onChange={set("inscripcion")}
                />
              </Field>
            </div>
            <Field label="¿Qué incluye la inscripción? (opcional)">
              <Textarea
                placeholder={
                  "Ej:\n- 1 tubo de pelotas\n- Remera del torneo\n- Hidratación durante los partidos\n- Acceso a vestuarios"
                }
                value={form.inscripcionIncluye}
                onChange={set("inscripcionIncluye")}
                rows={3}
              />
            </Field>
          </div>
        </Card>

        {/* Premios */}
        <Card as="section">
          <Card.Title as="h2" className="mb-4!">
            Premios
          </Card.Title>
          <Field label="Premios del torneo (opcional)">
            <Textarea
              placeholder={
                "Ej:\n1er puesto: $ 50.000 + 2 paletas Bullpadel\n2do puesto: $ 25.000 + voucher tienda\n3er puesto: Kit de pelotas\n\nTambién podés incluir premios especiales como mejor jugador, fair play, etc."
              }
              value={form.premios}
              onChange={set("premios")}
              rows={5}
            />
          </Field>
        </Card>

        {/* Sede y fechas */}
        <Card as="section">
          <Card.Title as="h2" className="mb-4!">
            Sede y fechas
          </Card.Title>
          <div className="flex flex-col gap-4">
            <SeccionSede
              tipoSede={tipoSede}
              onTipoSede={cambiarTipoSede}
              clubes={clubes}
              clubPropio={clubPropio}
              clubId={clubId}
              onClubId={elegirClub}
              busqueda={busquedaClub}
              onBusqueda={setBusquedaClub}
              canchasClub={canchasClub}
              cargandoCanchas={cargandoCanchas}
              canchasSel={canchasSel}
              onToggleCancha={toggleCancha}
              errorCanchas={errorCanchas}
            >
              <Field label="Nombre de la sede">
                <Input
                  type="text"
                  placeholder="Ej: Club Náutico Santiago"
                  value={form.sede}
                  onChange={set("sede")}
                  required
                />
              </Field>
              <Field label="Dirección física">
                <Input
                  type="text"
                  placeholder="Ej: Av. Belgrano 1234"
                  value={form.direccionSede}
                  onChange={set("direccionSede")}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Instagram de la sede">
                  <Input
                    type="text"
                    placeholder="@clubnautico"
                    value={form.instagramSede}
                    onChange={set("instagramSede")}
                  />
                </Field>
                <Field label="Facebook de la sede">
                  <Input
                    type="text"
                    placeholder="facebook.com/clubnautico"
                    value={form.facebookSede}
                    onChange={set("facebookSede")}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Ciudad">
                  <Input
                    type="text"
                    placeholder="Ciudad"
                    value={form.ciudad}
                    onChange={set("ciudad")}
                    required
                  />
                </Field>
                <Field label="Provincia">
                  <Select value={form.provincia} onChange={set("provincia")} required>
                    <option value="">Seleccionar provincia</option>
                    {provinciasArgentina.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Canchas" help="Separadas por coma">
                <Input
                  type="text"
                  placeholder="Cancha 1, Cancha 2"
                  value={canchasTexto}
                  onChange={(e) => setCanchasTexto(e.target.value)}
                />
              </Field>
            </SeccionSede>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Fecha de inicio">
                <Input
                  type="date"
                  value={form.fechaInicio}
                  onChange={set("fechaInicio")}
                  min={todayStr}
                  required
                />
              </Field>
              <Field label="Fecha de fin">
                <Input
                  type="date"
                  value={form.fechaFin}
                  onChange={set("fechaFin")}
                  min={form.fechaInicio || todayStr}
                  required
                />
              </Field>
            </div>
          </div>
        </Card>

        {/* Reglamento */}
        <Card as="section">
          <Card.Title as="h2" className="mb-4!">
            Reglamento
          </Card.Title>
          <Field label="Reglas especiales del torneo (opcional)">
            <Textarea
              placeholder={
                "Ej:\n- 15 minutos de tolerancia\n- Pareja que no sea de la categoría será eliminada sin devolución de inscripción\n- Se juega con pelotas nuevas provistas por la organización"
              }
              value={form.reglamento}
              onChange={set("reglamento")}
              rows={5}
            />
          </Field>
        </Card>

        {/* Redes y administradores */}
        <Card as="section">
          <Card.Title as="h2" className="mb-4!">
            Redes y contacto
          </Card.Title>
          <div className="flex flex-col gap-4">
            <Field label="Instagram del organizador">
              <Input
                type="text"
                placeholder="@toppadeltorneos"
                value={form.instagramOrganizador}
                onChange={set("instagramOrganizador")}
              />
            </Field>
            <Field label="Facebook del organizador">
              <Input
                type="text"
                placeholder="facebook.com/toppadeltorneos"
                value={form.facebookOrganizador}
                onChange={set("facebookOrganizador")}
              />
            </Field>
            <Field label="WhatsApp general">
              <Input
                type="text"
                inputMode="tel"
                placeholder="Ej: +54 385 1234567"
                value={form.whatsappOrganizador}
                onChange={(e) => setForm({ ...form, whatsappOrganizador: e.target.value.replace(/\D/g, "") })}
              />
            </Field>

            <div className="mt-2 pt-4 border-t border-line">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="pd-label">Personas administradoras del torneo</span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Plus className="pd-icon" size={20} aria-hidden="true" />}
                  onClick={agregarAdmin}
                >
                  Agregar persona
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {form.administradores.map((admin, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      type="text"
                      placeholder="Nombre"
                      aria-label={`Nombre de la persona ${i + 1}`}
                      value={admin.nombre}
                      onChange={(e) =>
                        actualizarAdmin(i, "nombre", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Input
                      type="tel"
                      inputMode="tel"
                      placeholder="Ej: 5493851234567"
                      aria-label={`WhatsApp de la persona ${i + 1}`}
                      value={admin.whatsapp}
                      onChange={(e) =>
                        actualizarAdmin(i, "whatsapp", e.target.value.replace(/\D/g, ""))
                      }
                      className="flex-1"
                    />
                    {form.administradores.length > 1 && (
                      <Button
                        variant="ghost"
                        iconOnly
                        aria-label="Quitar persona"
                        icon={<X className="pd-icon" size={20} aria-hidden="true" />}
                        onClick={() => eliminarAdmin(i)}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="pd-help mt-2">
                Personas responsables que los jugadores pueden contactar durante
                el torneo
              </p>
            </div>
          </div>
        </Card>

        <Button type="submit" variant="primary" block cargando={loading ? "Creando torneo…" : ""}>
          Crear torneo
        </Button>
      </form>
    </div>
  );
}
