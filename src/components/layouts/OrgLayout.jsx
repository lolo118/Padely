import { useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { BarChart3, Building2, LayoutDashboard, Trophy, Users } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import PanelLayout from "./PanelLayout";
import Alert from "../ui/Alert";

const navItems = [
  { to: "/org", label: "Hoy", icon: LayoutDashboard, end: true },
  { to: "/org/torneos", label: "Torneos", icon: Trophy },
  { to: "/org/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { to: "/org/entidad", label: "Mi entidad", icon: Building2 },
  { to: "/org/equipo", label: "Equipo", icon: Users },
];

export default function OrgLayout() {
  const uid = useAuthStore((s) => s.user?.uid);
  const suspendido = useAuthStore((s) => s.entidadSuspendida);
  const setSuspendido = useAuthStore((s) => s.setEntidadSuspendida);

  // La entidad del organizador (organizers, por ownerUid): si el super-admin la suspendió, se avisa en todo el panel
  useEffect(() => {
    if (!uid) return undefined;
    let vigente = true;
    getDocs(query(collection(db, "organizers"), where("ownerUid", "==", uid)))
      .then((snap) => {
        if (vigente) setSuspendido(snap.docs.some((d) => d.data().suspendido === true));
      })
      .catch((err) => console.error("Error cargando la entidad organizadora:", err));
    return () => {
      vigente = false;
    };
  }, [uid, setSuspendido]);

  const aviso = suspendido ? (
    <Alert tone="danger">
      <strong>Tu entidad está suspendida.</strong> Escribinos para reactivarla. Mientras tanto no podés crear torneos
      nuevos; los que ya tenés siguen visibles.
    </Alert>
  ) : null;
  return <PanelLayout rol="Organizador" inicio="/org" items={navItems} aviso={aviso} />;
}
