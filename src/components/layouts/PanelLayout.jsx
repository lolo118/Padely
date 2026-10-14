import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import useThemeStore from "../../store/themeStore";
import ThemeToggle from "../ThemeToggle";
import NotificationBell from "../NotificationBell";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Sidebar from "../ui/Sidebar";
import { Wordmark } from "../ui/AppBar";

async function cerrarSesion() {
  const { signOut } = await import("firebase/auth");
  const { auth } = await import("../../lib/firebase");
  await signOut(auth);
  window.location.href = "/login";
}

// Armazón de los paneles de club y organizador (Día por defecto): pd-sidebar fija en escritorio; debajo de md,
// una barra superior con el botón de menú y la misma pd-sidebar como cajón sobre un pd-backdrop.
// rol: "Club" | "Organizador" · inicio: la ruta del wordmark · items: [{ to, label, icon, end? }]
export default function PanelLayout({ rol, inicio, items }) {
  const [abierto, setAbierto] = useState(false);
  const { user } = useAuthStore();
  // Los paneles abren en Día; una elección explícita del toggle siempre gana
  const setDefaultTheme = useThemeStore((s) => s.setDefaultTheme);
  const explicit = useThemeStore((s) => s.explicit);
  useEffect(() => {
    setDefaultTheme("light");
  }, [setDefaultTheme, explicit]);

  const pie = (
    <>
      {user?.email && <p className="caption text-ink-3 truncate px-3 pb-2 m-0">{user.email}</p>}
      <div className="flex items-center gap-1">
        <button type="button" onClick={cerrarSesion} className="pd-sidebar-item flex-1">
          <LogOut className="pd-icon" size={20} aria-hidden="true" />
          Salir
        </button>
        <NotificationBell />
        <ThemeToggle />
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-surface md:flex">
      {/* Barra superior, solo debajo de md */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-4 bg-surface-raised border-b border-line">
        <Button
          variant="ghost"
          iconOnly
          aria-label="Abrir menú"
          aria-expanded={abierto}
          aria-controls="menu-panel"
          onClick={() => setAbierto(true)}
          icon={<Menu className="pd-icon" size={20} aria-hidden="true" />}
        />
        <Wordmark to={inicio} className="text-ink! text-[22px]!" />
        <Badge>{rol}</Badge>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
        </div>
      </header>

      {/* Cajón: la pd-sidebar entra sobre el pd-backdrop */}
      {abierto && (
        <div className="pd-backdrop z-40 md:hidden block! p-0!" onClick={() => setAbierto(false)}>
          <Sidebar
            id="menu-panel"
            rol={rol}
            items={items}
            wordmarkTo={inicio}
            onNavigate={() => setAbierto(false)}
            onClick={(e) => e.stopPropagation()}
            className="h-full max-w-[85vw] overflow-y-auto"
          >
            {pie}
          </Sidebar>
        </div>
      )}

      {/* Sidebar fija en escritorio */}
      <div className="hidden md:block shrink-0">
        <Sidebar rol={rol} items={items} wordmarkTo={inicio} className="sticky top-0 h-screen overflow-y-auto">
          {pie}
        </Sidebar>
      </div>

      <main className="flex-1 min-w-0 w-full max-w-[1200px] p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
