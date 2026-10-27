import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Copy, MessageCircle, Printer } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { actualizarClubConfig, crearCancha } from "../../services/canchaService";
import { svgQr } from "../../utils/qr";
import { formatPrecio } from "../../utils/format";
import SinPermiso from "../../components/SinPermiso";
import { toast } from "../../components/Toast";
import { Alert, Button, Card, Field, Input, Pills, Select } from "../../components/ui";

// /admin/empezar (P3-12): un club sin canchas arranca en tres pasos — 1) la primera cancha con horario y precio,
// 2) seña y reserva directa, 3) compartir el link público y su QR. Usa los mismos servicios que Canchas y
// Configuración (crearCancha, actualizarClubConfig); no hay modelo nuevo. "Saltar" vuelve a Hoy.

const SUPERFICIES = ["Cemento", "Sintético", "Césped", "Otro"];
const HORAS = Array.from({ length: 18 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`); // 07:00 a 24:00
const PASOS = ["Tu primera cancha", "Seña y reservas", "Compartí tu club"];
const TIPOS_SEÑA = [
  { value: "ninguna", label: "Sin seña" },
  { value: "porcentaje", label: "Porcentaje" },
  { value: "monto", label: "Monto fijo" },
];

// "08:00" a "23:00" → { "08:00": precio, …, "22:00": precio } (cada turno es una hora que empieza ahí)
function horariosDesde(desde, hasta, precio) {
  const i = HORAS.indexOf(desde);
  const j = HORAS.indexOf(hasta);
  const horarios = {};
  for (let k = i; k >= 0 && k < j; k++) horarios[HORAS[k]] = Number(precio) || 0;
  return horarios;
}

function Pasos({ actual }) {
  return (
    <ol className="flex flex-wrap gap-2 m-0 p-0 list-none" aria-label="Pasos">
      {PASOS.map((p, i) => (
        <li key={p} className={`flex items-center gap-2 body-sm ${i === actual ? "font-semibold" : "text-ink-3"}`} aria-current={i === actual ? "step" : undefined}>
          <span className={`grid place-items-center w-6 h-6 rounded-pill pd-tnum caption ${i < actual ? "bg-court-soft" : "bg-surface-sunken"}`}>
            {i < actual ? <Check className="pd-icon" size={14} aria-hidden="true" /> : i + 1}
          </span>
          {p}
        </li>
      ))}
    </ol>
  );
}

export default function Empezar() {
  const navigate = useNavigate();
  const club = useAuthStore((s) => s.clubActual);
  const puede = useAuthStore((s) => s.puede);
  const [paso, setPaso] = useState(0);
  const [cancha, setCancha] = useState({ nombre: "Cancha 1", superficie: "Sintético", techada: false, desde: "08:00", hasta: "23:00", precio: "" });
  const [seña, setSeña] = useState({ tipo: club?.seña?.tipo || "porcentaje", valor: club?.seña?.valor ? String(club.seña.valor) : "30", reservaDirecta: club?.reservaDirecta ?? true });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const link = club ? `${window.location.origin}/club/${club.id}` : "";
  const qr = useMemo(() => (link ? svgQr(link, { titulo: `QR de ${club?.nombre || "tu club"}` }) : ""), [link, club?.nombre]);

  if (!club) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!puede("tarifas") && !puede("configurarClub")) return <SinPermiso />;

  const saltar = (
    <Link to="/admin" className="body-sm text-ink-2 underline">
      Saltar por ahora
    </Link>
  );

  const guardarCancha = async (e) => {
    e.preventDefault();
    const precio = Number(cancha.precio);
    if (!cancha.nombre.trim()) return setError("Poné un nombre para la cancha.");
    if (HORAS.indexOf(cancha.hasta) <= HORAS.indexOf(cancha.desde)) return setError("El cierre tiene que ser después de la apertura.");
    if (!Number.isFinite(precio) || precio <= 0) return setError("Poné el precio de una hora de cancha.");
    setError("");
    setGuardando(true);
    try {
      const horarios = horariosDesde(cancha.desde, cancha.hasta, precio);
      await crearCancha(club.id, {
        nombre: cancha.nombre.trim(),
        superficie: cancha.superficie,
        techada: cancha.techada,
        precioBase: precio,
        horarios,
        horariosFinde: {},
        horariosDisponibles: Object.keys(horarios).sort(),
      });
      toast.success("Cancha creada");
      setPaso(1);
    } catch (err) {
      console.error("Error al crear la cancha:", err);
      setError("No pudimos crear la cancha. Intentá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const guardarSeña = async (e) => {
    e.preventDefault();
    const valor = Number(seña.valor);
    if (seña.tipo === "porcentaje" && !(valor >= 1 && valor <= 100)) return setError("Ingresá un porcentaje entre 1 y 100.");
    if (seña.tipo === "monto" && !(valor > 0)) return setError("Ingresá un monto mayor a 0.");
    setError("");
    setGuardando(true);
    try {
      await actualizarClubConfig(club.id, { seña: { tipo: seña.tipo, valor: seña.tipo === "ninguna" ? 0 : valor }, reservaDirecta: seña.reservaDirecta });
      toast.success("Listo, guardamos cómo reservan");
      setPaso(2);
    } catch (err) {
      console.error("Error al guardar la seña:", err);
      setError("No pudimos guardar. Intentá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };
  const escapar = (t) => String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const imprimirQr = () => {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return toast.error("Tu navegador bloqueó la ventana para imprimir.");
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR de ${escapar(club.nombre || "tu club")}</title></head><body style="font-family:sans-serif;text-align:center;padding:24px"><h1 style="font-size:22px">${escapar(club.nombre)}</h1><p>Reservá tu cancha</p><div style="width:280px;margin:0 auto">${qr}</div><p style="font-size:12px">${escapar(link)}</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };
  const textoWhatsApp = encodeURIComponent(`Reservá tu cancha en ${club.nombre || "nuestro club"}: ${link}`);

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="pd-eyebrow m-0">Empezá en 3 pasos</p>
          <h1 className="heading-lg m-0 mt-1">{PASOS[paso]}</h1>
        </div>
        {paso < 2 && saltar}
      </header>
      <Pasos actual={paso} />

      {paso === 0 && (
        <Card as="form" onSubmit={guardarCancha} noValidate>
          <Card.Meta className="mb-4!">Con una cancha ya podés recibir reservas. Las demás (y los precios de fin de semana) las sumás después desde Canchas.</Card.Meta>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre">
              <Input value={cancha.nombre} onChange={(e) => setCancha({ ...cancha, nombre: e.target.value })} maxLength={40} data-autofocus />
            </Field>
            <Field label="Superficie">
              <Select value={cancha.superficie} onChange={(e) => setCancha({ ...cancha, superficie: e.target.value })}>
                {SUPERFICIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Abre a las">
              <Select value={cancha.desde} onChange={(e) => setCancha({ ...cancha, desde: e.target.value })}>
                {HORAS.slice(0, -1).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cierra a las">
              <Select value={cancha.hasta} onChange={(e) => setCancha({ ...cancha, hasta: e.target.value })}>
                {HORAS.slice(1).map((h) => (
                  <option key={h} value={h}>
                    {h === "24:00" ? "00:00" : h}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Precio por hora ($)" help="El mismo para todos los turnos; después podés cambiarlo por horario.">
              <Input type="number" min="0" inputMode="numeric" value={cancha.precio} onChange={(e) => setCancha({ ...cancha, precio: e.target.value })} className="pd-tnum" placeholder="20000" />
            </Field>
            <Field label="Techada">
              <Pills
                items={[
                  { value: false, label: "No" },
                  { value: true, label: "Sí" },
                ]}
                value={cancha.techada}
                onChange={(v) => setCancha({ ...cancha, techada: v })}
                ariaLabel="¿La cancha es techada?"
              />
            </Field>
          </div>
          {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
          <div className="mt-4">
            <Button type="submit" variant="primary" cargando={guardando ? "Creando…" : ""}>
              Crear cancha y seguir
            </Button>
          </div>
        </Card>
      )}

      {paso === 1 && (
        <Card as="form" onSubmit={guardarSeña} noValidate>
          <Card.Meta className="mb-4!">La seña asegura el turno: con Mercado Pago conectado, el jugador la paga al reservar. Sin seña, cualquiera puede reservar gratis.</Card.Meta>
          <div className="grid gap-4">
            <Field label="Seña">
              <Pills items={TIPOS_SEÑA} value={seña.tipo} onChange={(v) => setSeña({ ...seña, tipo: v })} ariaLabel="Tipo de seña" />
            </Field>
            {seña.tipo !== "ninguna" && (
              <Field label={seña.tipo === "porcentaje" ? "Porcentaje del turno (%)" : "Monto de la seña ($)"} help={seña.tipo === "porcentaje" && Number(cancha.precio) > 0 ? `Con ${formatPrecio(Number(cancha.precio))} por hora, la seña es ${formatPrecio(Math.round((Number(cancha.precio) * Number(seña.valor || 0)) / 100))}.` : undefined}>
                <Input type="number" min="0" inputMode="numeric" value={seña.valor} onChange={(e) => setSeña({ ...seña, valor: e.target.value })} className="pd-tnum" />
              </Field>
            )}
            <Field label="Cuando alguien reserva">
              <Pills
                items={[
                  { value: true, label: "Se confirma sola" },
                  { value: false, label: "La apruebo yo" },
                ]}
                value={seña.reservaDirecta}
                onChange={(v) => setSeña({ ...seña, reservaDirecta: v })}
                ariaLabel="Confirmación de las reservas"
              />
            </Field>
          </div>
          {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
          <div className="mt-4 pd-btn-group">
            <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
              Guardar y seguir
            </Button>
            <Button variant="ghost" onClick={() => setPaso(2)}>
              Lo veo después
            </Button>
          </div>
        </Card>
      )}

      {paso === 2 && (
        <Card>
          <Card.Meta className="mb-4!">Este es el link de tu club: los jugadores ven tus canchas libres y reservan. Mandalo por WhatsApp o pegá el QR en el mostrador.</Card.Meta>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="w-44 shrink-0 rounded-lg bg-white p-2 self-center" aria-label={`QR del link de ${club.nombre || "tu club"}`} role="img" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="flex flex-col gap-3 min-w-0">
              <p className="body-sm font-semibold break-all m-0">{link}</p>
              <div className="pd-btn-group">
                <Button onClick={copiar} icon={<Copy className="pd-icon" size={20} aria-hidden="true" />}>
                  Copiar link
                </Button>
                <a href={`https://wa.me/?text=${textoWhatsApp}`} target="_blank" rel="noopener noreferrer" className="pd-btn">
                  <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
                  WhatsApp
                </a>
                <Button variant="ghost" onClick={imprimirQr} icon={<Printer className="pd-icon" size={20} aria-hidden="true" />}>
                  Imprimir QR
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-4 pd-btn-group">
            <Button variant="primary" onClick={() => navigate("/admin/canchas")}>
              Ver mi grilla
            </Button>
            <Button variant="ghost" onClick={() => navigate("/admin")}>
              Ir a Hoy
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
