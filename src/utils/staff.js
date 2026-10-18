// Staff del club: permisos y roles, definidos una sola vez (las reglas de Firestore preguntan `permiso in permisos`).
// clubs/{c}/staff/{uid} = { uid, nombre, email, rol, permisos (lista EFECTIVA: preset del rol ± ajustes), descuentoMax,
// activo, invitacionId, invitadoPor, creadoEn, actualizadoEn }. El dueño (clubs/{c}.ownerUid) no tiene documento:
// tiene todos los permisos, siempre.
// Los permisos de la fase 3 (bar, caja) existen desde ahora pero ninguna pantalla los usa todavía (faseActual: false).

export const PERMISOS = [
  // Fase 2: tienen pantalla hoy
  { id: "gestionarReservas", label: "Reservas y turnos fijos", descripcion: "Grilla, reservas manuales, aprobar y cancelar, turnos fijos", grupo: "Canchas", faseActual: true },
  { id: "tarifas", label: "Canchas y precios", descripcion: "Crear y editar canchas, horarios y precios", grupo: "Canchas", faseActual: true },
  { id: "gestionarTorneos", label: "Torneos como sede", descripcion: "Aceptar o rechazar torneos que piden jugar en el club", grupo: "Torneos", faseActual: true },
  { id: "verReportes", label: "Estadísticas", descripcion: "Ingresos, ocupación y reservas por período", grupo: "Club", faseActual: true },
  { id: "configurarClub", label: "Configuración del club", descripcion: "Datos, horarios, seña y facturación", grupo: "Club", faseActual: true },
  { id: "gestionarStaff", label: "Equipo: invitar y cambiar roles", descripcion: "Invitar gente, cambiar roles y permisos", grupo: "Club", faseActual: true },
  // Fase 3: bar y caja (sin pantalla todavía)
  { id: "vender", label: "Vender", descripcion: "Cobrar en el bar", grupo: "Bar", faseActual: false },
  { id: "cobrarTurnos", label: "Cobrar turnos", descripcion: "Cobrar la cuenta del turno", grupo: "Bar", faseActual: false },
  { id: "abrirCaja", label: "Abrir caja", descripcion: "Abrir su propia caja", grupo: "Bar", faseActual: false },
  { id: "cerrarCaja", label: "Cerrar caja", descripcion: "Cerrar su propia caja", grupo: "Bar", faseActual: false },
  { id: "cerrarCajaAjena", label: "Cerrar la caja de otro", descripcion: "Cerrar una caja abierta por otra persona", grupo: "Bar", faseActual: false },
  { id: "verCajasCerradas", label: "Ver cajas cerradas", descripcion: "Historial de cajas", grupo: "Bar", faseActual: false },
  { id: "anularVenta", label: "Anular ventas", descripcion: "Anular una venta ya cobrada", grupo: "Bar", faseActual: false },
  { id: "pedidos", label: "Pedidos", descripcion: "La pantalla de pedidos del bar", grupo: "Bar", faseActual: false },
  { id: "editarProductos", label: "Editar productos", descripcion: "Alta y cambios de productos y precios del bar", grupo: "Bar", faseActual: false },
  { id: "cargarStock", label: "Cargar stock", descripcion: "Ingresos de mercadería", grupo: "Bar", faseActual: false },
  { id: "importar", label: "Importar", descripcion: "Importar productos y stock desde un archivo", grupo: "Bar", faseActual: false },
];

export const PERMISOS_FASE_ACTUAL = PERMISOS.filter((p) => p.faseActual);
export const PERMISOS_BAR = PERMISOS.filter((p) => !p.faseActual);
const TODOS = PERMISOS.map((p) => p.id);

// Presets por rol. `descuentoMax` del dueño nunca se guarda: se usa para mostrar.
export const ROLES = {
  "dueño": {
    label: "Dueño",
    descripcion: "La cuenta que registró el club: puede todo",
    permisos: TODOS,
    descuentoMax: 100,
  },
  encargado: {
    label: "Encargado",
    descripcion: "Maneja reservas, turnos fijos, torneos y estadísticas; no cambia precios ni la configuración",
    permisos: TODOS.filter((id) => !["gestionarStaff", "configurarClub", "tarifas"].includes(id)),
    descuentoMax: 100,
  },
  cajero: {
    label: "Cajero",
    descripcion: "Reservas y, cuando esté el bar, ventas y caja",
    permisos: ["gestionarReservas", "vender", "cobrarTurnos", "abrirCaja", "cerrarCaja", "anularVenta", "pedidos"],
    descuentoMax: 10,
  },
  barra: {
    label: "Barra",
    descripcion: "Solo la pantalla de pedidos del bar (próximamente)",
    permisos: ["pedidos"],
    descuentoMax: 0,
  },
};

// Roles que se pueden invitar (el dueño no se invita: es quien registró el club)
export const ROLES_INVITABLES = ["encargado", "cajero", "barra"];

export const INVITACION_DIAS = 7;

export const permisosDeRol = (rol) => [...(ROLES[rol]?.permisos || [])];
export const rolLabel = (rol) => ROLES[rol]?.label || String(rol || "");
export const descuentoMaxDeRol = (rol) => (Number.isFinite(ROLES[rol]?.descuentoMax) ? ROLES[rol].descuentoMax : 0);
export const puedeCon = (permisos, id) => Array.isArray(permisos) && permisos.includes(id);

// El link que se comparte para aceptar una invitación
export const linkInvitacion = (clubId, invId) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/equipo/invitacion/${clubId}/${invId}`;
