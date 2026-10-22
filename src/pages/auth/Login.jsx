import { useEffect, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { loginUser, loginWithGoogle } from "../../services/authService";
import { useAuthStore } from "../../store/authStore";
import useThemeStore from "../../store/themeStore";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { toast } from "../../components/Toast";
import { getStaffDe } from "../../services/staffService";
import { Button, Field, Input, Wordmark } from "../../components/ui";

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

// La G de Google en currentColor, como cualquier ícono del sistema (sin colores de marca en hex)
function IconoGoogle() {
  return (
    <svg viewBox="0 0 24 24" className="pd-icon" fill="currentColor" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
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
  const staffDe = useAuthStore((s) => s.staffDe);
  const clubCargado = useAuthStore((s) => s.clubCargado);

  // Ya logueado (por ejemplo al volver del redirect de Google): salimos del login según el rol (el staff de un
  // club, al panel)
  useEffect(() => {
    if (!usuarioActual || usuarioActual.isAnonymous || !rolActual || !clubCargado) return;
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
    const alPanel = rolActual === "club" || staffDe.length > 0;
    navigate(alPanel ? "/admin" : rolActual === "organizador" ? "/org" : "/inicio", { replace: true });
  }, [usuarioActual, rolActual, staffDe, clubCargado, next, navigate]);

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
    // Cargamos el perfil en el store y usamos el rol que queda ahí (única fuente de verdad); el staff de un club
    // entra directo al panel (la membresía se consulta acá porque el store puede no tener el usuario todavía)
    await refreshPerfil(user.uid);
    const rol = useAuthStore.getState().rol;
    let esStaff = false;
    try {
      esStaff = (await getStaffDe(user.uid)).length > 0;
    } catch (err) {
      console.error("Error buscando el equipo del usuario:", err);
    }
    if (rol === "club" || esStaff) navigate("/admin");
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
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-surface">
      <div className="pd-card w-full max-w-md sm:p-8">
        <div className="flex justify-center mb-6">
          <Wordmark />
        </div>
        <h1 className="heading-md text-center mb-4">Iniciar sesión</h1>

        {error && (
          <p className="body-sm text-danger mb-4" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Contraseña">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <button
            type="button"
            onClick={handleOlvide}
            className="self-end -mt-2 body-sm font-semibold! text-lime-text hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </button>
          <Button type="submit" variant="primary" block cargando={loading ? "Ingresando…" : ""}>
            Ingresar
          </Button>
        </form>

        <p className="my-4 text-center caption text-ink-3">o</p>

        <Button block icon={<IconoGoogle />} onClick={handleGoogle} disabled={loading}>
          Continuar con Google
        </Button>

        <p className="text-center body-sm text-ink-2 mt-6">
          ¿No tenés cuenta?{" "}
          <Link to="/register" className="font-semibold text-lime-text hover:underline">
            Registrate
          </Link>
        </p>
      </div>
    </div>
  );
}
