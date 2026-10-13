import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { onAuthChange, getUserData, handleRedirectResult } from "./services/authService";
import { useAuthStore } from "./store/authStore";
import useThemeStore from "./store/themeStore";

// Layouts (static — shell components needed for rendering)
import PlayerLayout from "./components/layouts/PlayerLayout";
import ClubLayout from "./components/layouts/ClubLayout";
import OrgLayout from "./components/layouts/OrgLayout";
import PublicLayout from "./components/layouts/PublicLayout";
import { Toaster } from "./components/Toast";
import { ConfirmHost } from "./components/ConfirmDialog";

// Auth
const Login = lazy(() => import("./pages/auth/Login"));
const Register = lazy(() => import("./pages/auth/Register"));

// Player pages
const Inicio = lazy(() => import("./pages/Inicio"));
const Hub = lazy(() => import("./pages/Hub"));
const MisReservas = lazy(() => import("./pages/MisReservas"));
const ClubPublico = lazy(() => import("./pages/ClubPublico"));
const Torneos = lazy(() => import("./pages/Torneos"));
const DetalleTorneoPublico = lazy(() => import("./pages/DetalleTorneoPublico"));
const Noticias = lazy(() => import("./pages/Noticias"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Perfil = lazy(() => import("./pages/Perfil"));

// Admin (Club) pages
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminTorneos = lazy(() => import("./pages/admin/Torneos"));
const CrearTorneo = lazy(() => import("./pages/admin/CrearTorneo"));
const DetalleTorneo = lazy(() => import("./pages/admin/DetalleTorneo"));
const AdminCanchas = lazy(() => import("./pages/admin/Canchas"));
const AdminEstadisticas = lazy(() => import("./pages/admin/Estadisticas"));
const AdminConfiguracion = lazy(() => import("./pages/admin/Configuracion"));

// Org pages
const OrgDashboard = lazy(() => import("./pages/org/OrgDashboard"));
const OrgTorneos = lazy(() => import("./pages/org/OrgTorneos"));
const OrgEntidad = lazy(() => import("./pages/org/OrgEntidad"));
const OrgEquipo = lazy(() => import("./pages/org/OrgEquipo"));
const OrgEstadisticas = lazy(() => import("./pages/org/OrgEstadisticas"));

// Landing pública en /
const Landing = lazy(() => import("./pages/Landing"));
const Terminos = lazy(() => import("./pages/Terminos"));
const Privacidad = lazy(() => import("./pages/Privacidad"));

// Misc
const AceptarInvitacion = lazy(() => import("./pages/AceptarInvitacion"));
const VincularJugador = lazy(() => import("./pages/VincularJugador"));
const NoEncontrado = lazy(() => import("./pages/NoEncontrado"));

function LoadingFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface">
      <div className="w-10 h-10 border-2 border-line-strong border-t-ink rounded-pill animate-spin mb-3" aria-hidden="true" />
      <p className="body-sm text-ink-3">Cargando…</p>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center body-md text-ink-3">
        Cargando...
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  return children;
}

// El rol vive en el store (se carga junto con el perfil en onAuthChange); rol === null significa "todavía cargando"
function RoleRoute({ allowedRoles, children }) {
  const { user, loading, rol } = useAuthStore();

  if (loading) return <div className="min-h-screen flex items-center justify-center body-md text-ink-3">Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (!rol) return <div className="min-h-screen flex items-center justify-center body-md text-ink-3">Cargando...</div>;
  if (!allowedRoles.includes(rol)) {
    if (rol === "club") return <Navigate to="/admin" />;
    if (rol === "organizador") return <Navigate to="/org" />;
    return <Navigate to="/inicio" />;
  }
  return children;
}

function RedirigirPorRol() {
  const { user, rol } = useAuthStore();

  if (user && !rol) return <div className="min-h-screen flex items-center justify-center body-md text-ink-3">Cargando...</div>;
  if (rol === "club") return <Navigate to="/admin" />;
  if (rol === "organizador") return <Navigate to="/org" />;
  return <Inicio />;
}

// Link neutro a un torneo (/t/:id): manda a la vista que corresponde según el rol
function RedirigirTorneo() {
  const { id } = useParams();
  const location = useLocation();
  const { user, loading, rol } = useAuthStore();

  if (loading || (user && !rol)) {
    return <div className="min-h-screen flex items-center justify-center body-md text-ink-3">Cargando...</div>;
  }
  if (!user) {
    // Después del login volvemos a este mismo link
    localStorage.setItem("padely-vincular-redirect", location.pathname);
    return <Navigate to="/login" />;
  }
  if (rol === "club") return <Navigate to={`/admin/torneos/${id}`} replace />;
  if (rol === "organizador") return <Navigate to={`/org/torneos/${id}`} replace />;
  return <Navigate to={`/torneos/${id}`} replace />;
}

export default function App() {
  const { setUser, setPerfil, setLoading } = useAuthStore();
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    let first = true;
    // Si venimos de un login con Google por redirect (popup bloqueado), lo completamos acá
    handleRedirectResult().catch((err) => console.error("Error en el redirect de Google:", err));

    const unsub = onAuthChange(async (user) => {
      setUser(user);
      if (user) {
        // El perfil (users/{uid}) y el rol quedan en el store antes de dar por terminada la carga
        try {
          setPerfil(await getUserData(user.uid));
        } catch (err) {
          console.error("Error cargando el perfil:", err);
          setPerfil(null);
        }
      }
      setLoading(false);
      first = false;
    });
    const timeout = setTimeout(() => {
      if (first) setLoading(false);
    }, 3000);
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [setUser, setPerfil, setLoading]);

  return (
    <BrowserRouter>
      <Toaster />
      <ConfirmHost />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="invitacion/:torneoId/:inscripcionId"
            element={<AceptarInvitacion />}
          />
          <Route path="vincular/:torneoId/:parejaId/:posicion" element={<VincularJugador />} />
          <Route path="/t/:id" element={<RedirigirTorneo />} />

          {/* Páginas públicas: sin sesión se ven con el header Ingresar/Registrarse; con sesión, igual que hoy (PlayerLayout) */}
          <Route element={<PublicLayout />}>
            <Route path="/clubes" element={<Hub />} />
            <Route path="/torneos" element={<Torneos />} />
            <Route path="/torneos/:id" element={<DetalleTorneoPublico />} />
            <Route path="/club/:id" element={<ClubPublico />} />
            <Route path="/terminos" element={<Terminos />} />
            <Route path="/privacidad" element={<Privacidad />} />
          </Route>
          {/* Alias viejo del hub de canchas */}
          <Route path="/hub" element={<Navigate to="/clubes" replace />} />

          {/* Rutas del jugador - accesibles por todos los logueados */}
          <Route
            element={
              <ProtectedRoute>
                <PlayerLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/inicio" element={<RedirigirPorRol />} />
            <Route path="/mis-reservas" element={<MisReservas />} />
            <Route path="/noticias" element={<Noticias />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/perfil" element={<Perfil />} />
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

          <Route path="*" element={<NoEncontrado />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
