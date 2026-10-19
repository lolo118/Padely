import { ArrowLeft, Building2, LayoutDashboard, Trophy, Users } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import PanelLayout from "./PanelLayout";

// Panel del super-admin: Resumen, Clubes, Organizadores, Usuarios y "Volver a la app" (el inicio de la cuenta)
export default function SuperAdminLayout() {
  const rol = useAuthStore((s) => s.rol);
  const staffDe = useAuthStore((s) => s.staffDe);
  const inicioApp = rol === "club" || staffDe.length > 0 ? "/admin" : rol === "organizador" ? "/org" : "/inicio";
  const items = [
    { to: "/superadmin", label: "Resumen", icon: LayoutDashboard, end: true },
    { to: "/superadmin/clubes", label: "Clubes", icon: Building2 },
    { to: "/superadmin/organizadores", label: "Organizadores", icon: Trophy },
    { to: "/superadmin/usuarios", label: "Usuarios", icon: Users },
    { to: inicioApp, label: "Volver a la app", icon: ArrowLeft },
  ];
  return <PanelLayout rol="Super-admin" inicio="/superadmin" items={items} />;
}
