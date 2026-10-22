import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock, Minus, Pencil, Plus, Receipt } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import Dialogo from "../../../components/Dialogo";
import TicketPreview from "../../../components/TicketPreview";
import { toast } from "../../../components/Toast";
import { Alert, Badge, Button, Card, Field, Input, Pills, Select, StatTile, Tabs, Textarea } from "../../../components/ui";
import {
  CajaAbiertaError,
  DISPOSITIVO_POR_DEFECTO,
  ETIQUETA_MEDIO,
  ETIQUETA_TIPO,
  MEDIOS,
  abrirCaja,
  cerrarCaja,
  crearMovimientoCaja,
  dispositivoGuardado,
  escucharCajaAbierta,
  escucharCajasAbiertas,
  escucharMovimientosCaja,
  getCajasCerradas,
  getMovimientosCaja,
  renombrarDispositivo,
} from "../../../services/cajaService";
import { ANCHOS_TICKET, anchoTicketGuardado, guardarAnchoTicket } from "../../../print/imprimir";
import { htmlCierreCaja } from "../../../print/cierreCaja";
import { efectivoEsperado, montoConSigno, tonoDiferencia } from "../../../utils/caja";
import { formatPrecio } from "../../../utils/format";
import { formatDiaHora, formatFechaHora, formatHora } from "../../../utils/formatDate";

// Caja del bar: un turno de un dispositivo. La pantalla escucha la caja abierta de ESTE dispositivo (nombre
// recordado en el navegador), muestra los totales que deriva la Function y registra retiros, ingresos y gastos.
// Las ventas llegan en P3-3 como movimientos "venta". Cerrar = arqueo (efectivo contado vs esperado) en un solo update.

const ESTADO_INICIAL = { para: null, lista: [], error: false };
const icono = (Icono, extra = {}) => <Icono className="pd-icon" size={20} aria-hidden="true" {...extra} />;
const numero = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

