import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthChange } from "./services/authService";
import { useAuthStore } from "./store/authStore";
import useThemeStore from "./store/themeStore";
import Inicio from "./pages/Inicio"; // ✅ Import agregado

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
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Cargando...
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  const { setUser, setLoading } = useAuthStore();
  const { initTheme } = useThemeStore();

  useEffect(() => { initTheme(); }, [initTheme]);

  useEffect(() => {
    const unsub = onAuthChange((user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsub();
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

        <Route element={<ProtectedRoute><PlayerLayout /></ProtectedRoute>}>
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/hub" element={<Hub />} />
          <Route path="/torneos" element={<Torneos />} />
          <Route path="/torneos/:id" element={<DetalleTorneoPublico />} />
          <Route path="/noticias" element={<Noticias />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/club/:id" element={<ClubPublico />} />
        </Route>

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <ClubLayout />
            </ProtectedRoute>
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

        <Route
          path="/org"
          element={
            <ProtectedRoute>
              <OrgLayout />
            </ProtectedRoute>
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
