import { create } from "zustand";
import { getUserData } from "../services/authService";
import { getClubByOwner, getClubConfig } from "../services/canchaService";
import { getStaffDe } from "../services/staffService";
import { esSuperAdminUid } from "../services/superadminService";
import { ROLES, puedeCon } from "../utils/staff";

// "club" | "organizador" | "jugador" a partir del array users.role
export const rolDesdePerfil = (perfil) => {
  const roles = perfil?.role || ["jugador"];
  if (roles.includes("club")) return "club";
  if (roles.includes("organizador")) return "organizador";
  return "jugador";
};

// El club que ve el panel (/admin): el propio si la cuenta es de un club (dueño, todos los permisos), si no el
// primer club donde la persona es staff activo (con el rol y los permisos de su documento de staff), o null.
async function resolverClubActual(uid, perfil, staffDe) {
  if (!uid) return null;
  if (rolDesdePerfil(perfil) === "club") {
    const club = await getClubByOwner(uid);
    if (club) {
      return { ...club, rolStaff: "dueño", permisos: [...ROLES["dueño"].permisos], descuentoMax: ROLES["dueño"].descuentoMax };
    }
  }
  const membresia = (staffDe || [])[0];
  if (!membresia) return null;
  const club = await getClubConfig(membresia.clubId);
  if (!club) return null;
  return {
    ...club,
    rolStaff: membresia.rol,
    permisos: [...(membresia.permisos || [])],
    descuentoMax: membresia.descuentoMax || 0,
  };
}

export const useAuthStore = create((set, get) => ({
  user: null,
  perfil: null, // documento users/{uid}
  rol: null, // null mientras no se cargó el perfil
  loading: true,
  // Equipo: clubes donde la persona es staff activo ([{ clubId, rol, permisos, descuentoMax }]) y el club del panel
  staffDe: [],
  clubActual: null,
  clubCargado: false, // true cuando ya se resolvió clubActual para el usuario actual (aunque sea null)
  // Super-admin de la plataforma (superadmins/{uid}); false ante cualquier error
  esSuperAdmin: false,
  // Entidad organizadora suspendida por el super-admin (la carga OrgLayout)
  entidadSuspendida: false,
  setEntidadSuspendida: (v) => set({ entidadSuspendida: !!v }),
  setUser: (user) =>
    set(
      user
        ? { user }
        : { user: null, perfil: null, rol: null, staffDe: [], clubActual: null, clubCargado: false, esSuperAdmin: false, entidadSuspendida: false },
    ),
  setPerfil: (perfil) => set({ perfil: perfil || null, rol: rolDesdePerfil(perfil) }),
  setLoading: (loading) => set({ loading }),
  // Vuelve a leer users/{uid} (después de editar el perfil, subir la foto, etc.)
  refreshPerfil: async (uid) => {
    const id = uid || get().user?.uid;
    if (!id) return null;
    try {
      const perfil = await getUserData(id);
      set({ perfil: perfil || null, rol: rolDesdePerfil(perfil) });
      return perfil;
    } catch (err) {
      console.error("Error cargando el perfil:", err);
      set({ perfil: null, rol: rolDesdePerfil(null) });
      return null;
    }
  },
  // Carga las membresías de staff y resuelve clubActual (se llama después de cargar el perfil, y al aceptar una invitación)
  recargarStaff: async () => {
    const uid = get().user?.uid;
    if (!uid) {
      set({ staffDe: [], clubActual: null, clubCargado: true });
      return null;
    }
    let staffDe = [];
    // Super-admin en paralelo con el equipo: no suma tiempo ni puede trabar el login
    const superAdminP = esSuperAdminUid(uid).catch(() => false);
    try {
      staffDe = await getStaffDe(uid);
    } catch (err) {
      console.error("Error cargando el equipo del que forma parte:", err);
    }
    let clubActual = null;
    try {
      clubActual = await resolverClubActual(uid, get().perfil, staffDe);
    } catch (err) {
      console.error("Error cargando el club del panel:", err);
    }
    const esSuperAdmin = await superAdminP;
    set({ staffDe, clubActual, clubCargado: true, esSuperAdmin });
    return clubActual;
  },
  // Vuelve a leer el documento del club (después de guardar la configuración), conservando rol y permisos
  recargarClub: async () => {
    const actual = get().clubActual;
    if (!actual?.id) return get().recargarStaff();
    try {
      const club = await getClubConfig(actual.id);
      if (!club) return get().recargarStaff();
      const nuevo = { ...club, rolStaff: actual.rolStaff, permisos: actual.permisos, descuentoMax: actual.descuentoMax };
      set({ clubActual: nuevo });
      return nuevo;
    } catch (err) {
      console.error("Error recargando el club:", err);
      return actual;
    }
  },
  // Permisos en el club del panel: el dueño siempre puede; el staff, lo que diga su lista
  puede: (permiso) => {
    const club = get().clubActual;
    if (!club) return false;
    if (club.rolStaff === "dueño") return true;
    return puedeCon(club.permisos, permiso);
  },
}));

// Selectores derivados (no cambian la API del store): staff (no dueño) y acceso al panel del club
export const esStaffDeAlgunClub = (s) => s.staffDe.length > 0;
export const accesoPanelClub = (s) => s.rol === "club" || s.staffDe.length > 0;
