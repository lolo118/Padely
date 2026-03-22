import { useState } from "react";
import { loginUser, loginWithGoogle } from "../../services/authService";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await loginUser(email, password);
      navigate("/");
    } catch {
      setError("Email o contraseña incorrectos");
    }
  };

  const handleGoogle = async () => {
    try {
      await loginWithGoogle();
      navigate("/");
    } catch {
      setError("Error al iniciar sesión con Google");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-green-700 mb-6">
          Padely
        </h1>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">
          Iniciar sesión
        </h2>

        {error && (
          <div className="bg-red-100 text-red-600 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          />
          <button
            type="submit"
            className="bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition"
          >
            Ingresar
          </button>
        </form>

        <div className="my-4 text-center text-gray-400 text-sm">o</div>

        <button
          onClick={handleGoogle}
          className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition"
        >
          Continuar con Google
        </button>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿No tenés cuenta?{" "}
          <Link
            to="/register"
            className="text-green-600 font-semibold hover:underline"
          >
            Registrate
          </Link>
        </p>
      </div>
    </div>
  );
}
