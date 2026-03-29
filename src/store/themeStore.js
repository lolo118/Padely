import { create } from "zustand";

const useThemeStore = create((set) => ({
  theme: localStorage.getItem("padely-theme") || "light",
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("padely-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return { theme: next };
    }),
  initTheme: () =>
    set((state) => {
      document.documentElement.setAttribute("data-theme", state.theme);
      return state;
    }),
}));

export default useThemeStore;
