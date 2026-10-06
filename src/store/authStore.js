import { create } from "zustand";
import { getUserData } from "../services/authService";

// "club" | "organizador" | "jugador" a partir del array users.role
export const rolDesdePerfil = (perfil) => {
  const roles = perfil?.role || ["jugador"];
  if (roles.includes("club")) return "club";
  if (roles.includes("organizador")) return "organizador";
  return "jugador";
};

export const useAuthStore = create((set, get) => ({
  user: null,
  perfil: null, // documento users/{uid}
  rol: null, // null mientras no se cargó el perfil
  loading: true,
  setUser: (user) => set(user ? { user } : { user: null, perfil: null, rol: null }),
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
}));
