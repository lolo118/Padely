import { Link } from "react-router-dom";
import { BadgeCheck, BarChart3, ChefHat, LayoutDashboard, LayoutGrid, Package, ReceiptText, Settings, ShoppingCart, TrendingUp, Trophy, Wallet } from "lucide-react";
import PanelLayout from "./PanelLayout";
import { useEffect } from "react";
import { useAuthStore } from "../../store/authStore";
import Alert from "../ui/Alert";
import { armarAudioConGesto } from "../pos/sonido";
import { estadoPlan } from "../../utils/planes";
import { formatFechaLarga } from "../../utils/formatDate";

// Cada ítem lleva los permisos que lo habilitan (alguno alcanza); "Hoy" es para todo el que entra al panel.
// pro: true = sección del plan PRO (P3-9): en FREE se ve con candado y abre la pantalla "Disponible en PRO".
const navItems = [
  { to: "/admin", label: "Hoy", icon: LayoutDashboard, end: true },
  { to: "/admin/torneos", label: "Torneos", icon: Trophy, permisos: ["gestionarTorneos"] },
  { to: "/admin/canchas", label: "Canchas", icon: LayoutGrid, permisos: ["gestionarReservas", "tarifas"] },
  { to: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3, permisos: ["verReportes"] },
  { to: "/admin/configuracion", label: "Configuración", icon: Settings, permisos: ["configurarClub", "gestionarStaff"] },
  { to: "/admin/plan", label: "Mi plan", icon: BadgeCheck, permisos: ["configurarClub"] },
  // Grupo Bar (el título se ve si alguno de sus ítems se ve)
  { seccion: "Bar", permisos: ["vender", "cobrarTurnos", "pedidos", "abrirCaja", "cerrarCaja", "cerrarCajaAjena", "verCajasCerradas", "editarProductos", "cargarStock", "importar", "verReportes"] },
  { to: "/admin/bar/vender", label: "Vender", icon: ShoppingCart, permisos: ["vender"], pro: true },
  { to: "/admin/bar/cuentas", label: "Cuentas", icon: ReceiptText, permisos: ["cobrarTurnos", "vender"], pro: true },
  { to: "/admin/bar/barra", label: "Barra", icon: ChefHat, permisos: ["pedidos"], pro: true },
  { to: "/admin/bar/caja", label: "Caja", icon: Wallet, permisos: ["abrirCaja", "cerrarCaja", "cerrarCajaAjena", "verCajasCerradas"], pro: true },
  { to: "/admin/bar/productos", label: "Productos", icon: Package, permisos: ["editarProductos", "cargarStock", "importar"], pro: true },
  { to: "/admin/bar/reportes", label: "Reportes", icon: TrendingUp, permisos: ["verReportes"], pro: true },
];

export default function ClubLayout() {
  const suspendido = useAuthStore((s) => s.clubActual?.suspendido === true);
  const club = useAuthStore((s) => s.clubActual);
  const puede = useAuthStore((s) => s.puede);
  const plan = club ? estadoPlan(club) : null;
  const items = navItems.map((item) => (item.pro && plan && !plan.pro ? { ...item, bloqueado: true } : item));
  // El aviso sonoro de la Barra necesita un gesto del usuario: el primer clic en el panel lo arma
  useEffect(() => {
    armarAudioConGesto();
  }, []);
  const aviso = suspendido ? (
    <Alert tone="danger">
      <strong>Tu club está suspendido.</strong> Escribinos para reactivarlo. Mientras tanto no aparece en la lista de
      clubes y los jugadores no pueden reservar; las reservas que ya tenés siguen acá.
    </Alert>
  ) : null;
  // P3-9: avisos del plan para quien configura el club (dueño o encargado)
  const avisoPlan =
    plan && puede("configurarClub") ? (
      plan.avisoPrueba ? (
        <Alert tone="warning">
          <strong>Tu prueba termina el {formatFechaLarga(plan.vence)}.</strong> Elegí tu plan para seguir usando el bar, la caja y las cuentas del equipo.{" "}
          <Link to="/admin/plan" className="underline font-semibold">
            Ver Mi plan
          </Link>
        </Alert>
      ) : plan.enGracia ? (
        <Alert tone="warning">
          <strong>Tu plan PRO venció el {formatFechaLarga(plan.vence)}.</strong> Tenés hasta el {formatFechaLarga(plan.graciaHasta)} para pagar sin perder el bar.{" "}
          <Link to="/admin/plan" className="underline font-semibold">
            Ver Mi plan
          </Link>
        </Alert>
      ) : null
    ) : null;
  return <PanelLayout rol="Club" inicio="/admin" items={items} aviso={aviso || avisoPlan} />;
}
