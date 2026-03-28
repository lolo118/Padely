import { useState } from "react";
import { registerUser } from "../../services/authService";
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
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md">
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
                <option value="">Nivel de juego</option>
                <option value="principiante">Principiante</option>
                <option value="intermedio">Intermedio</option>
                <option value="avanzado">Avanzado</option>
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
