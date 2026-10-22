import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, MessageSquare, QrCode, WifiOff } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import Dialogo from "../../../components/Dialogo";
import { toast } from "../../../components/Toast";
import { Alert, Badge, Button, Field, Input, Pills } from "../../../components/ui";
import { aceptarPedido, CuentaCerradaError, CuentaNoEditableError } from "../../../services/cuentasService";
import { avanzarPedido, escucharPedidosActivos, rechazarPedido } from "../../../services/pedidosService";
import { useOnline } from "../../../utils/conexion";
import { haceCuanto, resumenItems } from "../../../utils/pedidos";
import { formatPrecio } from "../../../utils/format";
import { EVENTO_AUDIO_LISTO, audioListo, desbloquearAudio, guardarSonido, sonarNuevoPedido, sonidoGuardado } from "../../../components/pos/sonido";
import useMediaQuery from "../../../utils/useMediaQuery";

// Barra: el tablero de pedidos en tiempo real, en Noche para leerse desde lejos. Pendientes → En preparación →
// Listos. Aceptar suma los items a la cuenta del turno (cuentasService.aceptarPedido); rechazar lleva motivo.
// Es la comanda: no se imprime nada.

const COLUMNAS = [
  { value: "pendiente", label: "Pendientes" },
  { value: "aceptado", label: "En preparación" },
  { value: "listo", label: "Listos" },
];
const MOTIVOS_RAPIDOS = ["Sin stock", "Cerramos la barra", "No corresponde a este turno"];
const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });

