import { useState } from "react";
import { registerUser, loginWithGoogle, getUserData } from "../../services/authService";
import { useNavigate, Link } from "react-router-dom";

const provincias = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

const inputClass =
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const selectClass =
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full bg-white";

export default function Register() {
  const [tipo, setTipo] = useState("jugador");
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    provincia: "",
    nacimiento: "",
    genero: "",
    nivel: "",
    entidad: "",
    telefono: "",
    direccion: "",
    ciudad: "",
    instagram: "",
    facebook: "",
    whatsapp: "",
    website: "",
    bio: "",
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await registerUser(form.email, form.password, { tipo, ...form });
      if (tipo === "club") {
        navigate("/admin");
      } else if (tipo === "organizador") {
        navigate("/org");
      } else {
        navigate("/inicio");
      }
    } catch {
      setError("Error al registrarse. Verificá los datos.");
    }
  };

  const tipos = [
    { value: "jugador", label: "Jugador" },
    { value: "organizador", label: "Org. de Torneos" },
    { value: "club", label: "Club" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8 px-4">
      <div
        className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md"
        data-theme="light"
      >
        <h1 className="text-2xl font-bold text-center text-green-700 mb-6">
          Padely
        </h1>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">
          Crear cuenta
        </h2>

        {error && (
          <div className="bg-red-100 text-red-600 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {tipos.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTipo(t.value)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                tipo === t.value
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Registro rápido con Google - solo para jugadores */}
        {tipo === "jugador" && (
          <>
            <button
              type="button"
              onClick={async () => {
                try {
                  const user = await loginWithGoogle();
                  const data = await getUserData(user.uid);
                  if (data) {
                    navigate("/inicio");
                  }
                } catch {
                  setError("Error al registrarse con Google");
                }
              }}
              className="w-full border-2 border-green-600 text-green-700 py-3 rounded-xl text-sm font-bold hover:bg-green-50 transition flex items-center justify-center gap-3 mb-4"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Registrarse con Google — Rápido y fácil
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-xs text-gray-400">o completá el formulario</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>
          </>
        )}

        <form onSubmit={handleRegister} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Tu nombre completo"
            value={form.nombre}
            onChange={set("nombre")}
            className={inputClass}
            required
          />

          {tipo === "jugador" && (
            <>
              <select
                value={form.provincia}
                onChange={set("provincia")}
                className={selectClass}
                required
              >
                <option value="">Seleccioná tu provincia</option>
                {provincias.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">
                    Fecha de nacimiento
                  </label>
                  <input
                    type="date"
                    value={form.nacimiento}
                    onChange={set("nacimiento")}
                    className={inputClass}
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">
                    Género
                  </label>
                  <select
                    value={form.genero}
                    onChange={set("genero")}
                    className={selectClass}
                    required
                  >
                    <option value="">Género</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>
              <select
                value={form.nivel}
                onChange={set("nivel")}
                className={selectClass}
                required
              >
                <option value="">Categoría</option>
                <option value="8va">8va</option>
                <option value="7ma">7ma</option>
                <option value="6ta">6ta</option>
                <option value="5ta">5ta</option>
                <option value="4ta">4ta</option>
                <option value="3era">3era</option>
                <option value="2da">2da</option>
                <option value="1era">1era</option>
              </select>
            </>
          )}

          {(tipo === "organizador" || tipo === "club") && (
            <>
              <input
                type="text"
                placeholder={
                  tipo === "organizador"
                    ? "Nombre de la entidad (ej: Top Padel Torneos)"
                    : "Nombre del club"
                }
                value={form.entidad}
                onChange={set("entidad")}
                className={inputClass}
                required
              />
              <div className="flex gap-2">
                <select
                  value={form.provincia}
                  onChange={set("provincia")}
                  className={selectClass}
                  required
                >
                  <option value="">Provincia</option>
                  {provincias.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Ciudad"
                  value={form.ciudad}
                  onChange={set("ciudad")}
                  className={inputClass}
                  required
                />
              </div>
              {tipo === "club" && (
                <input
                  type="text"
                  placeholder="Dirección del club"
                  value={form.direccion}
                  onChange={set("direccion")}
                  className={inputClass}
                />
              )}
              <textarea
                placeholder="Descripción / bio"
                value={form.bio}
                onChange={set("bio")}
                rows={3}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="WhatsApp"
                  value={form.whatsapp}
                  onChange={set("whatsapp")}
                  className={inputClass}
                />
                <input
                  type="tel"
                  placeholder="Teléfono"
                  value={form.telefono}
                  onChange={set("telefono")}
                  className={inputClass}
                />
              </div>
              <input
                type="text"
                placeholder="Instagram (sin @)"
                value={form.instagram}
                onChange={set("instagram")}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Facebook"
                value={form.facebook}
                onChange={set("facebook")}
                className={inputClass}
              />
              <input
                type="url"
                placeholder="Sitio web (https://...)"
                value={form.website}
                onChange={set("website")}
                className={inputClass}
              />
            </>
          )}

          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={set("email")}
            className={inputClass}
            required
          />
          <input
            type="password"
            placeholder="Contraseña (mínimo 6 caracteres)"
            value={form.password}
            onChange={set("password")}
            className={inputClass}
            required
          />

          <button
            type="submit"
            className="bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition mt-1"
          >
            Registrarse como{" "}
            {tipo === "organizador" ? "organizador de torneos" : tipo}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Ya tenés cuenta?{" "}
          <Link
            to="/login"
            className="text-green-600 font-semibold hover:underline"
          >
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
