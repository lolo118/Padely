import { BarChart3, Building2, LayoutDashboard, Trophy, Users } from "lucide-react";
import PanelLayout from "./PanelLayout";

const navItems = [
  { to: "/org", label: "Hoy", icon: LayoutDashboard, end: true },
  { to: "/org/torneos", label: "Torneos", icon: Trophy },
  { to: "/org/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { to: "/org/entidad", label: "Mi entidad", icon: Building2 },
  { to: "/org/equipo", label: "Equipo", icon: Users },
];

export default function OrgLayout() {
  return <PanelLayout rol="Organizador" inicio="/org" items={navItems} />;
}
