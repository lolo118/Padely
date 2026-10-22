import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import useThemeStore from "../../store/themeStore";
import PlayerLayout from "./PlayerLayout";
import ThemeToggle from "../ThemeToggle";
import AppBar from "../ui/AppBar";

// Layout de las páginas públicas (/torneos, /torneos/:id, /club/:id, /clubes):
// con sesión se ve exactamente igual que hoy (PlayerLayout); sin sesión, la misma barra con "Ingresar".
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
    return <div className="min-h-screen flex items-center justify-center body-md text-ink-3">Cargando…</div>;
  }

  // Una sesión anónima (QR de la cancha) ve la barra pública con "Ingresar", no la app del jugador
  if (user && !user.isAnonymous) return <PlayerLayout />;

  const next = encodeURIComponent(location.pathname + location.search);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppBar wordmarkTo="/" className="sticky top-0 z-30">
        <ThemeToggle />
        <Link to={`/login?next=${next}`} className="pd-btn pd-btn-ghost">
          Ingresar
        </Link>
      </AppBar>

      <main className="flex-1 w-full max-w-[960px] mx-auto px-4 sm:px-6 pt-5 pb-10">
        <Outlet />
      </main>
    </div>
  );
}
