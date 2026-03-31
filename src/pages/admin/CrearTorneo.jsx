import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { crearTorneo } from "../../services/torneoService";

const inputClass =
  "themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const selectClass =
  "themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const labelClass = "text-xs font-semibold mb-1 block";
const tipClass =
  "text-xs text-blue-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mt-2";

const provinciasArgentina = [
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

const categoriasGenero = [
  { value: "masculino", label: "Masculino" },
  { value: "femenino", label: "Femenino" },
  { value: "mixto", label: "Mixto" },
];

const categoriasNivel = [
  "8va",
  "Suma 15",
  "7ma",
  "Suma 13",
  "6ta",
  "Suma 11",
  "5ta",
  "Suma 9",
  "4ta",
  "Suma 7",
  "3era",
  "Suma 5",
  "2da",
  "Suma 3",
  "1era",
  "Libre",
];

const formatoDescripcion = {
  mini: "1 set por partido, fase de grupos → eliminación directa",
  normal: "3 sets por partido, fase de grupos → eliminación directa",
  liga: "Sistema de liga con fechas y tabla de posiciones general",
  eliminacion: "Eliminación directa desde la primera ronda",
};

export default function CrearTorneo() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    formato: "mini",
    categoriaGenero: [],
    categoriasConfig: {},
    maxParejas: 8,
    inscripcion: 0,
    inscripcionIncluye: "",
    parejasQueAvanzan: 2,
    sede: "",
    direccionSede: "",
    instagramSede: "",
    facebookSede: "",
    ciudad: "",
    provincia: "",
    fechaInicio: "",
    fechaFin: "",
    descripcion: "",
    sets: 1,
    gamesPorSet: 6,
    superTiebreak: false,
    inscripcionAbierta: true,
    reglamento: "",
    premios: "",
    instagramOrganizador: "",
    facebookOrganizador: "",
    whatsappOrganizador: "",
    administradores: [{ nombre: "", whatsapp: "" }],
  });

  const set = (field) => (e) => {
    const val =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    let updatedForm = { ...form, [field]: val };

    // Auto-configurar sets según formato
    if (field === "formato") {
      if (val === "mini") {
        updatedForm.sets = 1;
        updatedForm.gamesPorSet = 6;
      } else if (val === "normal") {
        updatedForm.sets = 3;
        updatedForm.gamesPorSet = 6;
      }
    }

    setForm(updatedForm);
  };

  const toggleGenero = (genero) => {
    const current = form.categoriaGenero;
    let updated;
    if (current.includes(genero)) {
      updated = current.filter((g) => g !== genero);
      const newConfig = { ...form.categoriasConfig };
      delete newConfig[genero];
      setForm({
        ...form,
        categoriaGenero: updated,
        categoriasConfig: newConfig,
      });
    } else {
      if (current.length >= 3) return;
      updated = [...current, genero];
      setForm({
        ...form,
        categoriaGenero: updated,
        categoriasConfig: { ...form.categoriasConfig, [genero]: [] },
      });
    }
  };

  const toggleNivel = (genero, nivel) => {
    const current = form.categoriasConfig[genero] || [];
    let updated;
    if (current.includes(nivel)) {
      updated = current.filter((n) => n !== nivel);
    } else {
      updated = [...current, nivel];
    }
    setForm({
      ...form,
      categoriasConfig: { ...form.categoriasConfig, [genero]: updated },
    });
  };

  const agregarAdmin = () => {
    setForm({
      ...form,
      administradores: [...form.administradores, { nombre: "", whatsapp: "" }],
    });
  };

  const actualizarAdmin = (index, field, value) => {
    const nuevos = [...form.administradores];
    nuevos[index] = { ...nuevos[index], [field]: value };
    setForm({ ...form, administradores: nuevos });
  };

  const eliminarAdmin = (index) => {
    if (form.administradores.length <= 1) return;
    setForm({
      ...form,
      administradores: form.administradores.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.categoriaGenero.length === 0) {
      setError("Seleccioná al menos una categoría género.");
      return;
    }

    const algunNivelVacio = form.categoriaGenero.some(
      (g) => !form.categoriasConfig[g] || form.categoriasConfig[g].length === 0,
    );
    if (algunNivelVacio) {
      setError("Seleccioná al menos una categoría nivel para cada género.");
      return;
    }

    setLoading(true);
    try {
      const id = await crearTorneo(form, user.uid);
      navigate(`/admin/torneos/${id}`);
    } catch {
      setError("Error al crear el torneo. Intentá de nuevo.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-xl hover:opacity-70"
          style={{ color: "var(--text-muted)" }}
        >
          ←
        </button>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Crear torneo</h1>
      </div>

      {error && (
        <div className="bg-red-100 text-red-600 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Información general */}
        <div className="themed-card rounded-2xl p-6 border">
          <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Información general
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Nombre del torneo</label>
              <input
                type="text"
                placeholder="Ej: Torneo Apertura 2025"
                value={form.nombre}
                onChange={set("nombre")}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Descripción (opcional)</label>
              <textarea
                placeholder="Información adicional del torneo..."
                value={form.descripcion}
                onChange={set("descripcion")}
                rows={3}
                className="themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full resize-none"
              />
            </div>

            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Categoría Género (hasta 3)</label>
              <div className="flex gap-2">
                {categoriasGenero.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => toggleGenero(cat.value)}
                    className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                      form.categoriaGenero.includes(cat.value)
                        ? "bg-green-600 text-white"
                        : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {form.categoriaGenero.map((genero) => (
              <div key={genero}>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                  Categoría Nivel —{" "}
                  {genero.charAt(0).toUpperCase() + genero.slice(1)}
                </label>
                <div className="flex flex-wrap gap-2">
                  {categoriasNivel.map((nivel) => (
                    <button
                      key={nivel}
                      type="button"
                      onClick={() => toggleNivel(genero, nivel)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        (form.categoriasConfig[genero] || []).includes(nivel)
                          ? "bg-green-600 text-white"
                          : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]"
                      }`}
                    >
                      {nivel}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Formato */}
        <div className="themed-card rounded-2xl p-6 border">
          <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Formato</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Tipo de torneo</label>
              <select
                value={form.formato}
                onChange={set("formato")}
                className={selectClass}
              >
                <option value="mini">Mini torneo</option>
                <option value="normal">Torneo normal</option>
                <option value="liga">Liga</option>
                <option value="eliminacion">Eliminación directa</option>
              </select>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {formatoDescripcion[form.formato]}
              </p>
            </div>

            {(form.formato === "mini" || form.formato === "normal") && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Sets por partido</label>
                  <select
                    value={form.sets}
                    onChange={set("sets")}
                    className={selectClass}
                  >
                    {form.formato === "mini" && (
                      <option value={1}>1 set</option>
                    )}
                    <option value={3}>3 sets</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Games por set</label>
                  <div className="themed-input rounded-lg px-4 py-2 text-sm" style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}>
                    6 games
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    Siempre 6 games por set
                  </p>
                </div>
              </div>
            )}

            {(form.formato === "mini" || form.formato === "normal") && (
              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                  Parejas que avanzan de cada grupo
                </label>
                <select
                  value={form.parejasQueAvanzan}
                  onChange={set("parejasQueAvanzan")}
                  className={selectClass}
                >
                  <option value={1}>1 pareja (solo el primero)</option>
                  <option value={2}>2 parejas (primero y segundo)</option>
                  <option value={3}>3 parejas</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="superTiebreak"
                checked={form.superTiebreak}
                onChange={set("superTiebreak")}
                className="w-4 h-4 accent-green-600"
              />
              <label htmlFor="superTiebreak" className="text-sm" style={{ color: "var(--text-muted)" }}>
                Super tiebreak al 10 en caso de empate
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="inscripcionAbierta"
                checked={form.inscripcionAbierta}
                onChange={set("inscripcionAbierta")}
                className="w-4 h-4 accent-green-600"
              />
              <label
                htmlFor="inscripcionAbierta"
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Inscripción abierta al público
              </label>
            </div>

            <p className={tipClass}>
              💡 En formato "Mini torneo" se juega 1 set por partido. En "Torneo
              normal" siempre 3 sets. Los games por set son siempre 6.
            </p>
          </div>
        </div>

        {/* Participantes */}
        <div className="themed-card rounded-2xl p-6 border">
          <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Participantes</h2>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Máximo de parejas</label>
                <input
                  type="number"
                  min="4"
                  max="256"
                  placeholder="Ej: 32"
                  value={form.maxParejas}
                  onChange={set("maxParejas")}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Costo de inscripción ($)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.inscripcion}
                  onChange={set("inscripcion")}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                ¿Qué incluye la inscripción? (opcional)
              </label>
              <textarea
                placeholder={
                  "Ej:\n- 1 tubo de pelotas\n- Remera del torneo\n- Hidratación durante los partidos\n- Acceso a vestuarios"
                }
                value={form.inscripcionIncluye}
                onChange={set("inscripcionIncluye")}
                rows={3}
                className="themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full resize-none"
              />
            </div>
          </div>
        </div>

        {/* Premios */}
        <div className="themed-card rounded-2xl p-6 border">
          <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Premios</h2>
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Premios del torneo (opcional)</label>
            <textarea
              placeholder={
                "Ej:\n🥇 1er puesto: $50.000 + 2 paletas Bullpadel\n🥈 2do puesto: $25.000 + voucher tienda\n🥉 3er puesto: Kit de pelotas\n\nTambién podés incluir premios especiales como mejor jugador, fair play, etc."
              }
              value={form.premios}
              onChange={set("premios")}
              rows={5}
              className="themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full resize-none"
            />
          </div>
        </div>

        {/* Sede y fechas */}
        <div className="themed-card rounded-2xl p-6 border">
          <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Sede y fechas</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Nombre de la sede</label>
              <input
                type="text"
                placeholder="Ej: Club Náutico Santiago"
                value={form.sede}
                onChange={set("sede")}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Dirección física</label>
              <input
                type="text"
                placeholder="Ej: Av. Belgrano 1234"
                value={form.direccionSede}
                onChange={set("direccionSede")}
                className={inputClass}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Instagram de la sede</label>
                <input
                  type="text"
                  placeholder="@clubnautico"
                  value={form.instagramSede}
                  onChange={set("instagramSede")}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Facebook de la sede</label>
                <input
                  type="text"
                  placeholder="facebook.com/clubnautico"
                  value={form.facebookSede}
                  onChange={set("facebookSede")}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Ciudad</label>
                <input
                  type="text"
                  placeholder="Ciudad"
                  value={form.ciudad}
                  onChange={set("ciudad")}
                  className={inputClass}
                  required
                />
              </div>
              <div className="flex-1">
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Provincia</label>
                <select
                  value={form.provincia}
                  onChange={set("provincia")}
                  className={selectClass}
                  required
                >
                  <option value="">Seleccionar provincia</option>
                  {provinciasArgentina.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Fecha de inicio</label>
                <input
                  type="date"
                  value={form.fechaInicio}
                  onChange={set("fechaInicio")}
                  className={inputClass}
                  required
                />
              </div>
              <div className="flex-1">
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Fecha de fin</label>
                <input
                  type="date"
                  value={form.fechaFin}
                  onChange={set("fechaFin")}
                  className={inputClass}
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Reglamento */}
        <div className="themed-card rounded-2xl p-6 border">
          <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Reglamento</h2>
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>
              Reglas especiales del torneo (opcional)
            </label>
            <textarea
              placeholder={
                "Ej:\n- 15 minutos de tolerancia\n- Pareja que no sea de la categoría será eliminada sin devolución de inscripción\n- Se juega con pelotas nuevas provistas por la organización"
              }
              value={form.reglamento}
              onChange={set("reglamento")}
              rows={5}
              className="themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full resize-none"
            />
          </div>
        </div>

        {/* Redes y administradores */}
        <div className="themed-card rounded-2xl p-6 border">
          <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Redes y contacto</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Instagram del organizador</label>
              <input
                type="text"
                placeholder="@toppadeltorneos"
                value={form.instagramOrganizador}
                onChange={set("instagramOrganizador")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Facebook del organizador</label>
              <input
                type="text"
                placeholder="facebook.com/toppadeltorneos"
                value={form.facebookOrganizador}
                onChange={set("facebookOrganizador")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>WhatsApp general</label>
              <input
                type="text"
                placeholder="Ej: +54 385 1234567"
                value={form.whatsappOrganizador}
                onChange={set("whatsappOrganizador")}
                className={inputClass}
              />
            </div>

            <div className="mt-2 pt-3 border-t" style={{ borderColor: "var(--border-card)" }}>
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                  Personas administradoras del torneo
                </label>
                <button
                  type="button"
                  onClick={agregarAdmin}
                  className="text-xs font-semibold text-green-600 hover:underline"
                >
                  + Agregar persona
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {form.administradores.map((admin, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={admin.nombre}
                      onChange={(e) =>
                        actualizarAdmin(i, "nombre", e.target.value)
                      }
                      className="themed-input flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <input
                      type="text"
                      placeholder="WhatsApp"
                      value={admin.whatsapp}
                      onChange={(e) =>
                        actualizarAdmin(i, "whatsapp", e.target.value)
                      }
                      className="themed-input flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    {form.administradores.length > 1 && (
                      <button
                        type="button"
                        onClick={() => eliminarAdmin(i)}
                        className="text-red-400 hover:text-red-600 text-sm font-semibold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Personas responsables que los jugadores pueden contactar durante
                el torneo
              </p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="text-white py-3 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {loading ? "Creando torneo..." : "Crear torneo"}
        </button>
      </form>
    </div>
  );
}
