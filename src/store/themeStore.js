import { create } from "zustand";

// Tema del design system: "light" = Día (paneles de club y organizador), "dark" = Noche (jugadores y páginas
// públicas). Cada layout fija su tema por defecto con setDefaultTheme; "padely-theme" en localStorage guarda
// SOLO la elección explícita del usuario (el toggle), que siempre gana sobre el default.
const CLAVE = "padely-theme";

function leerExplicito() {
  try {
    const v = localStorage.getItem(CLAVE);
    // Migración: un "light" o "dark" guardado por el toggle viejo también cuenta como elección explícita
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function aplicar(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

const explicitInicial = leerExplicito();

const useThemeStore = create((set, get) => ({
  explicit: explicitInicial, // "light" | "dark" | null (nunca eligió)
  defaultTheme: "light", // lo fija el layout montado
  theme: explicitInicial ?? "light", // tema efectivo: explícito, o el default del layout
  // Aplica explícito ?? default a <html>. Lo llaman los layouts al montar y cuando cambia la elección explícita.
  setDefaultTheme: (nuevoDefault) => {
    const defaultTheme = nuevoDefault === "dark" ? "dark" : "light";
    const theme = get().explicit ?? defaultTheme;
    aplicar(theme);
    set({ defaultTheme, theme });
  },
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      try {
        localStorage.setItem(CLAVE, next);
      } catch {
        // sin localStorage: la elección vale solo para esta visita
      }
      aplicar(next);
      return { explicit: next, theme: next };
    }),
  initTheme: () => {
    aplicar(get().theme);
  },
}));

export default useThemeStore;
