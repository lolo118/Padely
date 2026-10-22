import { BarChart3, ChefHat, LayoutDashboard, LayoutGrid, Package, ReceiptText, Settings, ShoppingCart, Trophy, Wallet } from "lucide-react";
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
  // Grupo Bar (el título se ve si alguno de sus ítems se ve)
  { seccion: "Bar", permisos: ["vender", "cobrarTurnos", "pedidos", "abrirCaja", "cerrarCaja", "cerrarCajaAjena", "verCajasCerradas", "editarProductos", "cargarStock", "importar"] },
  { to: "/admin/bar/vender", label: "Vender", icon: ShoppingCart, permisos: ["vender"] },
  { to: "/admin/bar/cuentas", label: "Cuentas", icon: ReceiptText, permisos: ["cobrarTurnos", "vender"] },
  { to: "/admin/bar/barra", label: "Barra", icon: ChefHat, permisos: ["pedidos"] },
  { to: "/admin/bar/caja", label: "Caja", icon: Wallet, permisos: ["abrirCaja", "cerrarCaja", "cerrarCajaAjena", "verCajasCerradas"] },
  { to: "/admin/bar/productos", label: "Productos", icon: Package, permisos: ["editarProductos", "cargarStock", "importar"] },
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
