import { BarChart3, LayoutDashboard, LayoutGrid, Settings, Trophy } from "lucide-react";
import PanelLayout from "./PanelLayout";
import { useAuthStore } from "../../store/authStore";
import Alert from "../ui/Alert";

// Cada ítem lleva los permisos que lo habilitan (alguno alcanza); "Hoy" es para todo el que entra al panel
const navItems = [
  { to: "/admin", label: "Hoy", icon: LayoutDashboard, end: true },
  { to: "/admin/torneos", label: "Torneos", icon: Trophy, permisos: ["gestionarTorneos"] },
  { to: "/admin/canchas", label: "Canchas", icon: LayoutGrid, permisos: ["gestionarReservas", "tarifas"] },
  { to: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3, permisos: ["verReportes"] },
  { to: "/admin/configuracion", label: "Configuración", icon: Settings, permisos: ["configurarClub", "gestionarStaff"] },
];

export default function ClubLayout() {
  const suspendido = useAuthStore((s) => s.clubActual?.suspendido === true);
  const aviso = suspendido ? (
    <Alert tone="danger">
      <strong>Tu club está suspendido.</strong> Escribinos para reactivarlo. Mientras tanto no aparece en la lista de
      clubes y los jugadores no pueden reservar; las reservas que ya tenés siguen acá.
    </Alert>
  ) : null;
  return <PanelLayout rol="Club" inicio="/admin" items={navItems} aviso={aviso} />;
}
