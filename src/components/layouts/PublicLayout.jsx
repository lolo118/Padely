import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import useThemeStore from "../../store/themeStore";
import PlayerLayout from "./PlayerLayout";
import ThemeToggle from "../ThemeToggle";

// Layout de las páginas públicas (/torneos, /torneos/:id, /club/:id, /clubes):
// con sesión se ve exactamente igual que hoy (PlayerLayout); sin sesión, un header con Ingresar / Registrarse.
export default function PublicLayout() {
  const { user, loading } = useAuthStore();
  const location = useLocation();
  // Las páginas públicas abren en Noche; una elección explícita del toggle siempre gana
  const setDefaultTheme = useThemeStore((s) => s.setDefaultTheme);
  const explicit = useThemeStore((s) => s.explicit);
  useEffect(() => {
    setDefaultTheme("dark");
  }, [setDefaultTheme, explicit]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        Cargando...
      </div>
    );
  }

  if (user) return <PlayerLayout />;

  const next = encodeURIComponent(location.pathname + location.search);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      <header className="bg-slate-800/95 backdrop-blur-lg px-5 py-3 flex items-center justify-between sticky top-0 z-30 shadow-lg shadow-slate-900/10">
        <Link to="/" className="flex items-center">
          <img src="/logo.png" alt="Padely" className="h-7" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Link
            to={`/login?next=${next}`}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-200 hover:text-white hover:bg-slate-700/60 transition"
          >
            Ingresar
          </Link>
          <Link
            to="/register"
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Registrarse
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 pt-5 pb-10 max-w-4xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
