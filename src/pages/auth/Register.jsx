import { useEffect, useState } from "react";
import { registerUser, loginWithGoogle, getUserData } from "../../services/authService";
import useThemeStore from "../../store/themeStore";
import { useAuthStore } from "../../store/authStore";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { toast } from "../../components/Toast";
import { Button, CategorySelect, Field, Input, Pills, Select, Textarea, Wordmark } from "../../components/ui";
import { NIVELES } from "../../utils/categorias";

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

const TIPOS_VALIDOS = ["jugador", "organizador", "club"];

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

export default function Register() {
  // ?tipo=club|organizador|jugador preselecciona la pestaña (desde la landing)
  const [searchParams] = useSearchParams();
  const tipoInicial = searchParams.get("tipo");
  const [tipo, setTipo] = useState(TIPOS_VALIDOS.includes(tipoInicial) ? tipoInicial : "jugador");
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
  // El select nativo de categoría era required; CategorySelect no lo es, así que el error va bajo el campo
  const [errorNivel, setErrorNivel] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const navigate = useNavigate();
  // El registro abre en Noche; una elección explícita del toggle siempre gana
  const setDefaultTheme = useThemeStore((s) => s.setDefaultTheme);
  const explicit = useThemeStore((s) => s.explicit);
  useEffect(() => {
    setDefaultTheme("dark");
  }, [setDefaultTheme, explicit]);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (tipo === "jugador" && !form.nivel) {
      setErrorNivel("Elegí tu categoría");
      return;
    }
    if (!aceptaTerminos) {
      setError("Tenés que aceptar los Términos y la Política de privacidad para crear la cuenta.");
      return;
    }
    try {
      const nuevoUsuario = await registerUser(form.email, form.password, { tipo, ...form });
      // El store resolvió el club del panel apenas cambió la sesión, quizá antes de que existiera clubs/{id}:
      // se vuelve a resolver ahora que el alta terminó (si el store todavía no vio la sesión, el panel reintenta)
      try {
        const store = useAuthStore.getState();
        await store.refreshPerfil(nuevoUsuario.uid);
        if (store.user?.uid === nuevoUsuario.uid) await store.recargarStaff();
      } catch (err) {
        console.error("Error cargando el club recién creado:", err);
      }
      const vincularRedirect = localStorage.getItem("padely-vincular-redirect");
      if (vincularRedirect) {
        localStorage.removeItem("padely-vincular-redirect");
        navigate(vincularRedirect);
        return;
      }
      if (tipo === "club") {
        navigate("/admin");
      } else if (tipo === "organizador") {
        navigate("/org");
      } else {
        navigate("/inicio");
      }
    } catch (err) {
      console.error("Error al registrarse:", err);
      const msg = err?.code === "auth/email-already-in-use"
        ? "Ese email ya está registrado. Iniciá sesión o usá otro."
        : "Error al registrarse. Verificá los datos.";
      setError(msg);
      toast.error(msg);
    }
  };

  const tipos = [
    { value: "jugador", label: "Jugador" },
    { value: "organizador", label: "Org. de torneos" },
    { value: "club", label: "Club" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4 bg-surface">
      <div className="pd-card w-full max-w-md sm:p-8">
        <div className="flex justify-center mb-6">
          <Wordmark />
        </div>
        <h1 className="heading-md mb-4">Crear cuenta</h1>

        {error && (
          <p className="body-sm text-danger mb-4" role="alert">
            {error}
          </p>
        )}

        <Pills items={tipos} value={tipo} onChange={setTipo} ariaLabel="Tipo de cuenta" className="mb-6" />

        {/* Aceptación de términos: requerida para el formulario y para el registro con Google */}
        <label className="flex items-start gap-2 body-sm text-ink-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={aceptaTerminos}
            onChange={(e) => setAceptaTerminos(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-lime"
            required
          />
          <span>
            Acepto los{" "}
            <Link to="/terminos" target="_blank" rel="noopener noreferrer" className="font-semibold text-lime-text hover:underline">
              Términos
            </Link>{" "}
            y la{" "}
            <Link to="/privacidad" target="_blank" rel="noopener noreferrer" className="font-semibold text-lime-text hover:underline">
              Política de privacidad
            </Link>
          </span>
        </label>

        {/* Registro rápido con Google - solo para jugadores */}
        {tipo === "jugador" && (
          <>
            <Button
              block
              icon={<IconoGoogle />}
              disabled={!aceptaTerminos}
              title={aceptaTerminos ? "" : "Primero aceptá los Términos y la Política de privacidad"}
              onClick={async () => {
                if (!aceptaTerminos) return;
                try {
                  const user = await loginWithGoogle();
                  if (!user) return; // popup bloqueado: sigue por redirect
                  const data = await getUserData(user.uid);
                  if (data) {
                    navigate("/inicio");
                  }
                } catch {
                  setError("Error al registrarse con Google");
                  toast.error("Error al registrarse con Google");
                }
              }}
              className="mb-4 h-auto! min-h-11 py-2 whitespace-normal!"
            >
              Registrarse con Google — rápido y fácil
            </Button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-line" />
              <span className="caption text-ink-3">o completá el formulario</span>
              <div className="flex-1 h-px bg-line" />
            </div>
          </>
        )}

        <form onSubmit={handleRegister} className="flex flex-col gap-3">
          <Field label="Nombre completo">
            <Input type="text" value={form.nombre} onChange={set("nombre")} required />
          </Field>

          {tipo === "jugador" && (
            <>
              <Field label="Provincia">
                <Select value={form.provincia} onChange={set("provincia")} required>
                  <option value="">Seleccioná tu provincia</option>
                  {provincias.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Fecha de nacimiento">
                  <Input type="date" value={form.nacimiento} onChange={set("nacimiento")} required />
                </Field>
                <Field label="Género">
                  <Select value={form.genero} onChange={set("genero")} required>
                    <option value="">Género</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                    <option value="otro">Otro</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Ciudad">
                  <Input
                    type="text"
                    placeholder="Ej: Santiago del Estero"
                    value={form.ciudad}
                    onChange={set("ciudad")}
                    required
                  />
                </Field>
                <Field label="Teléfono">
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder="Ej: 3851234567"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value.replace(/\D/g, "") })}
                  />
                </Field>
              </div>
              <Field as="div" label="Categoría" error={errorNivel}>
                <CategorySelect
                  value={form.nivel}
                  opciones={NIVELES.filter((n) => n !== "Libre")}
                  onChange={(cat) => {
                    setForm({ ...form, nivel: cat });
                    setErrorNivel("");
                  }}
                  aria-label="Categoría"
                />
              </Field>
            </>
          )}

          {(tipo === "organizador" || tipo === "club") && (
            <>
              <Field label={tipo === "organizador" ? "Nombre de la entidad" : "Nombre del club"}>
                <Input
                  type="text"
                  placeholder={tipo === "organizador" ? "Ej: Top Padel Torneos" : undefined}
                  value={form.entidad}
                  onChange={set("entidad")}
                  required
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Provincia">
                  <Select value={form.provincia} onChange={set("provincia")} required>
                    <option value="">Provincia</option>
                    {provincias.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Ciudad">
                  <Input type="text" value={form.ciudad} onChange={set("ciudad")} required />
                </Field>
              </div>
              {tipo === "club" && (
                <Field label="Dirección del club">
                  <Input type="text" value={form.direccion} onChange={set("direccion")} />
                </Field>
              )}
              <Field label="Descripción / bio">
                <Textarea value={form.bio} onChange={set("bio")} rows={3} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="WhatsApp">
                  <Input type="tel" value={form.whatsapp} onChange={set("whatsapp")} />
                </Field>
                <Field label="Teléfono">
                  <Input type="tel" value={form.telefono} onChange={set("telefono")} />
                </Field>
              </div>
              <Field label="Instagram" help="Sin @">
                <Input type="text" value={form.instagram} onChange={set("instagram")} />
              </Field>
              <Field label="Facebook">
                <Input type="text" value={form.facebook} onChange={set("facebook")} />
              </Field>
              <Field label="Sitio web">
                <Input type="url" placeholder="https://…" value={form.website} onChange={set("website")} />
              </Field>
            </>
          )}

          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} required />
          </Field>
          <Field label="Contraseña" help="Mínimo 6 caracteres">
            <Input type="password" value={form.password} onChange={set("password")} required />
          </Field>

          <Button type="submit" variant="primary" block disabled={!aceptaTerminos} className="mt-1">
            Registrarse como {tipo === "organizador" ? "organizador de torneos" : tipo}
          </Button>
        </form>

        <p className="text-center body-sm text-ink-2 mt-6">
          ¿Ya tenés cuenta?{" "}
          <Link to="/login" className="font-semibold text-lime-text hover:underline">
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
