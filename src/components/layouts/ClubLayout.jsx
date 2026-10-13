import { BarChart3, LayoutDashboard, LayoutGrid, Settings, Trophy } from "lucide-react";
import PanelLayout from "./PanelLayout";

const navItems = [
  { to: "/admin", label: "Hoy", icon: LayoutDashboard, end: true },
  { to: "/admin/torneos", label: "Torneos", icon: Trophy },
  { to: "/admin/canchas", label: "Canchas", icon: LayoutGrid },
  { to: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { to: "/admin/configuracion", label: "Configuración", icon: Settings },
];

export default function ClubLayout() {
  return <PanelLayout rol="Club" inicio="/admin" items={navItems} />;
}
