import { useEffect, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { loginUser, loginWithGoogle } from "../../services/authService";
import { useAuthStore } from "../../store/authStore";
import useThemeStore from "../../store/themeStore";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { toast } from "../../components/Toast";

// Solo rutas internas para ?next=: se resuelve contra el origen y se exige el mismo origen
// (rechaza "//", barras invertidas y esquemas), y nunca vuelve a /login o /register.
function rutaInternaSegura(valor) {
  if (!valor || typeof valor !== "string" || !valor.startsWith("/") || valor.includes("\\")) return null;
  try {
    const u = new URL(valor, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    if (u.pathname === "/login" || u.pathname === "/register") return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  // El login abre en Noche; una elección explícita del toggle siempre gana
  const setDefaultTheme = useThemeStore((s) => s.setDefaultTheme);
  const explicit = useThemeStore((s) => s.explicit);
  useEffect(() => {
    setDefaultTheme("dark");
  }, [setDefaultTheme, explicit]);
  // ?next=/ruta: volver a la página pública desde la que se pidió iniciar sesión (solo rutas internas)
  const [searchParams] = useSearchParams();
  const next = rutaInternaSegura(searchParams.get("next"));

  const refreshPerfil = useAuthStore((s) => s.refreshPerfil);
  const usuarioActual = useAuthStore((s) => s.user);
  const rolActual = useAuthStore((s) => s.rol);

  // Ya logueado (por ejemplo al volver del redirect de Google): salimos del login según el rol
  useEffect(() => {
    if (!usuarioActual || !rolActual) return;
    // ?next= explícito manda sobre un redirect de vinculación guardado de una visita anterior
    if (next) {
      localStorage.removeItem("padely-vincular-redirect");
      navigate(next, { replace: true });
      return;
    }
    const vincularRedirect = localStorage.getItem("padely-vincular-redirect");
    if (vincularRedirect) {
      localStorage.removeItem("padely-vincular-redirect");
      navigate(vincularRedirect, { replace: true });
      return;
    }
    navigate(rolActual === "club" ? "/admin" : rolActual === "organizador" ? "/org" : "/inicio", { replace: true });
  }, [usuarioActual, rolActual, next, navigate]);

  const redirigirSegunRol = async (user) => {
    if (next) {
      localStorage.removeItem("padely-vincular-redirect");
      navigate(next, { replace: true });
      return;
    }
    const vincularRedirect = localStorage.getItem("padely-vincular-redirect");
    if (vincularRedirect) {
      localStorage.removeItem("padely-vincular-redirect");
      navigate(vincularRedirect);
      return;
    }
    // Cargamos el perfil en el store y usamos el rol que queda ahí (única fuente de verdad)
    await refreshPerfil(user.uid);
    const rol = useAuthStore.getState().rol;
    if (rol === "club") navigate("/admin");
    else if (rol === "organizador") navigate("/org");
    else navigate("/inicio");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { user } = await loginUser(email, password);
      await redirigirSegunRol(user);
    } catch {
      setError("Email o contraseña incorrectos");
      toast.error("Email o contraseña incorrectos");
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      if (!user) return; // popup bloqueado: seguimos por redirect, la página navega a Google
      await redirigirSegunRol(user);
    } catch (err) {
      const msg =
        err?.code === "auth/popup-blocked"
          ? "Tu navegador bloqueó la ventana de Google. Habilitá los pop-ups o ingresá con email y contraseña."
          : err?.code === "auth/popup-closed-by-user"
            ? "Cerraste la ventana de Google antes de terminar."
            : "Error al iniciar sesión con Google";
      setError(msg);
      toast.error(msg);
      setLoading(false);
    }
  };

  const handleOlvide = async () => {
    const mail = email.trim();
    if (!mail) {
      toast.error("Ingresá tu email para restablecer la contraseña");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, mail);
      toast.success("Te enviamos un email para restablecer tu contraseña");
    } catch (err) {
      console.error("Error enviando el reset de contraseña:", err);
      toast.error(
        err?.code === "auth/invalid-email"
          ? "El email no es válido"
          : "No encontramos una cuenta con ese email",
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md border border-slate-200" data-theme="light">
        <div className="flex items-center justify-center mb-6">
          <img src="/logo-dark.png" alt="Padely" className="h-9" />
        </div>
        <h2 className="text-lg font-semibold text-slate-700 mb-4 text-center">
          Iniciar sesión
        </h2>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
          <button
            type="button"
            onClick={handleOlvide}
            className="text-xs text-emerald-600 font-semibold hover:underline self-end -mt-2"
          >
            ¿Olvidaste tu contraseña?
          </button>
          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 text-white py-2.5 rounded-lg font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <div className="my-4 text-center text-slate-400 text-sm">o</div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full border border-slate-300 text-slate-700 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continuar con Google
        </button>

        <p className="text-center text-sm text-slate-500 mt-6">
          ¿No tenés cuenta?{" "}
          <Link
            to="/register"
            className="text-emerald-600 font-semibold hover:underline"
          >
            Registrate
          </Link>
        </p>
      </div>
    </div>
  );
}
