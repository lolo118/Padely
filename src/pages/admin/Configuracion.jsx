import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy, ImagePlus, Upload } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { clubConectadoMp, mpConectarUrl, mpDesconectar } from "../../services/mercadoPagoService";
import { actualizarClubConfig, getClubPrivado, actualizarClubPrivado } from "../../services/canchaService";
import {
  getStaffDelClub,
  actualizarStaff,
  cambiarRolStaff,
  quitarStaff,
  getInvitacionesPendientes,
  crearInvitacion,
  cancelarInvitacion,
  estadoDeInvitacion,
} from "../../services/staffService";
import { uploadClubLogo } from "../../services/storageService";
import { formatPrecio } from "../../utils/format";
import { comisionPct, estadoPlan } from "../../utils/planes";
import { formatFecha, formatFechaHoraArg } from "../../utils/formatDate";
import { MAX_TURNOS_POR_RESERVA, maxTurnosDelClub } from "../../utils/tarifas";
import {
  INVITACION_DIAS,
  PERMISOS_BAR,
  PERMISOS_FASE_ACTUAL,
  ROLES,
  ROLES_INVITABLES,
  descuentoMaxDeRol,
  linkInvitacion,
  permisosDeRol,
  rolLabel,
} from "../../utils/staff";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import SinPermiso from "../../components/SinPermiso";
import { Alert, Badge, Button, Card, Field, Input, Pills, Select, Tabs } from "../../components/ui";

const diasSemana = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const tiposSeña = [
  { value: "ninguna", label: "Ninguna" },
  { value: "porcentaje", label: "Porcentaje" },
  { value: "monto", label: "Monto" },
];

const opcionesTurnos = Array.from({ length: MAX_TURNOS_POR_RESERVA }, (_, i) => i + 1);

// Tipo de seña guardado en el club, o "ninguna" si no configuró nada (o tiene un valor que no conocemos)
const tipoSeñaDelClub = (club) => (tiposSeña.some((t) => t.value === club?.seña?.tipo) ? club.seña.tipo : "ninguna");

// Mensaje de error de la seña del formulario, o "" cuando es válida (porcentaje 1–100, monto mayor a 0)
function validarSeña(tipo, valor) {
  if (tipo === "ninguna") return "";
  const n = Number(valor);
  if (tipo === "porcentaje") {
    return Number.isFinite(n) && n >= 1 && n <= 100 ? "" : "Ingresá un porcentaje entre 1 y 100";
  }
  if (tipo === "monto") return Number.isFinite(n) && n > 0 ? "" : "Ingresá un monto mayor a 0";
  return "";
}

// ----- Equipo -----

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invitacionVacia = () => ({ nombre: "", email: "", rol: ROLES_INVITABLES[0] });

// "YYYY-MM-DD" local de un Date (es lo que formatFecha espera)
const fechaLocalStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Un Timestamp de Firestore (o un Date) como "DD/MM/YY"
const formatVence = (vence) => {
  const d = vence?.toDate
    ? vence.toDate()
    : vence instanceof Date
      ? vence
      : vence?.seconds
        ? new Date(vence.seconds * 1000)
        : null;
  return d ? formatFecha(fechaLocalStr(d)) : "";
};

// Iniciales para el pd-avatar: primera letra del nombre y del apellido
const iniciales = (nombre) => {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
};

