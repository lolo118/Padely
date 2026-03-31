import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthChange, getUserData } from "./services/authService";
import { useAuthStore } from "./store/authStore";
import useThemeStore from "./store/themeStore";
import Inicio from "./pages/Inicio";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

import PlayerLayout from "./components/layouts/PlayerLayout";
import ClubLayout from "./components/layouts/ClubLayout";

import Hub from "./pages/Hub";
import ClubPublico from "./pages/ClubPublico";
import Torneos from "./pages/Torneos";
import DetalleTorneoPublico from "./pages/DetalleTorneoPublico";
import Noticias from "./pages/Noticias";
import Marketplace from "./pages/Marketplace";
import Perfil from "./pages/Perfil";

import AdminTorneos from "./pages/admin/Torneos";
import CrearTorneo from "./pages/admin/CrearTorneo";
import DetalleTorneo from "./pages/admin/DetalleTorneo";
import AdminCanchas from "./pages/admin/Canchas";
import AdminEstadisticas from "./pages/admin/Estadisticas";
import AdminConfiguracion from "./pages/admin/Configuracion";
import Dashboard from "./pages/admin/Dashboard";
import AceptarInvitacion from "./pages/AceptarInvitacion";

import OrgLayout from "./components/layouts/OrgLayout";
import OrgDashboard from "./pages/org/OrgDashboard";
import OrgTorneos from "./pages/org/OrgTorneos";
import OrgEntidad from "./pages/org/OrgEntidad";
import OrgEquipo from "./pages/org/OrgEquipo";
import OrgEstadisticas from "./pages/org/OrgEstadisticas";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading)
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ color: "var(--text-muted)" }}
      >
        Cargando...
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  return children;
}

function RoleRoute({ children, allowedRoles }) {
  const { user, loading } = useAuthStore();
  const [userRole, setUserRole] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const verificar = async () => {
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const data = await getUserData(user.uid);
        setUserRole(data?.role || ["jugador"]);
      } catch {
        setUserRole(["jugador"]);
      }
      setChecking(false);
    };
    verificar();
  }, [user]);

  if (loading || checking)
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ color: "var(--text-muted)" }}
      >
        Cargando...
      </div>
    );
  if (!user) return <Navigate to="/login" />;

  const tienePermiso =
    userRole && allowedRoles.some((r) => userRole.includes(r));
  if (!tienePermiso) {
    if (userRole.includes("club")) return <Navigate to="/admin" />;
    if (userRole.includes("organizador")) return <Navigate to="/org" />;
    return <Navigate to="/inicio" />;
  }

  return children;
}

export default function App() {
  const { setUser, setLoading } = useAuthStore();
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    let first = true;
    const unsub = onAuthChange((user) => {
      setUser(user);
      setLoading(false);
      first = false;
    });
    // Si después de 3 segundos no resolvió, parar el loading
    const timeout = setTimeout(() => {
      if (first) setLoading(false);
    }, 3000);
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [setUser, setLoading]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="invitacion/:torneoId/:inscripcionId"
          element={<AceptarInvitacion />}
        />

        {/* Rutas del jugador - accesibles por todos los logueados */}
        <Route
          element={
            <ProtectedRoute>
              <PlayerLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/hub" element={<Hub />} />
          <Route path="/torneos" element={<Torneos />} />
          <Route path="/torneos/:id" element={<DetalleTorneoPublico />} />
          <Route path="/noticias" element={<Noticias />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/club/:id" element={<ClubPublico />} />
        </Route>

        {/* Rutas del admin club - solo clubs */}
        <Route
          path="/admin"
          element={
            <RoleRoute allowedRoles={["club"]}>
              <ClubLayout />
            </RoleRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="torneos" element={<AdminTorneos />} />
          <Route path="torneos/nuevo" element={<CrearTorneo />} />
          <Route path="torneos/:id" element={<DetalleTorneo />} />
          <Route path="canchas" element={<AdminCanchas />} />
          <Route path="estadisticas" element={<AdminEstadisticas />} />
          <Route path="configuracion" element={<AdminConfiguracion />} />
        </Route>

        {/* Rutas del organizador - solo organizadores */}
        <Route
          path="/org"
          element={
            <RoleRoute allowedRoles={["organizador"]}>
              <OrgLayout />
            </RoleRoute>
          }
        >
          <Route index element={<OrgDashboard />} />
          <Route path="torneos" element={<OrgTorneos />} />
          <Route path="torneos/nuevo" element={<CrearTorneo />} />
          <Route path="torneos/:id" element={<DetalleTorneo />} />
          <Route path="estadisticas" element={<OrgEstadisticas />} />
          <Route path="entidad" element={<OrgEntidad />} />
          <Route path="equipo" element={<OrgEquipo />} />
        </Route>

        <Route path="*" element={<Navigate to="/inicio" />} />
      </Routes>
    </BrowserRouter>
  );
}
