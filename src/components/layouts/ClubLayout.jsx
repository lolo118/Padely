import { BarChart3, LayoutDashboard, LayoutGrid, Settings, Trophy } from "lucide-react";
import PanelLayout from "./PanelLayout";

// Cada ítem lleva los permisos que lo habilitan (alguno alcanza); "Hoy" es para todo el que entra al panel
const navItems = [
  { to: "/admin", label: "Hoy", icon: LayoutDashboard, end: true },
  { to: "/admin/torneos", label: "Torneos", icon: Trophy, permisos: ["gestionarTorneos"] },
  { to: "/admin/canchas", label: "Canchas", icon: LayoutGrid, permisos: ["gestionarReservas", "tarifas"] },
  { to: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3, permisos: ["verReportes"] },
  { to: "/admin/configuracion", label: "Configuración", icon: Settings, permisos: ["configurarClub", "gestionarStaff"] },
];

export default function ClubLayout() {
  return <PanelLayout rol="Club" inicio="/admin" items={navItems} />;
}
