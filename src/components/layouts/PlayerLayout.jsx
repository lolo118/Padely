import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { Building2, Home, LayoutGrid, LogOut, Menu, ShieldCheck, Trophy, User, X } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import useThemeStore from "../../store/themeStore";
import ThemeToggle from "../ThemeToggle";
import NotificationBell from "../NotificationBell";
import InstallBanner from "../InstallBanner";
import VerificarEmailAviso from "../VerificarEmailAviso";
import AppBar from "../ui/AppBar";
import BottomNav from "../ui/BottomNav";
import Button from "../ui/Button";

// Los cuatro destinos del jugador en teléfonos (nunca cinco): "Mis reservas" vive en Inicio y en Perfil
const navItems = [
  { to: "/inicio", label: "Inicio", icon: Home },
  { to: "/clubes", label: "Canchas", icon: LayoutGrid },
  { to: "/torneos", label: "Torneos", icon: Trophy },
  { to: "/perfil", label: "Perfil", icon: User },
];

// El menú completo (las siete secciones), en todos los anchos
const menuItems = [
  { to: "/inicio", label: "Inicio" },
  { to: "/clubes", label: "Canchas disponibles" },
  { to: "/mis-reservas", label: "Mis reservas" },
  { to: "/torneos", label: "Torneos" },
  { to: "/noticias", label: "Noticias" },
  { to: "/marketplace", label: "Tienda" },
  { to: "/perfil", label: "Mi perfil" },
];

async function cerrarSesion() {
  const { signOut } = await import("firebase/auth");
  const { auth } = await import("../../lib/firebase");
  await signOut(auth);
  window.location.href = "/login";
}

export default function PlayerLayout() {
  const { user, perfil } = useAuthStore();
  const rol = useAuthStore((s) => s.rol);
  const staffDe = useAuthStore((s) => s.staffDe);
  // Staff de un club (sin ser dueño): el menú suma el acceso al panel del club
  const esStaff = rol !== "club" && staffDe.length > 0;
  const esSuperAdmin = useAuthStore((s) => s.esSuperAdmin);
  const [menuOpen, setMenuOpen] = useState(false);
  // Los jugadores abren en Noche; una elección explícita del toggle siempre gana
  const setDefaultTheme = useThemeStore((s) => s.setDefaultTheme);
  const explicit = useThemeStore((s) => s.explicit);
  useEffect(() => {
    setDefaultTheme("dark");
  }, [setDefaultTheme, explicit]);
  // Nombre y foto salen del perfil cargado en el store (users/{uid})
  const nombre = perfil?.nombre || user?.email?.split("@")[0] || "Jugador";
  const fotoUrl = perfil?.fotoUrl || null;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppBar wordmarkTo="/inicio" className="sticky top-0 z-30">
        {/* En escritorio la navegación inferior se pliega en la barra */}
        <nav className="hidden md:flex items-center gap-1 mr-2" aria-label="Principal">
          {navItems.map((item) => {
            const Icono = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className="pd-btn pd-btn-ghost pd-btn-sm">
                <Icono className="pd-icon" size={20} aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <NotificationBell />
        <ThemeToggle />
        <Link to="/perfil" className="pd-btn pd-btn-ghost pd-btn-icon" aria-label={`Mi perfil, ${nombre}`}>
          {fotoUrl ? (
            <img src={fotoUrl} alt="" className="w-6 h-6 rounded-pill object-cover" />
          ) : (
            <span className="w-6 h-6 rounded-pill bg-surface-sunken text-ink font-display font-bold text-[13px] grid place-items-center" aria-hidden="true">
              {nombre.charAt(0).toUpperCase()}
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          iconOnly
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
          aria-controls="menu-jugador"
          onClick={() => setMenuOpen((v) => !v)}
          icon={menuOpen ? <X className="pd-icon" size={20} aria-hidden="true" /> : <Menu className="pd-icon" size={20} aria-hidden="true" />}
        />
      </AppBar>

      {/* Menú con las siete secciones */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
          <div
            id="menu-jugador"
            className="fixed top-16 right-4 z-30 w-[min(320px,calc(100vw-2rem))] pd-card p-2! flex flex-col gap-1"
          >
            {menuItems.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className="pd-sidebar-item">
                {item.label}
              </NavLink>
            ))}
            {esStaff && (
              <NavLink to="/admin" onClick={() => setMenuOpen(false)} className="pd-sidebar-item">
                <Building2 className="pd-icon" size={20} aria-hidden="true" />
                Panel del club
              </NavLink>
            )}
            {esSuperAdmin && (
              <NavLink to="/superadmin" onClick={() => setMenuOpen(false)} className="pd-sidebar-item">
                <ShieldCheck className="pd-icon" size={20} aria-hidden="true" />
                Super-admin
              </NavLink>
            )}
            <div className="border-t border-line mt-1 pt-1">
              <button type="button" onClick={cerrarSesion} className="pd-sidebar-item w-full text-danger!">
                <LogOut className="pd-icon" size={20} aria-hidden="true" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main */}
      <main className="flex-1 w-full max-w-[960px] mx-auto px-4 sm:px-6 pt-5 pb-24 md:pb-10">
        <VerificarEmailAviso className="mb-4" />
        <Outlet />
      </main>

      {/* Banner de instalación (solo móvil, solo si el navegador lo permite) */}
      <InstallBanner />

      {/* Navegación inferior, solo en teléfonos */}
      <BottomNav items={navItems} className="fixed bottom-0 left-0 right-0 z-20 md:hidden!" />
    </div>
  );
}