// Monto con signo y formato: −$ 3.000 / +$ 5.000
const montoFirmado = (mov) => {
  const n = montoConSigno(mov);
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}${formatPrecio(Math.abs(n))}`;
};
const diferenciaTexto = (d) => (d === null || d === undefined ? "—" : `${d < 0 ? "−" : d > 0 ? "+" : ""}${formatPrecio(Math.abs(d))}`);
const TONO_TIPO = { ingreso: "success", retiro: "neutral", gasto: "warning", venta: "court", anulacion: "danger", cobroCuenta: "court", "seña": "court" };
const PILLS_MEDIOS = MEDIOS.map((m) => ({ value: m.id, label: m.label }));

// ----- Diálogos -----

const TEXTO_TIPO = {
  retiro: { descripcion: "Plata que sale de la caja: a la caja fuerte, al banco, un adelanto.", nota: "Ej: a la caja fuerte", ayuda: "Se resta del total del medio elegido." },
  gasto: { descripcion: "Un pago hecho con plata de la caja: proveedor, hielo, delivery.", nota: "Ej: hielo del quiosco", ayuda: "Se resta del total del medio elegido." },
  ingreso: { descripcion: "Plata que entra sin ser una venta: cambio, un aporte del dueño, una cobranza vieja.", nota: "Opcional.", ayuda: "Se suma al total del medio elegido." },
};

function MovimientoDialog({ tipo, caja, clubId, uid, nombre, onCerrar }) {
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState("efectivo");
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const requiereNota = tipo !== "ingreso";
  const texto = TEXTO_TIPO[tipo];

  const guardar = async () => {
    const err = {};
    const n = numero(monto);
    if (n === null || !Number.isFinite(n) || n <= 0) err.monto = "Poné un monto mayor que 0.";
    if (requiereNota && !nota.trim()) err.nota = tipo === "retiro" ? "Contá a dónde va la plata." : "Contá qué se pagó.";
    setErrores(err);
    if (Object.keys(err).length > 0) return;
    setGuardando(true);
    try {
      await crearMovimientoCaja(clubId, { cajaId: caja.id, tipo, medio, monto: n, nota: nota.trim() || null, uid, nombre });
      toast.success("Movimiento registrado");
      onCerrar();
    } catch (e) {
      console.error("Error registrando el movimiento de caja:", e);
      toast.error("No pudimos registrar el movimiento. Intentá de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo={ETIQUETA_TIPO[tipo]}
      descripcion={texto.descripcion}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 mt-4">
        <Field label="Monto" error={errores.monto}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" data-autofocus />
        </Field>
        <Field label="Medio" as="div" help={texto.ayuda}>
          <Pills items={PILLS_MEDIOS} value={medio} onChange={setMedio} ariaLabel="Medio de pago" />
        </Field>
        <Field label="Nota" help={requiereNota ? undefined : texto.nota} error={errores.nota}>
          <Input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={requiereNota ? texto.nota : ""} />
        </Field>
      </div>
    </Dialogo>
  );
}

function CerrarCajaDialog({ caja, pendientes, clubId, uid, nombre, onCerrar, onCerrada }) {
  const [contado, setContado] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const esperado = efectivoEsperado(caja);
  const n = numero(contado);
  const diferencia = n === null || !Number.isFinite(n) ? null : n - esperado;
  const tono = diferencia === null ? "neutral" : tonoDiferencia(diferencia);
  const t = caja.totales || {};

  const guardar = async () => {
    if (pendientes) {
      setError("Hay movimientos que todavía no se aplicaron. Esperá unos segundos y volvé a intentar.");
      return;
    }
    if (n === null || !Number.isFinite(n) || n < 0) {
      setError("Poné el efectivo que contaste (0 o más).");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await cerrarCaja(clubId, caja.id, { efectivoContado: n, esperadoEfectivo: esperado, observaciones, uid, nombre });
      toast.success("Caja cerrada");
      onCerrada({
        ...caja,
        estado: "cerrada",
        cerradaPor: uid,
        cerradaPorNombre: nombre || null,
        cerradaEn: new Date(),
        arqueo: { efectivoContado: n },
        esperadoEfectivo: esperado,
        diferencia: n - esperado,
        observaciones: observaciones.trim() || null,
      });
    } catch (e) {
      console.error("Error cerrando la caja:", e);
      toast.error("No pudimos cerrar la caja. Intentá de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo="Cerrar caja"
      descripcion={`${caja.dispositivo} · abierta ${formatDiaHora(caja.abiertaEn)}${caja.abiertaPorNombre ? ` por ${caja.abiertaPorNombre}` : ""}`}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="danger" cargando={guardando ? "Cerrando…" : ""}>
            Cerrar caja
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 mt-4">
        <dl className="pd-dl">
          <div>
            <dt>Fondo inicial</dt>
            <dd className="pd-tnum">{formatPrecio(caja.fondoInicial)}</dd>
          </div>
          <div>
            <dt>Efectivo esperado</dt>
            <dd className="pd-tnum font-semibold">{formatPrecio(esperado)}</dd>
          </div>
          <div>
            <dt>Transferencia</dt>
            <dd className="pd-tnum">{formatPrecio(t.transferencia)}</dd>
          </div>
          <div>
            <dt>Tarjeta</dt>
            <dd className="pd-tnum">{formatPrecio(t.tarjeta)}</dd>
          </div>
          <div>
            <dt>QR</dt>
            <dd className="pd-tnum">{formatPrecio(t.qr)}</dd>
          </div>
        </dl>
        {pendientes && <Alert tone="warning">Hay movimientos que todavía no se aplicaron a los totales. Esperá unos segundos antes de cerrar.</Alert>}
        <Field label="Efectivo contado" help="Lo que hay en la caja ahora, con el fondo inicial." error={error}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="0" data-autofocus />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span className="pd-label">Diferencia</span>
          <Badge tone={tono} className="pd-tnum">
            {diferenciaTexto(diferencia)}
          </Badge>
        </div>
        <Field label="Observaciones" help="Opcional: faltantes, sobrantes, algo que haya que revisar.">
          <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} />
        </Field>
      </div>
    </Dialogo>
  );
}

function RenombrarDialog({ caja, clubId, onCerrar, onRenombrada }) {
  const [valor, setValor] = useState(caja.dispositivo || "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    const nombre = valor.trim();
    if (!nombre) {
      setError("Poné un nombre.");
      return;
    }
    if (nombre === caja.dispositivo) {
      onCerrar();
      return;
    }
    setGuardando(true);
    try {
      await renombrarDispositivo(clubId, caja.id, nombre);
      toast.success("Dispositivo renombrado");
      onRenombrada(nombre);
    } catch (e) {
      console.error("Error renombrando el dispositivo:", e);
      toast.error("No pudimos renombrar el dispositivo.");
      setGuardando(false);
    }
  };
  return (
    <Dialogo
      titulo="Nombre del dispositivo"
      descripcion="Cómo se llama esta caja en el club (Caja 1, Mostrador, Tablet bar…). Se recuerda en este navegador."
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mt-4">
        <Field label="Dispositivo" error={error}>
          <Input value={valor} onChange={(e) => setValor(e.target.value)} maxLength={40} data-autofocus />
        </Field>
      </div>
    </Dialogo>
  );
}

// ----- Historial -----

function HistorialTab({ clubId, puedeVer, onVer, cargandoId = null }) {
  const [estado, setEstado] = useState({ para: null, lista: [], error: false });
  useEffect(() => {
    if (!clubId || !puedeVer) return undefined;
    let vivo = true;
    getCajasCerradas(clubId)
      .then((lista) => vivo && setEstado({ para: clubId, lista, error: false }))
      .catch((e) => {
        console.error("Error cargando el historial de cajas:", e);
        if (vivo) setEstado({ para: clubId, lista: [], error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, puedeVer]);

  if (!puedeVer) return <SinPermiso />;
  if (estado.para !== clubId) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando historial">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pd-skeleton h-14" />
        ))}
      </div>
    );
  }
  if (estado.error) return <Alert tone="danger">No pudimos cargar el historial. Recargá la página para intentar de nuevo.</Alert>;
  if (estado.lista.length === 0) {
    return (
      <Card className="text-center py-12!">
        <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
        <p className="heading-sm m-0">Todavía no hay cajas cerradas.</p>
        <p className="body-sm text-ink-2 mt-1 mb-0">Cuando cierres una caja, su arqueo queda acá.</p>
      </Card>
    );
  }
  const quien = (c) => [c.abiertaPorNombre || "—", c.cerradaPorNombre || "—"].join(" / ");
  return (
    <div className="flex flex-col gap-4">
      <p className="body-sm text-ink-3 m-0">{estado.lista.length >= 50 ? "Las últimas 50 cajas cerradas." : `${estado.lista.length} ${estado.lista.length === 1 ? "caja cerrada" : "cajas cerradas"}.`}</p>

      {/* Teléfono: una tarjeta por caja */}
      <div className="flex flex-col gap-4 md:hidden">
        {estado.lista.map((c) => (
          <Card key={c.id}>
            <Card.Row className="items-start!">
              <Card.Eyebrow className="pd-tnum">
                {formatFechaHora(c.abiertaEn)} → {formatHora(c.cerradaEn)}
              </Card.Eyebrow>
              <Badge tone={tonoDiferencia(c.diferencia)} className="pd-tnum">
                {diferenciaTexto(c.diferencia)}
              </Badge>
            </Card.Row>
            <Card.Title className="mt-2!">{c.dispositivo}</Card.Title>
            <dl className="pd-dl mt-3">
              <div>
                <dt>Abierta / cerrada por</dt>
                <dd>{quien(c)}</dd>
              </div>
              <div>
                <dt>Ventas</dt>
                <dd className="pd-tnum">{formatPrecio(c.totales?.ventas)}</dd>
              </div>
              <div>
                <dt>Efectivo esperado</dt>
                <dd className="pd-tnum">{formatPrecio(c.esperadoEfectivo)}</dd>
              </div>
              <div>
                <dt>Contado</dt>
                <dd className="pd-tnum">{formatPrecio(c.arqueo?.efectivoContado)}</dd>
              </div>
            </dl>
            {onVer && (
              <div className="mt-3">
                <Button size="sm" onClick={() => onVer(c)} cargando={cargandoId === c.id ? "Armando…" : ""}>
                  Ver
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Desde md: tabla */}
      <div className="pd-table-wrap hidden md:block">
        <div className="overflow-x-auto">
          <table className="pd-table">
            <thead>
              <tr>
                <th>Apertura → cierre</th>
                <th>Dispositivo</th>
                <th>Abierta / cerrada por</th>
                <th className="num">Ventas</th>
                <th className="num">Esperado</th>
                <th className="num">Contado</th>
                <th className="num">Diferencia</th>
                {onVer && (
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {estado.lista.map((c) => (
                <tr key={c.id}>
                  <td className="pd-tnum whitespace-nowrap">
                    {formatFechaHora(c.abiertaEn)} → {formatHora(c.cerradaEn)}
                  </td>
                  <td className="font-semibold">{c.dispositivo}</td>
                  <td>{quien(c)}</td>
                  <td className="num">{formatPrecio(c.totales?.ventas)}</td>
                  <td className="num">{formatPrecio(c.esperadoEfectivo)}</td>
                  <td className="num">{formatPrecio(c.arqueo?.efectivoContado)}</td>
                  <td className="num">
                    <Badge tone={tonoDiferencia(c.diferencia)} className="pd-tnum">
                      {diferenciaTexto(c.diferencia)}
                    </Badge>
                  </td>
                  {onVer && (
                    <td className="num">
                      <Button size="sm" variant="ghost" onClick={() => onVer(c)} cargando={cargandoId === c.id ? "Armando…" : ""}>
                        Ver
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ----- Página -----

export default function Caja() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const clubId = clubActual?.id || null;
  const uid = user?.uid || null;
  const nombre = perfil?.nombre || user?.displayName || user?.email || "";

  // clubActual en la lista: los permisos se recalculan cuando cambia el club
  const puedeAbrir = !!clubActual && puede("abrirCaja");
  const puedeCerrar = !!clubActual && puede("cerrarCaja");
  const puedeCerrarAjena = !!clubActual && puede("cerrarCajaAjena");
  const puedeHistorial = !!clubActual && puede("verCajasCerradas");
  const puedeVender = !!clubActual && puede("vender");
  const puedeEntrar = puedeAbrir || puedeCerrar || puedeCerrarAjena || puedeHistorial;
  const puedeRegistrar = puedeAbrir || puedeCerrar || puedeVender;

  const [dispositivo, setDispositivo] = useState(dispositivoGuardado);
  const [tab, setTab] = useState("caja");
  const [propia, setPropia] = useState({ para: null, caja: null, error: false });
  const [abiertas, setAbiertas] = useState(ESTADO_INICIAL);
  const [viendoId, setViendoId] = useState(null); // otra caja abierta, en modo lectura
  const [movs, setMovs] = useState(ESTADO_INICIAL);
  const [dialogo, setDialogo] = useState(null); // { tipo } | "cerrar" | "renombrar"
  const [formAbrir, setFormAbrir] = useState(() => ({ dispositivo: dispositivoGuardado(), fondo: "0" }));
  const [errAbrir, setErrAbrir] = useState({});
  const [abriendo, setAbriendo] = useState(false);
  // Tickets: ancho de papel recordado en el navegador y la vista previa abierta ({ titulo, html, textoCerrar })
  const [ancho, setAncho] = useState(anchoTicketGuardado);
  const [ticket, setTicket] = useState(null);
  const [cargandoTicket, setCargandoTicket] = useState(null); // id de la caja cuyo cierre se está armando

  // La caja abierta de este dispositivo
  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    const unsub = escucharCajaAbierta(
      clubId,
      dispositivo,
      (caja) => setPropia({ para: clubId, caja, error: false }),
      (err) => {
        console.error("Error escuchando la caja:", err);
        setPropia({ para: clubId, caja: null, error: true });
      },
    );
    return () => unsub();
  }, [clubId, dispositivo, puedeEntrar]);

  // Todas las cajas abiertas del club
  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    const unsub = escucharCajasAbiertas(
      clubId,
      (lista) => setAbiertas({ para: clubId, lista, error: false }),
      (err) => {
        console.error("Error escuchando las cajas abiertas:", err);
        setAbiertas({ para: clubId, lista: [], error: true });
      },
    );
    return () => unsub();
  }, [clubId, puedeEntrar]);

  const cajaPropia = propia.para === clubId ? propia.caja : null;
  // La caja de otro dispositivo que se está mirando; si se cerró (ya no está entre las abiertas) se vuelve a la propia
  const cajaVista = viendoId ? abiertas.lista.find((c) => c.id === viendoId) || null : null;
  const caja = cajaVista || cajaPropia;
  const esPropia = !!caja && !cajaVista;
  const cajaId = caja?.id || null;

  // Movimientos de la caja en pantalla, en tiempo real
  useEffect(() => {
    if (!clubId || !cajaId) return undefined;
    const unsub = escucharMovimientosCaja(
      clubId,
      cajaId,
      (lista) => setMovs({ para: cajaId, lista, error: false }),
      (err) => {
        console.error("Error escuchando los movimientos de caja:", err);
        setMovs({ para: cajaId, lista: [], error: true });
      },
    );
    return () => unsub();
  }, [clubId, cajaId]);

  const movimientos = useMemo(() => (movs.para === cajaId ? movs.lista : []), [movs, cajaId]);
  const pendientes = useMemo(() => movimientos.some((m) => m.aplicado === false), [movimientos]);
  const otrasAbiertas = abiertas.lista.filter((c) => c.id !== cajaPropia?.id);

  const abrir = async () => {
    const err = {};
    const nombreDisp = formAbrir.dispositivo.trim();
    const fondo = numero(formAbrir.fondo);
    if (!nombreDisp) err.dispositivo = "Poné un nombre para este dispositivo.";
    if (fondo === null || !Number.isFinite(fondo) || fondo < 0) err.fondo = "El fondo inicial tiene que ser 0 o más.";
    setErrAbrir(err);
    if (Object.keys(err).length > 0) return;
    setAbriendo(true);
    try {
      await abrirCaja(clubId, { dispositivo: nombreDisp, fondoInicial: fondo, uid, nombre });
      setDispositivo(nombreDisp);
      setViendoId(null);
      toast.success("Caja abierta");
    } catch (e) {
      if (e instanceof CajaAbiertaError) {
        toast.error("Este dispositivo ya tiene una caja abierta");
        setDispositivo(nombreDisp);
      } else {
        console.error("Error abriendo la caja:", e);
        toast.error("No pudimos abrir la caja. Intentá de nuevo.");
      }
    } finally {
      setAbriendo(false);
    }
  };

  const cambiarAncho = (valor) => {
    const n = Number(valor);
    guardarAnchoTicket(n);
    setAncho(ANCHOS_TICKET.includes(n) ? n : 80);
  };

  // Ticket de cierre de una caja cerrada (al cerrar, con los movimientos ya en pantalla; desde el historial, leyéndolos)
  const abrirTicketCierre = (cajaCerrada, movimientosDeLaCaja, textoCerrar = "Cerrar") => {
    setTicket({
      titulo: "Cierre de caja",
      descripcion: `${cajaCerrada.dispositivo} · ${formatDiaHora(cajaCerrada.abiertaEn)} → ${formatHora(cajaCerrada.cerradaEn)}`,
      html: htmlCierreCaja({ club: clubActual, caja: cajaCerrada, movimientos: movimientosDeLaCaja, ancho }),
      textoCerrar,
    });
  };
  const verCierre = async (cajaCerrada) => {
    setCargandoTicket(cajaCerrada.id);
    try {
      const lista = await getMovimientosCaja(clubId, cajaCerrada.id);
      abrirTicketCierre(cajaCerrada, lista);
    } catch (e) {
      console.error("Error cargando los movimientos de la caja:", e);
      toast.error("No pudimos armar el cierre de esa caja.");
    } finally {
      setCargandoTicket(null);
    }
  };

  // ----- Estados previos -----

  if (!clubCargado || (clubActual && puedeEntrar && propia.para !== clubId && !propia.error)) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-40" />
        <div className="pd-skeleton h-10 w-72" />
        <div className="pd-skeleton h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!clubActual) {
    return (
      <Card className="text-center py-12!">
        <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
        <p className="heading-sm m-0">No tenés un club registrado</p>
        <p className="body-sm text-ink-2 mt-1 m-0">Registrate como club o pedí que te sumen al equipo de uno para manejar la caja.</p>
      </Card>
    );
  }

  if (!puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Caja</h1>
        <SinPermiso />
      </div>
    );
  }

  // ----- Partes (funciones, no componentes) -----

  const tarjetaOtraCaja = (c) => (
    <Card key={c.id}>
      <Card.Row className="items-start!">
        <Card.Title className="m-0!">{c.dispositivo}</Card.Title>
        <Badge tone="success" dot>
          Abierta
        </Badge>
      </Card.Row>
      <Card.Meta className="mt-1!">
        {c.abiertaPorNombre ? `${c.abiertaPorNombre} · ` : ""}desde {formatDiaHora(c.abiertaEn)}
      </Card.Meta>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="body-sm text-ink-2">
          Efectivo esperado <strong className="text-ink pd-tnum">{formatPrecio(efectivoEsperado(c))}</strong>
        </span>
        <Button size="sm" onClick={() => setViendoId(c.id)}>
          Ver
        </Button>
      </div>
    </Card>
  );

  const seccionOtras = (titulo) =>
    abiertas.error ? (
      <Alert tone="danger">No pudimos cargar las cajas abiertas.</Alert>
    ) : otrasAbiertas.length > 0 ? (
      <section className="flex flex-col gap-3">
        <h2 className="heading-md m-0">
          {titulo}
          <span className="pd-count">{otrasAbiertas.length}</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{otrasAbiertas.map(tarjetaOtraCaja)}</div>
      </section>
    ) : null;

  const vistaSinCaja = (
    <div className="flex flex-col gap-6">
      {propia.error && <Alert tone="danger">No pudimos leer la caja de este dispositivo. Recargá la página para intentar de nuevo.</Alert>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-start">
        <Card>
          <Card.Eyebrow>Este dispositivo</Card.Eyebrow>
          <Card.Title>Sin caja abierta</Card.Title>
          {puedeAbrir ? (
            <form
              className="mt-4 flex flex-col gap-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                abrir();
              }}
            >
              <Field label="Dispositivo" help="Cómo se llama esta caja en el club. Se recuerda en este navegador." error={errAbrir.dispositivo}>
                <Input value={formAbrir.dispositivo} onChange={(e) => setFormAbrir({ ...formAbrir, dispositivo: e.target.value })} maxLength={40} placeholder={DISPOSITIVO_POR_DEFECTO} />
              </Field>
              <Field label="Fondo inicial" help="El efectivo con el que arranca el turno (para dar cambio)." error={errAbrir.fondo}>
                <Input type="number" min="0" step="any" inputMode="decimal" value={formAbrir.fondo} onChange={(e) => setFormAbrir({ ...formAbrir, fondo: e.target.value })} />
              </Field>
              <Button type="submit" variant="primary" className="self-start" cargando={abriendo ? "Abriendo…" : ""}>
                Abrir caja
              </Button>
            </form>
          ) : (
            <p className="body-sm text-ink-2 mt-2 mb-0">Tu rol no abre cajas. Pedile a quien administra el bar que la abra, o mirá las que están abiertas.</p>
          )}
        </Card>
        {seccionOtras("Otras cajas abiertas") || (
          <Card className="text-center py-12! self-stretch">
            <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
            <p className="heading-sm m-0">Ninguna caja abierta en el club</p>
            <p className="body-sm text-ink-2 mt-1 mb-0">Cuando otro dispositivo abra la suya, aparece acá.</p>
          </Card>
        )}
      </div>
    </div>
  );

  const vistaCaja = caja && (
    <div className="flex flex-col gap-6">
      {/* Franja: dispositivo, quién y cuándo, estado */}
      <Card as="div" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="heading-md m-0 break-words">{caja.dispositivo}</h2>
            {esPropia && puedeAbrir && (
              <Button variant="ghost" size="sm" iconOnly aria-label="Renombrar dispositivo" icon={icono(Pencil)} onClick={() => setDialogo("renombrar")} />
            )}
            <Badge tone="success" dot>
              Abierta
            </Badge>
            {!esPropia && <Badge>Otro dispositivo</Badge>}
          </div>
          <p className="body-sm text-ink-2 m-0">
            Abierta{caja.abiertaPorNombre ? ` por ${caja.abiertaPorNombre}` : ""} · {formatDiaHora(caja.abiertaEn)} · fondo inicial {formatPrecio(caja.fondoInicial)}
          </p>
        </div>
        <div className="pd-btn-group">
          {cajaVista && (
            <Button variant="ghost" icon={icono(ArrowLeft)} onClick={() => setViendoId(null)}>
              Volver a mi caja
            </Button>
          )}
          {((puedeCerrar && caja.abiertaPor === uid) || puedeCerrarAjena) && (
            <Button variant="primary" icon={icono(Lock)} onClick={() => setDialogo("cerrar")}>
              Cerrar caja
            </Button>
          )}
        </div>
      </Card>

      {/* Totales en vivo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile value={formatPrecio(efectivoEsperado(caja))} label="Efectivo esperado" />
        <StatTile value={formatPrecio(caja.totales?.transferencia)} label="Transferencia" />
        <StatTile value={formatPrecio(caja.totales?.tarjeta)} label="Tarjeta" />
        <StatTile value={formatPrecio(caja.totales?.qr)} label="QR" />
      </div>

      {/* Acciones */}
      {esPropia && puedeRegistrar && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="pd-btn-group">
            <Button icon={icono(Minus)} onClick={() => setDialogo({ tipo: "retiro" })}>
              Retiro
            </Button>
            <Button icon={icono(Receipt)} onClick={() => setDialogo({ tipo: "gasto" })}>
              Gasto
            </Button>
            <Button icon={icono(Plus)} onClick={() => setDialogo({ tipo: "ingreso" })}>
              Ingreso
            </Button>
          </div>
          {pendientes && <span className="pd-help">Los totales se actualizan en unos segundos.</span>}
        </div>
      )}
      {!esPropia && <p className="body-sm text-ink-2 m-0">Estás mirando la caja de otro dispositivo: los movimientos se registran desde ese dispositivo.</p>}

      {/* Movimientos */}
      <section className="flex flex-col gap-3">
        <h2 className="heading-md m-0">
          Movimientos
          {movimientos.length > 0 && <span className="pd-count">{movimientos.length}</span>}
        </h2>
        {movs.error ? (
          <Alert tone="danger">No pudimos cargar los movimientos.</Alert>
        ) : movs.para !== cajaId ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando movimientos">
            {[0, 1].map((i) => (
              <div key={i} className="pd-skeleton h-14" />
            ))}
          </div>
        ) : movimientos.length === 0 ? (
          <Card className="text-center py-10!">
            <p className="heading-sm m-0">Todavía no hay movimientos en esta caja.</p>
            <p className="body-sm text-ink-2 mt-1 mb-0">Los retiros, gastos e ingresos del turno (y, más adelante, las ventas) quedan acá.</p>
          </Card>
        ) : (
          <>
            <div className="flex flex-col gap-4 md:hidden">
              {movimientos.map((m) => (
                <Card key={m.id}>
                  <Card.Row className="items-start!">
                    <Card.Eyebrow className="pd-tnum">{formatHora(m.creadoEn)}</Card.Eyebrow>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Badge tone={TONO_TIPO[m.tipo] || "neutral"}>{ETIQUETA_TIPO[m.tipo] || m.tipo}</Badge>
                      {m.aplicado === false && (
                        <Badge tone="warning" dot>
                          Pendiente
                        </Badge>
                      )}
                    </div>
                  </Card.Row>
                  <Card.Title className="mt-2! pd-tnum">{montoFirmado(m)}</Card.Title>
                  <dl className="pd-dl mt-3">
                    <div>
                      <dt>Medio</dt>
                      <dd>{ETIQUETA_MEDIO[m.medio] || m.medio}</dd>
                    </div>
                    <div>
                      <dt>Quién</dt>
                      <dd>{m.creadoPor === uid ? "Vos" : m.creadoPorNombre || "—"}</dd>
                    </div>
                    {m.nota && (
                      <div className="col-span-full">
                        <dt>Nota</dt>
                        <dd className="break-words">{m.nota}</dd>
                      </div>
                    )}
                  </dl>
                </Card>
              ))}
            </div>
            <div className="pd-table-wrap hidden md:block">
              <div className="overflow-x-auto">
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Tipo</th>
                      <th>Medio</th>
                      <th className="num">Monto</th>
                      <th>Nota</th>
                      <th>Quién</th>
                      <th>
                        <span className="sr-only">Aplicado</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => (
                      <tr key={m.id}>
                        <td className="pd-tnum whitespace-nowrap">{formatHora(m.creadoEn)}</td>
                        <td>
                          <Badge tone={TONO_TIPO[m.tipo] || "neutral"}>{ETIQUETA_TIPO[m.tipo] || m.tipo}</Badge>
                        </td>
                        <td>{ETIQUETA_MEDIO[m.medio] || m.medio}</td>
                        <td className="num font-semibold whitespace-nowrap">{montoFirmado(m)}</td>
                        <td className="break-words max-w-[280px]">{m.nota || "—"}</td>
                        <td>{m.creadoPor === uid ? "Vos" : m.creadoPorNombre || "—"}</td>
                        <td>
                          {m.aplicado === false && (
                            <Badge tone="warning" dot>
                              Pendiente
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {esPropia && seccionOtras("Otras cajas abiertas")}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="heading-lg m-0">Caja</h1>
      </div>

      {puedeHistorial && (
        <Tabs
          items={[
            { value: "caja", label: "Caja" },
            { value: "historial", label: "Historial" },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="Secciones de la caja"
          className="mb-6"
        />
      )}

      {tab === "historial" ? <HistorialTab clubId={clubId} puedeVer={puedeHistorial} onVer={verCierre} cargandoId={cargandoTicket} /> : caja ? vistaCaja : vistaSinCaja}

      {/* Pie: ancho del papel para los tickets de este navegador */}
      <div className="mt-10 pt-4 border-t border-line flex flex-wrap items-end justify-between gap-3">
        <Field label="Ancho del ticket" help="El papel de la impresora térmica de este dispositivo." className="max-w-[220px]">
          <Select value={String(ancho)} onChange={(e) => cambiarAncho(e.target.value)}>
            {ANCHOS_TICKET.map((a) => (
              <option key={a} value={a}>
                {a} mm
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {dialogo?.tipo && caja && (
        <MovimientoDialog tipo={dialogo.tipo} caja={caja} clubId={clubId} uid={uid} nombre={nombre} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo === "cerrar" && caja && (
        <CerrarCajaDialog
          caja={caja}
          pendientes={pendientes}
          clubId={clubId}
          uid={uid}
          nombre={nombre}
          onCerrar={() => setDialogo(null)}
          onCerrada={(cajaCerrada) => {
            setDialogo(null);
            setViendoId(null);
            abrirTicketCierre(cajaCerrada, movimientos, "Listo");
          }}
        />
      )}
      {ticket && <TicketPreview titulo={ticket.titulo} descripcion={ticket.descripcion} html={ticket.html} ancho={ancho} textoCerrar={ticket.textoCerrar} onCerrar={() => setTicket(null)} />}
      {dialogo === "renombrar" && caja && (
        <RenombrarDialog
          caja={caja}
          clubId={clubId}
          onCerrar={() => setDialogo(null)}
          onRenombrada={(nuevo) => {
            setDialogo(null);
            setDispositivo(nuevo);
            setFormAbrir((f) => ({ ...f, dispositivo: nuevo }));
          }}
        />
      )}
    </div>
  );
}
