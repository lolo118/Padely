import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { LogOut, Menu, ShieldCheck, Smartphone } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import useThemeStore from "../../store/themeStore";
import ThemeToggle from "../ThemeToggle";
import NotificationBell from "../NotificationBell";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Sidebar from "../ui/Sidebar";
import VerificarEmailAviso from "../VerificarEmailAviso";
import EstadoBanner from "../EstadoBanner";
import { cargarFlags } from "../../services/flagsService";
import { toast } from "../Toast";
import { Wordmark } from "../ui/AppBar";
import { rolLabel } from "../../utils/staff";

async function cerrarSesion() {
  const { signOut } = await import("firebase/auth");
  const { auth } = await import("../../lib/firebase");
  await signOut(auth);
  window.location.href = "/login";
}

// Armazón de los paneles de club y organizador (Día por defecto): pd-sidebar fija en escritorio; debajo de md,
// una barra superior con el botón de menú y la misma pd-sidebar como cajón sobre un pd-backdrop.
// rol: "Club" | "Organizador" · inicio: la ruta del wordmark · items: [{ to, label, icon, end?, permisos?: [ids] }]
// En el panel del club el badge muestra el rol de la persona (Dueño / Encargado / Cajero / Barra) y los ítems se
// filtran por sus permisos (`permisos` = alguno de esos ids alcanza; sin `permisos`, siempre). El staff (no dueño)
// suma "App de jugador" para volver a su app.
export default function PanelLayout({ rol, inicio, items, aviso = null }) {
  const [abierto, setAbierto] = useState(false);
  const { user } = useAuthStore();
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const rolCuenta = useAuthStore((s) => s.rol);
  const staffDe = useAuthStore((s) => s.staffDe);
  const recargarStaff = useAuthStore((s) => s.recargarStaff);
  const puede = useAuthStore((s) => s.puede);
  const esPanelClub = rol === "Club";
  // P3-15 "Ver como": ningún formulario del panel (ni de sus diálogos) se envía en solo lectura
  const soloLectura = esPanelClub && clubActual?.soloLectura === true;
  useEffect(() => {
    if (!soloLectura) return undefined;
    const frenar = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toast.info("Solo lectura: estás viendo el panel como el club");
    };
    document.addEventListener("submit", frenar, true);
    return () => document.removeEventListener("submit", frenar, true);
  }, [soloLectura]);
  // Sin club cargado, el rol sale de la cuenta: dueño si es una cuenta de club, si no el de su primera membresía
  const rolStaff = esPanelClub ? clubActual?.rolStaff || (rolCuenta === "club" ? "dueño" : staffDe[0]?.rol || "encargado") : null;
  const etiquetaRol = esPanelClub ? rolLabel(rolStaff) : rol;
  const tonoRol = esPanelClub && rolStaff === "dueño" ? "court" : "neutral";
  const visibles = items.filter((item) => !item.permisos || item.permisos.some((p) => puede(p)));
  const esSuperAdmin = useAuthStore((s) => s.esSuperAdmin);
  const conApp =
    esPanelClub && rolCuenta !== "club"
      ? [...visibles, { to: "/inicio", label: "App de jugador", icon: Smartphone }]
      : visibles;
  // El panel del super-admin ya lo trae en sus ítems; en los demás paneles se suma solo para el super-admin
  const itemsNav =
    esSuperAdmin && rol !== "Super-admin" ? [...conApp, { to: "/superadmin", label: "Super-admin", icon: ShieldCheck }] : conApp;
  // Si el club no se resolvió (por ejemplo un club recién registrado, o una lectura que falló al arrancar), se
  // reintenta una vez al entrar al panel en vez de dejar la sesión sin club
  // P3-14: los flags de la plataforma (id público de tickets, privacidad migrada, …) quedan cargados para usarlos sin esperar
  useEffect(() => {
    cargarFlags();
  }, []);
  const reintentado = useRef(false);
  useEffect(() => {
    if (!esPanelClub || !clubCargado || clubActual || reintentado.current) return;
    if (rolCuenta !== "club" && staffDe.length === 0) return;
    reintentado.current = true;
    recargarStaff();
  }, [esPanelClub, clubCargado, clubActual, rolCuenta, staffDe, recargarStaff]);
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
        <Badge tone={tonoRol}>{etiquetaRol}</Badge>
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
            rol={etiquetaRol}
            rolTone={tonoRol}
            items={itemsNav}
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
        <Sidebar rol={etiquetaRol} rolTone={tonoRol} items={itemsNav} wordmarkTo={inicio} className="sticky top-0 h-screen overflow-y-auto">
          {pie}
        </Sidebar>
      </div>

      <main className="flex-1 min-w-0 w-full max-w-[1200px] p-4 md:p-6">
        {aviso && <div className="mb-4">{aviso}</div>}
        <EstadoBanner className="mb-4" />
        <VerificarEmailAviso className="mb-4" />
        <Outlet />
      </main>
    </div>
  );
}