function RechazarDialog({ pedido, onCerrar, onRechazar }) {
  const [motivo, setMotivo] = useState(MOTIVOS_RAPIDOS[0]);
  const [otro, setOtro] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const texto = motivo === "otro" ? otro.trim() : motivo;
  const confirmar = async () => {
    if (!texto) {
      setError("Contá el motivo.");
      return;
    }
    setGuardando(true);
    try {
      await onRechazar(texto);
    } catch (e) {
      setError(e?.message || "No se pudo rechazar.");
      setGuardando(false);
    }
  };
  return (
    <Dialogo
      titulo="Rechazar pedido"
      descripcion={`${pedido.canchaNombre} · ${pedido.nombre} · ${resumenItems(pedido.items)}`}
      onCerrar={onCerrar}
      onSubmit={confirmar}
      acciones={
        <>
          <Button onClick={onCerrar}>Volver</Button>
          <Button type="submit" variant="danger" cargando={guardando ? "Rechazando…" : ""}>
            Rechazar
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-3">
        <Field label="Motivo" as="div" error={error}>
          <Pills items={[...MOTIVOS_RAPIDOS.map((m) => ({ value: m, label: m })), { value: "otro", label: "Otro" }]} value={motivo} onChange={setMotivo} ariaLabel="Motivo del rechazo" />
        </Field>
        {motivo === "otro" && <Input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Qué le decimos al cliente" maxLength={120} data-autofocus />}
        <p className="pd-help m-0">El motivo le llega al cliente tal cual.</p>
      </div>
    </Dialogo>
  );
}

export default function Barra() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const clubId = clubActual?.id || null;
  const uid = user?.uid || null;
  const nombre = perfil?.nombre || user?.displayName || user?.email || "";
  const puedeEntrar = !!clubActual && puede("pedidos");
  const online = useOnline();

  const [estado, setEstado] = useState({ para: null, lista: [], error: false });
  const [ahora, setAhora] = useState(() => new Date());
  const [columna, setColumna] = useState("pendiente"); // teléfonos
  const [dialogo, setDialogo] = useState(null); // { tipo: "rechazar", pedido }
  const [ocupado, setOcupado] = useState(null); // id del pedido en curso
  const [sonido, setSonido] = useState(sonidoGuardado);
  const [audioOk, setAudioOk] = useState(audioListo);
  const vistos = useRef(null); // ids de pendientes ya vistos (para sonar solo con los nuevos)
  const escritorio = useMediaQuery("(min-width: 768px)");

  // Si el audio se armó con un gesto en otra parte del panel, el botón "Activar sonido" ya no hace falta
  useEffect(() => {
    const onListo = () => setAudioOk(true);
    window.addEventListener(EVENTO_AUDIO_LISTO, onListo);
    return () => window.removeEventListener(EVENTO_AUDIO_LISTO, onListo);
  }, []);

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    const unsub = escucharPedidosActivos(
      clubId,
      (lista) => setEstado({ para: clubId, lista, error: false }),
      (err) => {
        console.error("Error escuchando los pedidos:", err);
        setEstado({ para: clubId, lista: [], error: true });
      },
    );
    return () => unsub();
  }, [clubId, puedeEntrar]);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const lista = useMemo(() => (estado.para === clubId ? estado.lista : []), [estado, clubId]);
  const porColumna = useMemo(() => Object.fromEntries(COLUMNAS.map((c) => [c.value, lista.filter((p) => p.estado === c.value)])), [lista]);

  // Suena con cada pendiente nuevo (no con los que ya estaban al abrir la pantalla)
  useEffect(() => {
    if (estado.para !== clubId) return;
    const ids = new Set(porColumna.pendiente.map((p) => p.id));
    if (vistos.current === null) {
      vistos.current = ids;
      return;
    }
    const nuevos = [...ids].filter((id) => !vistos.current.has(id));
    vistos.current = ids;
    if (nuevos.length && sonido) sonarNuevoPedido();
  }, [porColumna, estado.para, clubId, sonido]);

  const activarSonido = async () => {
    const ok = await desbloquearAudio();
    setAudioOk(ok);
    if (ok) {
      setSonido(true);
      guardarSonido(true);
      sonarNuevoPedido();
    } else toast.error("Este navegador no dejó activar el sonido.");
  };
  const alternarSonido = () => {
    const v = !sonido;
    setSonido(v);
    guardarSonido(v);
  };

  const aceptar = async (p) => {
    setOcupado(p.id);
    try {
      await aceptarPedido(clubId, p, { uid, nombre });
      toast.success(`Aceptado: va a la cuenta de ${p.nombre || p.canchaNombre}`);
    } catch (e) {
      console.error("Error aceptando el pedido:", e);
      const motivo = e instanceof CuentaCerradaError || e instanceof CuentaNoEditableError ? e.message : e?.code === "permission-denied" ? "sin permiso" : e?.message || "error";
      toast.error(`No se pudo aceptar: ${motivo}`);
    } finally {
      setOcupado(null);
    }
  };
  const rechazar = async (p, motivo) => {
    await rechazarPedido(clubId, p.id, { motivo, uid, nombre });
    toast.success("Pedido rechazado");
    setDialogo(null);
  };
  const avanzar = async (p, nuevo) => {
    setOcupado(p.id);
    try {
      await avanzarPedido(clubId, p, nuevo, { uid, nombre });
    } catch (e) {
      console.error("Error actualizando el pedido:", e);
      toast.error("No se pudo actualizar el pedido.");
    } finally {
      setOcupado(null);
    }
  };

  if (!clubCargado) return <div className="pd-skeleton h-64 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!clubActual || !puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Barra</h1>
        <SinPermiso />
      </div>
    );
  }

  const tarjeta = (p) => {
    const esta = ocupado === p.id;
    return (
      <article key={p.id} className="pd-card flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="heading-md m-0 pd-tnum">
              {p.canchaNombre} · {p.horaInicio}
            </p>
            <p className="body-sm text-ink-2 m-0 break-words">
              <strong className="text-ink">{p.nombre}</strong> · {haceCuanto(p.tiempos?.creado || p.creadoEn, ahora) || "…"}
            </p>
          </div>
          <Badge tone={p.origen === "qr" ? "court" : "neutral"}>{p.origen === "qr" ? "QR" : "Celular"}</Badge>
        </div>
        <ul className="m-0 p-0 list-none grid gap-1">
          {(p.items || []).map((it, i) => (
            <li key={i} className="flex justify-between gap-3 body-md">
              <span>
                <strong className="pd-tnum">{fmtCant(it.cantidad)} ×</strong> {it.nombre}
              </span>
            </li>
          ))}
        </ul>
        {p.nota && (
          <p className="m-0 body-sm text-warning font-semibold inline-flex items-start gap-1">
            <MessageSquare className="pd-icon shrink-0" size={16} aria-hidden="true" />
            {p.nota}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="pd-tnum text-ink-2 body-sm">{formatPrecio(p.subtotal)}</span>
          <div className="pd-btn-group">
            {p.estado === "pendiente" && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDialogo({ tipo: "rechazar", pedido: p })} disabled={esta}>
                  Rechazar
                </Button>
                <Button size="sm" variant="primary" onClick={() => aceptar(p)} cargando={esta ? "…" : ""}>
                  Aceptar
                </Button>
              </>
            )}
            {p.estado === "aceptado" && (
              <Button size="sm" variant="primary" onClick={() => avanzar(p, "listo")} cargando={esta ? "…" : ""}>
                Listo
              </Button>
            )}
            {p.estado === "listo" && (
              <Button size="sm" variant="primary" onClick={() => avanzar(p, "entregado")} cargando={esta ? "…" : ""}>
                Entregado
              </Button>
            )}
          </div>
        </div>
      </article>
    );
  };

  const columnaUi = (c) => (
    <section key={c.value} className="flex flex-col gap-3 min-w-0" aria-label={c.label}>
      <h2 className="heading-sm m-0 flex items-center gap-2">
        {c.label}
        <Badge tone={c.value === "pendiente" && porColumna[c.value].length ? "warning" : "neutral"} className="pd-tnum">
          {porColumna[c.value].length}
        </Badge>
      </h2>
      {porColumna[c.value].length === 0 ? <p className="body-sm text-ink-3 m-0 py-6 text-center">Nada por acá.</p> : porColumna[c.value].map(tarjeta)}
    </section>
  );

  return (
    <div data-theme="dark" className="bg-surface text-ink rounded-xl p-4 md:p-6 -mx-4 md:mx-0 min-h-[calc(100dvh-120px)] flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="heading-lg m-0">Barra</h1>
          {!online && (
            <Badge tone="danger" className="inline-flex items-center gap-1">
              <WifiOff className="pd-icon" size={16} aria-hidden="true" /> Sin conexión
            </Badge>
          )}
        </div>
        <div className="pd-btn-group">
          {!audioOk ? (
            <Button size="sm" icon={<Bell className="pd-icon" size={20} aria-hidden="true" />} onClick={activarSonido}>
              Activar sonido
            </Button>
          ) : (
            <Button size="sm" variant="ghost" icon={sonido ? <Bell className="pd-icon" size={20} aria-hidden="true" /> : <BellOff className="pd-icon" size={20} aria-hidden="true" />} onClick={alternarSonido} aria-pressed={sonido}>
              {sonido ? "Sonido" : "Silencio"}
            </Button>
          )}
          <Link to="/admin/bar/qr" className="pd-btn pd-btn-sm pd-btn-ghost">
            <QrCode className="pd-icon" size={20} aria-hidden="true" /> Imprimir QR de las canchas
          </Link>
        </div>
      </div>

      {estado.error && <Alert tone="danger">No pudimos cargar los pedidos. Recargá la página.</Alert>}
      {estado.para !== clubId && !estado.error ? (
        <div className="grid gap-4 md:grid-cols-3" aria-busy="true" aria-label="Cargando pedidos">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pd-skeleton h-40 rounded-lg" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <div className="flex-1 grid place-items-center text-center py-12">
          <div>
            <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
            <p className="heading-sm m-0">Sin pedidos.</p>
            <p className="body-sm text-ink-2 mt-1 mb-0">Cuando un jugador pida desde el celular, aparece acá.</p>
          </div>
        </div>
      ) : (
        escritorio ? (
          <div className="grid gap-4 md:grid-cols-3 items-start">{COLUMNAS.map(columnaUi)}</div>
        ) : (
          <>
            <Pills items={COLUMNAS.map((c) => ({ ...c, count: porColumna[c.value].length }))} value={columna} onChange={setColumna} ariaLabel="Columna" />
            {columnaUi(COLUMNAS.find((c) => c.value === columna) || COLUMNAS[0])}
          </>
        )
      )}

      {dialogo?.tipo === "rechazar" && <RechazarDialog pedido={dialogo.pedido} onCerrar={() => setDialogo(null)} onRechazar={(motivo) => rechazar(dialogo.pedido, motivo)} />}
    </div>
  );
}
