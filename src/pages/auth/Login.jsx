import { useState } from "react";
import {
  loginUser,
  loginWithGoogle,
  getUserData,
} from "../../services/authService";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const redirigirSegunRol = async (user) => {
    try {
      const data = await getUserData(user.uid);
      if (data && data.role) {
        if (data.role.includes("club")) {
          navigate("/admin");
        } else if (data.role.includes("organizador")) {
          navigate("/org");
        } else {
          navigate("/inicio");
        }
      } else {
        navigate("/inicio");
      }
    } catch {
      navigate("/inicio");
    }
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
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      await redirigirSegunRol(user);
    } catch {
      setError("Error al iniciar sesión con Google");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md border border-slate-200">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-green-600 rounded-xl flex items-center justify-center shadow-md shadow-green-900/20">
            <span className="text-white font-bold text-lg">P</span>
          </div>
          <span className="text-slate-800 font-bold text-2xl tracking-tight">
            Padely
          </span>
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