// Descuento máximo válido: entero entre 0 y 100, o null si no es un número
const descuentoValido = (valor) => {
  const n = Number(valor);
  if (String(valor).trim() === "" || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
};

// Los permisos de la fase actual que trae el preset de un rol, como texto
const permisosDelPreset = (rol) =>
  PERMISOS_FASE_ACTUAL.filter((p) => ROLES[rol]?.permisos.includes(p.id))
    .map((p) => p.label)
    .join(", ");

const mensajeWhatsApp = (nombre, clubNombre, link) =>
  `Hola ${nombre}, te invito al equipo de ${clubNombre} en Padely: ${link}`;

// Staff e invitaciones pendientes de un club, con "vencida" ya calculada (así el render no mira el reloj)
const cargarEquipoDe = async (clubId) => {
  const [staff, pendientes] = await Promise.all([getStaffDelClub(clubId), getInvitacionesPendientes(clubId)]);
  return {
    staff,
    invitaciones: pendientes.map((inv) => ({ ...inv, vencida: estadoDeInvitacion(inv) === "vencida" })),
  };
};

export default function Configuracion() {
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const recargarClub = useAuthStore((s) => s.recargarClub);
  const clubId = clubActual?.id || null;
  const puedeConfigurar = puede("configurarClub");
  const puedeStaff = puede("gestionarStaff");

  const [club, setClub] = useState(null);
  const [guardando, setGuardando] = useState(false);
  // La vuelta de Mercado Pago (?mp=…) abre directamente la sección Pagos
  const [tab, setTab] = useState(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mp") ? "pagos" : "datos"));
  const [mensaje, setMensaje] = useState("");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [errorSeña, setErrorSeña] = useState("");

  const [form, setForm] = useState({
    nombre: "",
    direccion: "",
    ciudad: "",
    provincia: "",
    telefono: "",
    email: "",
    instagram: "",
    facebook: "",
    whatsapp: "",
    website: "",
    horarioApertura: "08:00",
    horarioCierre: "23:00",
    diasAbiertos: [
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ],
    cbu: "",
    alias: "",
    titularCuenta: "",
    cuit: "",
    razonSocial: "",
    // Tickets del bar (clubs/{c}.ticket): encabezado, línea de transferencias y pie
    ticketEncabezado: "",
    ticketAlias: "",
    ticketPie: "",
    // Reservas: seña (tipo + valor, el valor como texto del input) y turnos seguidos por reserva
    señaTipo: "ninguna",
    señaValor: "",
    maxTurnosPorReserva: MAX_TURNOS_POR_RESERVA,
  });

  // Equipo: staff e invitaciones pendientes del club (se cargan la primera vez que se abre la sección)
  const [staff, setStaff] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);
  const [equipoDeClub, setEquipoDeClub] = useState(null); // id del club cuyo equipo ya está cargado
  const [nuevaInvitacion, setNuevaInvitacion] = useState(invitacionVacia);
  const [erroresInvitacion, setErroresInvitacion] = useState({ nombre: "", email: "" });
  const [creandoInvitacion, setCreandoInvitacion] = useState(false);
  const [invitacionCreada, setInvitacionCreada] = useState(null); // { id, nombre, email, rol, vence, link }
  const [permisosAbiertos, setPermisosAbiertos] = useState(null); // uid con la fila de permisos desplegada
  const [descuentoEditado, setDescuentoEditado] = useState({}); // uid -> texto del input mientras se edita
  const [guardandoStaff, setGuardandoStaff] = useState(null); // uid con un cambio en curso

  // Secciones según permisos: la configuración con configurarClub, el equipo con gestionarStaff
  const tabs = [
    ...(puedeConfigurar
      ? [
          { value: "datos", label: "Datos del club" },
          { value: "horarios", label: "Horarios" },
          { value: "redes", label: "Redes sociales" },
          { value: "facturacion", label: "Facturación" },
          { value: "pagos", label: "Pagos" },
        ]
      : []),
    ...(puedeStaff ? [{ value: "equipo", label: "Equipo" }] : []),
  ];
  const tabActiva = tabs.some((t) => t.value === tab) ? tab : tabs[0]?.value;

  // Mercado Pago: vuelta de la autorización (?mp=ok|error) y conectar / desconectar
  const [searchParams, setSearchParams] = useSearchParams();
  const mpVuelta = searchParams.get("mp");
  const mpMotivo = searchParams.get("motivo");
  const [mpOcupado, setMpOcupado] = useState(false);
  useEffect(() => {
    if (!mpVuelta) return;
    if (mpVuelta === "ok") toast.success("Mercado Pago conectado");
    else toast.error(`No se pudo conectar Mercado Pago${mpMotivo ? ` (${mpMotivo})` : ""}. Probá de nuevo.`);
    recargarClub();
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpVuelta]);
  const conectarMp = async () => {
    setMpOcupado(true);
    try {
      const { url } = await mpConectarUrl({ clubId });
      window.location.assign(url);
    } catch (err) {
      console.error("Error pidiendo la autorización de MP:", err);
      toast.error(err?.message || "No pudimos iniciar la conexión con Mercado Pago.");
      setMpOcupado(false);
    }
  };
  const desconectarMp = async () => {
    const ok = await confirmar({ titulo: "¿Desconectar Mercado Pago?", mensaje: "Los jugadores dejan de poder pagar online y el mostrador pierde el QR de Mercado Pago. Los pagos ya hechos no cambian.", confirmText: "Desconectar", danger: true });
    if (!ok) return;
    setMpOcupado(true);
    try {
      await mpDesconectar({ clubId });
      await recargarClub();
      toast.success("Mercado Pago desconectado");
    } catch (err) {
      console.error("Error desconectando MP:", err);
      toast.error("No pudimos desconectar Mercado Pago.");
    } finally {
      setMpOcupado(false);
    }
  };
  const equipoVisible = tabActiva === "equipo" && !!clubId;
  const planConPro = !clubActual || estadoPlan(clubActual).pro;
  const equipoCargado = equipoDeClub === clubId;

  // El club viene del store; acá solo se lee el documento privado (CBU, CUIT...) y se arma el formulario
  useEffect(() => {
    if (!clubCargado || !clubId) return;
    let vigente = true;
    const cargar = async () => {
      const { clubActual: clubData, puede: puedeAhora } = useAuthStore.getState();
      if (!clubData || clubData.id !== clubId) return;
      // Los datos privados solo los lee quien configura el club (es lo que las reglas permiten)
      const privado =
        (await (puedeAhora("configurarClub") ? getClubPrivado(clubId) : Promise.resolve({})).catch((err) => {
          console.error("Error al cargar los datos privados del club:", err);
          return {};
        })) || {};
      if (!vigente) return;
      setClub(clubData);
      setForm({
        nombre: clubData.nombre || "",
        direccion: clubData.direccion || "",
        ciudad: clubData.ciudad || "",
        provincia: clubData.provincia || "",
        telefono: clubData.telefono || "",
        email: clubData.email || "",
        instagram: clubData.instagram || "",
        facebook: clubData.facebook || "",
        whatsapp: clubData.whatsapp || "",
        website: clubData.website || "",
        horarioApertura: clubData.horarioApertura || "08:00",
        horarioCierre: clubData.horarioCierre || "23:00",
        diasAbiertos: clubData.diasAbiertos || diasSemana,
        cbu: privado.cbu || clubData.cbu || "",
        alias: privado.alias || clubData.alias || "",
        titularCuenta: privado.titularCuenta || clubData.titularCuenta || "",
        cuit: privado.cuit || clubData.cuit || "",
        razonSocial: privado.razonSocial || clubData.razonSocial || "",
        ticketEncabezado: clubData.ticket?.encabezado || "",
        ticketAlias: clubData.ticket?.alias || "",
        ticketPie: clubData.ticket?.pie || "",
        señaTipo: tipoSeñaDelClub(clubData),
        señaValor: Number(clubData.seña?.valor) > 0 ? String(Number(clubData.seña.valor)) : "",
        maxTurnosPorReserva: maxTurnosDelClub(clubData),
      });
      setLogoUrl(clubData.logoUrl || null);
    };
    cargar();
    return () => {
      vigente = false;
    };
  }, [clubCargado, clubId]);

  // Staff e invitaciones: la primera vez que se abre la sección (y cada vez que cambia el club)
  useEffect(() => {
    if (!equipoVisible || equipoCargado) return;
    let vigente = true;
    const cargar = async () => {
      try {
        const datos = await cargarEquipoDe(clubId);
        if (!vigente) return;
        setStaff(datos.staff);
        setInvitaciones(datos.invitaciones);
        setEquipoDeClub(clubId);
      } catch (err) {
        console.error("Error al cargar el equipo:", err);
        if (vigente) toast.error("No pudimos cargar el equipo. Recargá la página.");
      }
    };
    cargar();
    return () => {
      vigente = false;
    };
  }, [equipoVisible, equipoCargado, clubId]);

  // Después de crear una invitación: la lista de pendientes con los datos del servidor
  const recargarEquipo = async () => {
    const datos = await cargarEquipoDe(clubId);
    setStaff(datos.staff);
    setInvitaciones(datos.invitaciones);
  };

  const handleGuardar = async () => {
    if (!club || !puedeConfigurar) return;
    // La seña inválida no se guarda: el error queda bajo el campo, en la sección donde está
    const error = validarSeña(form.señaTipo, form.señaValor);
    if (error) {
      setErrorSeña(error);
      setTab("horarios");
      toast.error("Revisá la seña antes de guardar.");
      return;
    }
    setGuardando(true);
    setMensaje("");
    try {
      // Lo público va al documento del club; CBU, alias, CUIT y razón social, al subdocumento privado
      const { cbu, alias, titularCuenta, cuit, razonSocial, señaTipo, señaValor, maxTurnosPorReserva, ticketEncabezado, ticketAlias, ticketPie, ...resto } = form;
      const publicos = {
        ...resto,
        // Lo que se imprime en los tickets del bar (el alias de acá es el que el club ELIGE mostrar a sus clientes)
        ticket: {
          encabezado: ticketEncabezado.trim() || null,
          alias: ticketAlias.trim() || null,
          pie: ticketPie.trim() || null,
        },
        seña: { tipo: señaTipo, valor: señaTipo === "ninguna" ? 0 : Number(señaValor) },
        maxTurnosPorReserva: Number(maxTurnosPorReserva),
        // La grilla sigue siendo horaria; se guarda para la próxima etapa
        duracionTurno: 60,
      };
      await actualizarClubConfig(club.id, publicos);
      await actualizarClubPrivado(club.id, { cbu, alias, titularCuenta, cuit, razonSocial });
      setClub({ ...club, ...publicos });
      // El resto del panel (sidebar, grilla) lee el club del store
      await recargarClub();
      setMensaje("Configuración guardada");
      setTimeout(() => setMensaje(""), 3000);
      toast.success("Configuración guardada");
    } catch (err) {
      console.error("Error al guardar:", err);
      setMensaje("Error al guardar");
      toast.error("No pudimos guardar la configuración. Intentá de nuevo.");
    }
    setGuardando(false);
  };

  const toggleDia = (dia) => {
    const current = [...form.diasAbiertos];
    if (current.includes(dia)) {
      setForm({ ...form, diasAbiertos: current.filter((d) => d !== dia) });
    } else {
      setForm({ ...form, diasAbiertos: [...current, dia] });
    }
  };

  const handleSubirLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("La imagen no puede superar los 5MB"); return; }
    setSubiendoLogo(true);
    try {
      const url = await uploadClubLogo(club.id, file);
      await actualizarClubConfig(club.id, { logoUrl: url });
      setLogoUrl(url);
      await recargarClub();
      toast.success("Logo actualizado");
    } catch (err) {
      console.error("Error subiendo logo:", err);
      toast.error("No pudimos subir el logo. Intentá de nuevo.");
    }
    setSubiendoLogo(false);
  };

  // ----- Equipo: invitaciones -----

  const copiarEnlace = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Enlace copiado");
    } catch (err) {
      console.error("Error al copiar el enlace:", err);
      toast.error("No pudimos copiar el enlace. Copialo a mano.");
    }
  };

  const handleCrearInvitacion = async (e) => {
    e.preventDefault();
    if (!club || !user) return;
    const nombre = nuevaInvitacion.nombre.trim();
    const email = nuevaInvitacion.email.trim().toLowerCase();
    const rol = nuevaInvitacion.rol;
    const errores = { nombre: "", email: "" };
    if (!nombre) errores.nombre = "Ingresá el nombre";
    if (!EMAIL_RE.test(email)) errores.email = "Ingresá un email válido";
    else if (staff.some((s) => String(s.email || "").toLowerCase() === email)) errores.email = "Esta persona ya es parte del equipo";
    else if (invitaciones.some((inv) => String(inv.email || "").toLowerCase() === email && !inv.vencida)) {
      errores.email = "Ya hay una invitación pendiente para este email";
    }
    setErroresInvitacion(errores);
    if (errores.nombre || errores.email) return;
    setCreandoInvitacion(true);
    try {
      const id = await crearInvitacion(club.id, { email, nombre, rol, creadoPor: user.uid });
      setInvitacionCreada({
        id,
        nombre,
        email,
        rol,
        vence: new Date(Date.now() + INVITACION_DIAS * 24 * 60 * 60 * 1000),
        link: linkInvitacion(club.id, id),
      });
      setNuevaInvitacion(invitacionVacia());
      toast.success("Invitación creada");
      await recargarEquipo().catch((err) => console.error("Error al recargar las invitaciones:", err));
    } catch (err) {
      console.error("Error al crear la invitación:", err);
      toast.error("No pudimos crear la invitación. Intentá de nuevo.");
    }
    setCreandoInvitacion(false);
  };

  const handleCancelarInvitacion = async (inv) => {
    const ok = await confirmar({
      titulo: "¿Cancelar la invitación?",
      mensaje: `${inv.nombre || inv.email} ya no va a poder aceptarla.`,
      confirmText: "Cancelar invitación",
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelarInvitacion(club.id, inv.id);
      setInvitaciones((prev) => prev.filter((i) => i.id !== inv.id));
      if (invitacionCreada?.id === inv.id) setInvitacionCreada(null);
      toast.success("Invitación cancelada");
    } catch (err) {
      console.error("Error al cancelar la invitación:", err);
      toast.error("No pudimos cancelar la invitación. Intentá de nuevo.");
    }
  };

  // ----- Equipo: miembros -----

  const actualizarLocal = (uid, cambios) =>
    setStaff((prev) => prev.map((s) => (s.id === uid ? { ...s, ...cambios } : s)));

  const olvidarDescuentoEditado = (uid) =>
    setDescuentoEditado((prev) => {
      const resto = { ...prev };
      delete resto[uid];
      return resto;
    });

  const guardarStaff = async (s, cambios, mensajeOk) => {
    setGuardandoStaff(s.id);
    try {
      await actualizarStaff(club.id, s.id, cambios);
      actualizarLocal(s.id, cambios);
      toast.success(mensajeOk);
    } catch (err) {
      console.error("Error al actualizar el equipo:", err);
      toast.error("No pudimos guardar el cambio. Intentá de nuevo.");
    }
    setGuardandoStaff(null);
  };

  // Cambiar el rol vuelve permisos y descuento al preset (lo hace el servicio; acá se refleja igual)
  const handleCambiarRol = async (s, rol) => {
    if (!rol || rol === s.rol) return;
    setGuardandoStaff(s.id);
    try {
      await cambiarRolStaff(club.id, s.id, rol);
      actualizarLocal(s.id, { rol, permisos: permisosDeRol(rol), descuentoMax: descuentoMaxDeRol(rol) });
      olvidarDescuentoEditado(s.id);
      toast.success("Rol actualizado");
    } catch (err) {
      console.error("Error al cambiar el rol:", err);
      toast.error("No pudimos cambiar el rol. Intentá de nuevo.");
    }
    setGuardandoStaff(null);
  };

  const handleToggleActivo = (s) => {
    const activo = s.activo === false;
    return guardarStaff(s, { activo }, activo ? "Acceso activado" : "Acceso desactivado");
  };

  const handleTogglePermiso = (s, id) => {
    const actuales = Array.isArray(s.permisos) ? s.permisos : [];
    const permisos = actuales.includes(id) ? actuales.filter((p) => p !== id) : [...actuales, id];
    return guardarStaff(s, { permisos }, "Permisos actualizados");
  };

  const handleBlurDescuento = (s) => {
    const texto = descuentoEditado[s.id];
    if (texto === undefined) return;
    olvidarDescuentoEditado(s.id);
    const n = descuentoValido(texto);
    if (n === null) {
      toast.error("Ingresá un porcentaje entre 0 y 100");
      return;
    }
    if (n === Number(s.descuentoMax || 0)) return;
    guardarStaff(s, { descuentoMax: n }, "Descuento actualizado");
  };

  const handleQuitar = async (s) => {
    const ok = await confirmar({
      titulo: "¿Quitar del equipo?",
      mensaje: `${s.nombre || s.email} va a dejar de tener acceso al panel del club.`,
      confirmText: "Quitar del equipo",
      danger: true,
    });
    if (!ok) return;
    try {
      await quitarStaff(club.id, s.id);
      setStaff((prev) => prev.filter((x) => x.id !== s.id));
      if (permisosAbiertos === s.id) setPermisosAbiertos(null);
      toast.success("Quitado del equipo");
    } catch (err) {
      console.error("Error al quitar del equipo:", err);
      toast.error("No pudimos quitar a esta persona. Intentá de nuevo.");
    }
  };

  const loading = !clubCargado || (!!clubActual && club?.id !== clubActual.id);

  if (loading) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Cargando...</span>
        <div className="flex items-center justify-between mb-4">
          <div className="pd-skeleton h-8 w-48" />
          <div className="pd-skeleton h-11 w-40 rounded-md" />
        </div>
        <div className="pd-skeleton h-11 w-full max-w-2xl mb-6" />
        <div className="pd-skeleton h-80 rounded-lg" />
      </div>
    );
  }

  if (!club) {
    return (
      <Card className="text-center">
        <p className="body-md text-ink-2 m-0">No tenés un club registrado</p>
      </Card>
    );
  }

  if (tabs.length === 0) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Configuración</h1>
        <SinPermiso />
      </div>
    );
  }

  const textoLogo = logoUrl
    ? subiendoLogo
      ? "Subiendo..."
      : "Cambiar logo"
    : subiendoLogo
      ? "Subiendo logo..."
      : "Subir logo del club";

  // Fila del dueño: su cuenta si es quien mira; si lo mira alguien del staff, el email de contacto del club
  const esDueño = clubActual?.rolStaff === "dueño" || (!!club.ownerUid && club.ownerUid === user?.uid);
  const dueño = esDueño
    ? { nombre: perfil?.nombre || user?.displayName || "Dueño", email: user?.email || "" }
    : { nombre: "Dueño", email: club.email || "" };

  // Una fila del equipo (más la fila de permisos cuando está desplegada)
  const filaStaff = (s) => {
    const activo = s.activo !== false;
    const propio = s.id === user?.uid;
    const abierto = permisosAbiertos === s.id;
    const ocupado = guardandoStaff === s.id;
    const bloqueado = ocupado || propio;
    const permisos = Array.isArray(s.permisos) ? s.permisos : [];
    const nombre = s.nombre || s.email || "Sin nombre";
    const claseTd = activo ? "" : "text-ink-3!";
    const idPermisos = `permisos-${s.id}`;
    const Chevron = abierto ? ChevronUp : ChevronDown;
    return (
      <Fragment key={s.id}>
        <tr>
          <td className={claseTd}>
            <div className="flex items-center gap-3">
              <span className="pd-avatar" aria-hidden="true">{iniciales(nombre)}</span>
              <div className="min-w-0">
                <p className="font-semibold m-0">
                  {nombre}
                  {propio && <span className="body-sm text-ink-3 font-normal"> · vos</span>}
                </p>
                <p className="body-sm text-ink-3 m-0 truncate">{s.email}</p>
              </div>
              {!activo && <Badge>Inactivo</Badge>}
            </div>
          </td>
          <td className={claseTd}>
            <Select
              aria-label={`Rol de ${nombre}`}
              value={ROLES_INVITABLES.includes(s.rol) ? s.rol : ""}
              onChange={(e) => handleCambiarRol(s, e.target.value)}
              disabled={bloqueado}
              className="h-9! text-[13px]!"
              wrapperClassName="block min-w-[160px]"
            >
              {!ROLES_INVITABLES.includes(s.rol) && <option value="">{rolLabel(s.rol) || "Sin rol"}</option>}
              {ROLES_INVITABLES.map((rol) => (
                <option key={rol} value={rol}>
                  {rolLabel(rol)}
                </option>
              ))}
            </Select>
          </td>
          <td className={claseTd}>
            <label className={`pd-check ${activo ? "" : "text-ink-3!"}`}>
              <input type="checkbox" checked={activo} onChange={() => handleToggleActivo(s)} disabled={bloqueado} />
              Activo
            </label>
          </td>
          <td className={`num ${claseTd}`}>
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={abierto}
              aria-controls={idPermisos}
              onClick={() => setPermisosAbiertos(abierto ? null : s.id)}
              icon={<Chevron className="pd-icon" size={20} aria-hidden="true" />}
            >
              Permisos
            </Button>
          </td>
        </tr>
        {abierto && (
          <tr id={idPermisos}>
            <td colSpan={4} className="bg-surface-sunken">
              <div className="grid gap-5 py-1">
                {propio && (
                  <p className="pd-help m-0">Tus propios permisos los cambia el dueño u otra persona del equipo.</p>
                )}

                <div>
                  <p className="pd-eyebrow mb-2!">Permisos</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {PERMISOS_FASE_ACTUAL.map((p) => (
                      <label key={p.id} className="pd-check items-start!">
                        <input
                          type="checkbox"
                          checked={permisos.includes(p.id)}
                          onChange={() => handleTogglePermiso(s, p.id)}
                          disabled={bloqueado}
                        />
                        <span>
                          {p.label}
                          <span className="block pd-help">{p.descripcion}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {PERMISOS_BAR.length > 0 && (
                <div>
                  <p className="pd-eyebrow mb-2!">Bar · próximamente</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {PERMISOS_BAR.map((p) => (
                      <label key={p.id} className="pd-check text-ink-3! cursor-not-allowed!">
                        <input type="checkbox" checked={permisos.includes(p.id)} disabled readOnly />
                        {p.label}
                      </label>
                    ))}
                  </div>
                  <p className="pd-help mt-2 m-0">Vienen con el rol; se van a poder ajustar cuando esté el bar.</p>
                </div>
                )}

                <div className="flex flex-wrap items-end justify-between gap-4">
                  <Field label="Descuento máximo %" help="Cuánto puede descontar al cobrar" className="w-44">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      value={descuentoEditado[s.id] ?? String(s.descuentoMax ?? 0)}
                      onChange={(e) => setDescuentoEditado((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      onBlur={() => handleBlurDescuento(s)}
                      disabled={bloqueado}
                    />
                  </Field>
                  <Button variant="ghost" size="sm" onClick={() => handleQuitar(s)} disabled={bloqueado}>
                    Quitar del equipo
                  </Button>
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h1 className="heading-lg m-0">Configuración</h1>
        {puedeConfigurar && (
          <Button variant="primary" onClick={handleGuardar} cargando={guardando ? "Guardando…" : ""}>
            Guardar cambios
          </Button>
        )}
      </div>

      {mensaje && (
        <p role="status" className={`pd-status flex! m-0 mb-4 ${mensaje.includes("Error") ? "pd-status-error" : ""}`}>
          {mensaje.includes("Error") ? (
            <AlertTriangle className="pd-icon" size={20} aria-hidden="true" />
          ) : (
            <Check className="pd-icon" size={20} aria-hidden="true" />
          )}
          {mensaje}
        </p>
      )}

      {/* Tabs (con una sola sección no hace falta el tablist) */}
      {tabs.length > 1 && (
        <Tabs items={tabs} value={tabActiva} onChange={setTab} ariaLabel="Secciones de la configuración" className="mb-6" />
      )}

      {/* Datos del club */}
      {tabActiva === "datos" && (
        <Card>
          <Card.Title className="mb-4!">Datos del club</Card.Title>
          <div className="grid gap-4">
            <Field label="Nombre del club">
              <Input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </Field>
            <Field label="Dirección">
              <Input
                type="text"
                placeholder="Ej: Av. Belgrano 1234"
                value={form.direccion}
                onChange={(e) =>
                  setForm({ ...form, direccion: e.target.value })
                }
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ciudad">
                <Input
                  type="text"
                  value={form.ciudad}
                  onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                />
              </Field>
              <Field label="Provincia">
                <Input
                  type="text"
                  value={form.provincia}
                  onChange={(e) =>
                    setForm({ ...form, provincia: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
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
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
            </div>

            {/* Logo del club */}
            <Field as="div" label="Logo del club">
              <div className="flex items-center gap-4 flex-wrap rounded-lg border border-dashed border-line-strong p-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo del club" className="h-24 max-w-[200px] object-contain rounded-sm" />
                ) : (
                  <span className="grid place-items-center w-24 h-24 rounded-sm bg-surface-sunken">
                    <ImagePlus className="pd-icon-lg text-ink-3" size={24} aria-hidden="true" />
                  </span>
                )}
                <div className="grid gap-1">
                  {esDueño ? (
                    <>
                      <label className="pd-btn cursor-pointer! has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus" aria-disabled={subiendoLogo || undefined}>
                        <Upload className="pd-icon" size={20} aria-hidden="true" />
                        {textoLogo}
                        <input type="file" accept="image/*" onChange={handleSubirLogo} disabled={subiendoLogo} className="sr-only" />
                      </label>
                      <span className="pd-help">PNG, JPG o SVG (máx. 5MB)</span>
                    </>
                  ) : (
                    // El archivo va a Storage, cuyas reglas solo dejan escribir al dueño del club
                    <span className="pd-help">El logo lo cambia el dueño del club.</span>
                  )}
                </div>
              </div>
            </Field>
          </div>
        </Card>
      )}

      {/* Horarios y reservas (el sistema admite cinco tabs como máximo: la seña y los turnos van en una
          segunda tarjeta de esta sección) */}
      {tabActiva === "horarios" && (
        <div className="flex flex-col gap-4">
          <Card>
            <Card.Title className="mb-4!">Horario de atención</Card.Title>
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Hora de apertura">
                  <Input
                    type="time"
                    inputMode="numeric"
                    value={form.horarioApertura}
                    onChange={(e) =>
                      setForm({ ...form, horarioApertura: e.target.value })
                    }
                  />
                </Field>
                <Field label="Hora de cierre">
                  <Input
                    type="time"
                    inputMode="numeric"
                    value={form.horarioCierre}
                    onChange={(e) =>
                      setForm({ ...form, horarioCierre: e.target.value })
                    }
                  />
                </Field>
              </div>

              <Field as="div" label="Días abiertos">
                <Pills
                  multi
                  items={diasSemana.map((dia) => ({ value: dia, label: dia.slice(0, 3) }))}
                  value={form.diasAbiertos}
                  onChange={toggleDia}
                  ariaLabel="Días abiertos"
                />
              </Field>

              <Alert>
                Estos horarios se muestran a los jugadores en el hub de
                canchas. Los horarios específicos de cada cancha se configuran en
                la sección Canchas.
              </Alert>
            </div>
          </Card>

          <Card>
            <Card.Title className="mb-4!">Reservas</Card.Title>
            <div className="grid gap-4">
              <div className="grid gap-3">
                <Field as="div" label="Seña">
                  <Pills
                    items={tiposSeña}
                    value={form.señaTipo}
                    onChange={(tipo) => {
                      setForm({ ...form, señaTipo: tipo });
                      setErrorSeña("");
                    }}
                    ariaLabel="Tipo de seña"
                  />
                </Field>

                {form.señaTipo === "porcentaje" && (
                  <Field label="Porcentaje" help="Del total de la reserva" error={errorSeña}>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej: 30"
                      value={form.señaValor}
                      onChange={(e) => {
                        setForm({ ...form, señaValor: e.target.value });
                        setErrorSeña("");
                      }}
                    />
                  </Field>
                )}

                {form.señaTipo === "monto" && (
                  <Field label="Monto" help={formatPrecio(form.señaValor)} error={errorSeña}>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej: 5000"
                      value={form.señaValor}
                      onChange={(e) => {
                        setForm({ ...form, señaValor: e.target.value });
                        setErrorSeña("");
                      }}
                    />
                  </Field>
                )}

                <p className="pd-help m-0">
                  Se informa al reservar; se cobra en el club. En la próxima etapa se cobra online.
                </p>
              </div>

              <Field label="Turnos seguidos por reserva" help="Cuántas horas seguidas puede tomar un jugador en una reserva">
                <Select
                  value={form.maxTurnosPorReserva}
                  onChange={(e) =>
                    setForm({ ...form, maxTurnosPorReserva: Number(e.target.value) })
                  }
                >
                  {opcionesTurnos.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>
        </div>
      )}

      {/* Redes sociales */}
      {tabActiva === "redes" && (
        <Card>
          <Card.Title className="mb-4!">Redes sociales</Card.Title>
          <div className="grid gap-4">
            <Field label="Instagram">
              <Input
                type="text"
                placeholder="@tuclub"
                value={form.instagram}
                onChange={(e) =>
                  setForm({ ...form, instagram: e.target.value })
                }
              />
            </Field>
            <Field label="Facebook">
              <Input
                type="text"
                placeholder="facebook.com/tuclub"
                value={form.facebook}
                onChange={(e) => setForm({ ...form, facebook: e.target.value })}
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                type="text"
                inputMode="tel"
                placeholder="Ej: +54 385 1234567"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </Field>
            <Field label="Sitio web">
              <Input
                type="text"
                placeholder="www.tuclub.com"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </Field>
          </div>
        </Card>
      )}

      {/* Facturación */}
      {tabActiva === "facturacion" && (
        <Card>
          <Card.Title className="mb-4!">Datos de facturación</Card.Title>
          <div className="grid gap-4">
            <Field label="Razón social">
              <Input
                type="text"
                value={form.razonSocial}
                onChange={(e) =>
                  setForm({ ...form, razonSocial: e.target.value })
                }
              />
            </Field>
            <Field label="CUIT">
              <Input
                type="text"
                placeholder="Ej: 30-12345678-9"
                value={form.cuit}
                onChange={(e) => setForm({ ...form, cuit: e.target.value })}
              />
            </Field>
            <Field label="CBU">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="22 dígitos"
                value={form.cbu}
                onChange={(e) => setForm({ ...form, cbu: e.target.value })}
              />
            </Field>
            <Field label="Alias CBU">
              <Input
                type="text"
                placeholder="Ej: CLUB.PADEL.SANTIAGO"
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
              />
            </Field>
            <Field label="Titular de la cuenta">
              <Input
                type="text"
                value={form.titularCuenta}
                onChange={(e) =>
                  setForm({ ...form, titularCuenta: e.target.value })
                }
              />
            </Field>

            <Alert>
              Estos datos se usan para generar comprobantes y recibir pagos
              de inscripciones y reservas. Mantenelos actualizados.
            </Alert>
          </div>
        </Card>
      )}
      {tabActiva === "facturacion" && (
        <Card className="mt-4">
          <Card.Title className="mb-1!">Tickets del bar</Card.Title>
          <p className="body-sm text-ink-2 mt-0 mb-4">Lo que se imprime arriba y abajo de cada ticket de venta y cierre de caja. Son comprobantes de consumo, no facturas.</p>
          <div className="grid gap-4">
            <Field label="Encabezado" help={`Si queda vacío se imprime el nombre del club${form.nombre ? ` (${form.nombre})` : ""}.`}>
              <Input type="text" value={form.ticketEncabezado} onChange={(e) => setForm({ ...form, ticketEncabezado: e.target.value })} maxLength={60} placeholder={form.nombre || "Nombre del club"} />
            </Field>
            <Field label="Alias para transferencias" help="Se imprime como “Transferencias: …” en cada ticket. Dejalo vacío si no querés mostrarlo.">
              <Input type="text" value={form.ticketAlias} onChange={(e) => setForm({ ...form, ticketAlias: e.target.value })} maxLength={60} placeholder={form.alias || "Ej: CLUB.PADEL.SANTIAGO"} />
            </Field>
            <Field label="Pie" help="La última línea del ticket.">
              <Input type="text" value={form.ticketPie} onChange={(e) => setForm({ ...form, ticketPie: e.target.value })} maxLength={80} placeholder="Gracias por venir" />
            </Field>
          </div>
        </Card>
      )}

      {/* Pagos: la cuenta de Mercado Pago del club (la conecta solo el dueño; los tokens nunca llegan al navegador) */}
      {tabActiva === "pagos" && (
        <Card className="mb-4">
          <Card.Row className="items-start!">
            <div>
              <Card.Title className="mb-1!">Mercado Pago</Card.Title>
              <p className="body-sm text-ink-2 mt-0 mb-0">Los pagos van directo a tu cuenta de Mercado Pago: la parte de cada jugador desde el celular, la seña al reservar y el QR del mostrador.</p>
            </div>
            {clubConectadoMp(clubActual) ? (
              <span className="pd-badge-group">
                <Badge tone="success" dot>
                  Conectado
                </Badge>
                {(clubActual?.mercadoPago?.esPrueba || clubActual?.mercadoPago?.liveMode === false) && <Badge tone="warning">Modo prueba</Badge>}
              </span>
            ) : (
              <Badge>Sin conectar</Badge>
            )}
          </Card.Row>
          {clubConectadoMp(clubActual) ? (
            <>
              {/* Grilla propia (no pd-dl auto-fill): cada dato en su celda, el nombre de la cuenta no pisa la fecha */}
              <dl className="m-0 mt-4 grid gap-4 sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="pd-eyebrow m-0">Cuenta</dt>
                  <dd className="m-0 mt-1 font-semibold break-all">{clubActual.mercadoPago.nickname || clubActual.mercadoPago.userId || "—"}</dd>
                  {clubActual.mercadoPago.nickname && clubActual.mercadoPago.userId && <dd className="m-0 body-sm text-ink-3 pd-tnum">ID {clubActual.mercadoPago.userId}</dd>}
                </div>
                <div className="min-w-0">
                  <dt className="pd-eyebrow m-0">Conectada</dt>
                  <dd className="m-0 mt-1 font-semibold pd-tnum">{clubActual.mercadoPago.conectadoEn ? formatFechaHoraArg(clubActual.mercadoPago.conectadoEn) : "—"}</dd>
                  <dd className="m-0 body-sm text-ink-3">hora argentina</dd>
                </div>
                <div className="min-w-0">
                  <dt className="pd-eyebrow m-0">Comisión Padely</dt>
                  <dd className="m-0 mt-1 font-semibold pd-tnum">{comisionPct(clubActual).toLocaleString("es-AR")} %</dd>
                  <dd className="m-0 body-sm text-ink-3">sobre cada pago · según tu plan</dd>
                </div>
              </dl>
              {(clubActual?.mercadoPago?.esPrueba || clubActual?.mercadoPago?.liveMode === false) && <Alert className="mt-4">Cuenta de prueba de Mercado Pago{clubActual?.mercadoPago?.esPrueba ? " (usuario de prueba)" : ""}: los pagos son de prueba. Para cobrar de verdad, conectá la cuenta real del club.</Alert>}
              {esDueño ? (
                <div className="pd-btn-group mt-4">
                  <Button variant="ghost" onClick={desconectarMp} cargando={mpOcupado ? "Desconectando…" : ""}>
                    Desconectar
                  </Button>
                </div>
              ) : (
                <p className="pd-help mt-4 mb-0">Solo el dueño del club puede desconectar la cuenta.</p>
              )}
            </>
          ) : esDueño ? (
            <div className="mt-4 flex flex-col gap-3">
              <Alert>Vas a entrar a Mercado Pago con la cuenta del club y autorizar a Padely a crear cobros a tu nombre. Padely nunca ve tu contraseña ni guarda datos de tarjetas.</Alert>
              <Button variant="primary" className="self-start" onClick={conectarMp} cargando={mpOcupado ? "Abriendo Mercado Pago…" : ""}>
                Conectar Mercado Pago
              </Button>
            </div>
          ) : (
            <p className="pd-help mt-4 mb-0">Solo el dueño del club puede conectar Mercado Pago.</p>
          )}
        </Card>
      )}

      {/* Equipo: invitaciones y staff del club (se guardan al momento, no con "Guardar cambios") */}
      {tabActiva === "equipo" && (
        <div className="flex flex-col gap-4">
          {!equipoCargado ? (
            <div aria-busy="true">
              <span className="sr-only">Cargando...</span>
              <div className="pd-skeleton h-64 rounded-lg mb-4" />
              <div className="pd-skeleton h-40 rounded-lg" />
            </div>
          ) : (
            <>
              {/* Invitar (P3-9: las cuentas del equipo son PRO) */}
              {!planConPro ? (
                <Alert tone="warning">
                  <strong>Las cuentas para tu equipo son parte del plan PRO.</strong> Las personas que ya están siguen viéndose acá, pero no podés invitar a nadie nuevo.{" "}
                  <Link to="/admin/plan" className="underline font-semibold">
                    Ver Mi plan
                  </Link>
                </Alert>
              ) : (
              <Card as="form" onSubmit={handleCrearInvitacion} noValidate>
                <Card.Title className="mb-4!">Invitar a alguien</Card.Title>
                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Nombre" error={erroresInvitacion.nombre}>
                      <Input
                        type="text"
                        placeholder="Nombre y apellido"
                        autoComplete="off"
                        value={nuevaInvitacion.nombre}
                        onChange={(e) => {
                          setNuevaInvitacion({ ...nuevaInvitacion, nombre: e.target.value });
                          setErroresInvitacion({ ...erroresInvitacion, nombre: "" });
                        }}
                      />
                    </Field>
                    <Field label="Email" help="Con el que entra a Padely" error={erroresInvitacion.email}>
                      <Input
                        type="email"
                        placeholder="email@ejemplo.com"
                        autoComplete="off"
                        value={nuevaInvitacion.email}
                        onChange={(e) => {
                          setNuevaInvitacion({ ...nuevaInvitacion, email: e.target.value });
                          setErroresInvitacion({ ...erroresInvitacion, email: "" });
                        }}
                      />
                    </Field>
                  </div>
                  <Field
                    label="Rol"
                    help={
                      <>
                        {ROLES_INVITABLES.map((rol) => (
                          <span key={rol} className="block">
                            <strong className="text-ink-2">{rolLabel(rol)}:</strong> {ROLES[rol].descripcion}
                          </span>
                        ))}
                      </>
                    }
                  >
                    <Select
                      value={nuevaInvitacion.rol}
                      onChange={(e) => setNuevaInvitacion({ ...nuevaInvitacion, rol: e.target.value })}
                    >
                      {ROLES_INVITABLES.map((rol) => (
                        <option key={rol} value={rol}>
                          {rolLabel(rol)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div>
                    {/* El primary de la pantalla es "Guardar cambios"; si no está, lo es este */}
                    <Button
                      type="submit"
                      variant={puedeConfigurar ? "secondary" : "primary"}
                      cargando={creandoInvitacion ? "Creando…" : ""}
                    >
                      Crear invitación
                    </Button>
                  </div>
                </div>
              </Card>
              )}

              {/* La invitación recién creada: el enlace para compartir */}
              {invitacionCreada && (
                <Card>
                  <Card.Title className="mb-4!">Invitación para {invitacionCreada.nombre}</Card.Title>
                  <dl className="pd-dl">
                    <div>
                      <dt>Email</dt>
                      <dd className="break-all">{invitacionCreada.email}</dd>
                    </div>
                    <div>
                      <dt>Rol</dt>
                      <dd>
                        <Badge>{rolLabel(invitacionCreada.rol)}</Badge>
                      </dd>
                    </div>
                    <div className="col-span-full">
                      <dt>Enlace</dt>
                      <dd className="break-all">{invitacionCreada.link}</dd>
                    </div>
                  </dl>
                  <div className="pd-btn-group mt-4">
                    <Button
                      icon={<Copy className="pd-icon" size={20} aria-hidden="true" />}
                      onClick={() => copiarEnlace(invitacionCreada.link)}
                    >
                      Copiar enlace
                    </Button>
                    <a
                      className="pd-btn"
                      href={`https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp(invitacionCreada.nombre, club.nombre, invitacionCreada.link))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Enviar por WhatsApp
                    </a>
                    <Button variant="ghost" onClick={() => setInvitacionCreada(null)}>
                      Listo
                    </Button>
                  </div>
                  <p className="pd-help mt-3 m-0">
                    Vence el {formatVence(invitacionCreada.vence)}. Solo puede aceptarla la cuenta de Padely con el
                    email {invitacionCreada.email}.
                  </p>
                </Card>
              )}

              {/* Invitaciones pendientes */}
              <div className="pd-table-wrap">
                <div className="pd-table-head">
                  <h3>
                    Invitaciones pendientes
                    {invitaciones.length > 0 && <span className="pd-count">{invitaciones.length}</span>}
                  </h3>
                </div>
                {invitaciones.length === 0 ? (
                  <p className="body-sm text-ink-2 px-4 pb-4 m-0">No hay invitaciones pendientes.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="pd-table">
                      <thead>
                        <tr>
                          <th>Persona</th>
                          <th>Rol</th>
                          <th>Vence</th>
                          <th className="num">
                            <span className="sr-only">Acciones</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {invitaciones.map((inv) => (
                          <tr key={inv.id}>
                            <td>
                              <p className="font-semibold m-0">{inv.nombre || inv.email}</p>
                              <p className="body-sm text-ink-3 m-0">{inv.email}</p>
                            </td>
                            <td>
                              <Badge>{rolLabel(inv.rol)}</Badge>
                            </td>
                            <td>
                              <span className="inline-flex items-center gap-2 pd-tnum">
                                {formatVence(inv.vence)}
                                {inv.vencida && <Badge tone="warning">Vencida</Badge>}
                              </span>
                            </td>
                            <td className="num">
                              <div className="pd-btn-group justify-end">
                                <Button size="sm" onClick={() => copiarEnlace(linkInvitacion(club.id, inv.id))}>
                                  Copiar enlace
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleCancelarInvitacion(inv)}>
                                  Cancelar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Equipo */}
              <div className="pd-table-wrap">
                <div className="pd-table-head">
                  <h3>
                    Equipo
                    <span className="pd-count">{staff.length + 1}</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="pd-table">
                    <thead>
                      <tr>
                        <th>Persona</th>
                        <th>Rol</th>
                        <th>Acceso</th>
                        <th className="num">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Dueño: sin documento de staff, todos los permisos, sin acciones */}
                      <tr>
                        <td>
                          <div className="flex items-center gap-3">
                            <span className="pd-avatar" aria-hidden="true">{iniciales(dueño.nombre)}</span>
                            <div className="min-w-0">
                              <p className="font-semibold m-0">{dueño.nombre}</p>
                              <p className="body-sm text-ink-3 m-0 truncate">
                                {dueño.email || "La cuenta que registró el club"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge tone="court">Dueño</Badge>
                        </td>
                        <td className="text-ink-3!">Siempre</td>
                        <td className="num" />
                      </tr>
                      {staff.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-ink-2!">
                            Todavía no invitaste a nadie. Creá la primera invitación arriba.
                          </td>
                        </tr>
                      ) : (
                        staff.map(filaStaff)
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Roles: qué trae cada preset */}
              <Card>
                <Card.Title className="mb-4!">Roles</Card.Title>
                <dl className="pd-dl">
                  {ROLES_INVITABLES.map((rol) => (
                    <div key={rol}>
                      <dt>{rolLabel(rol)}</dt>
                      <dd>{ROLES[rol].descripcion}</dd>
                      <dd>
                        <span className="block body-sm text-ink-3 mt-1">
                          {permisosDelPreset(rol) || "Sin permisos en el panel todavía"} · Descuento máximo{" "}
                          {ROLES[rol].descuentoMax}%
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <Alert className="mt-4">
                  <strong>Cambiar el rol vuelve los permisos y el descuento al preset.</strong> Después podés
                  ajustarlos uno por uno desde "Permisos".
                </Alert>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
