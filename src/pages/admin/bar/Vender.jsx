import { useEffect, useMemo, useRef, useState } from "react";
import { History, Printer, Wifi, WifiOff } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import { toast } from "../../../components/Toast";
import { confirmar } from "../../../components/ConfirmDialog";
import { Alert, Badge, Button, Card, Field, Select } from "../../../components/ui";
import TurnosStrip from "../../../components/pos/TurnosStrip";
import GrillaProductos from "../../../components/pos/GrillaProductos";
import TicketPanel from "../../../components/pos/TicketPanel";
import CantidadDialog from "../../../components/pos/CantidadDialog";
import DescuentoDialog from "../../../components/pos/DescuentoDialog";
import CobrarDialog from "../../../components/pos/CobrarDialog";
import VentasDeHoy from "../../../components/pos/VentasDeHoy";
import PostVentaDialog from "../../../components/pos/PostVentaDialog";
import TicketPreview from "../../../components/TicketPreview";
import { htmlTicketVenta } from "../../../print/ticketVenta";
import { imprimirHtml } from "../../../print/imprimir";
import { dispositivoGuardado, escucharCajaAbierta } from "../../../services/cajaService";
import { escucharProductos, getCategorias } from "../../../services/productosService";
import { SinNumerosError, crearVenta, estadoNumeracion, prepararNumeracion, tomarNumero } from "../../../services/ventasService";
import { useOnline, usePendientes } from "../../../utils/conexion";
import { bloqueNecesitaReserva, calcularTotales, numerosLibres } from "../../../utils/ventas";
import { formatPrecio } from "../../../utils/format";
import { ANCHOS_TICKET, anchoTicketGuardado, guardarAnchoTicket } from "../../../print/imprimir";
import { guardarImprimirDirecto, imprimirDirectoGuardado } from "../../../utils/posPrefs";

// Vender: la pantalla del bar. Izquierda, buscador + categorías + grilla; derecha, el ticket. Todo el POS depende de
// la caja abierta de ESTE dispositivo (mismo nombre que usa la pantalla Caja). Las ventas se escriben con el número
// de ticket como id (bloques por dispositivo) y sin esperar al servidor: funcionan sin internet.

const ESTADO_INICIAL = { para: null, lista: [], error: false };
const icono = (Icono, extra = {}) => <Icono className="pd-icon" size={20} aria-hidden="true" {...extra} />;

export default function Vender() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const clubId = clubActual?.id || null;
  const uid = user?.uid || null;
  const nombre = perfil?.nombre || user?.displayName || user?.email || "";
  const puedeVender = !!clubActual && puede("vender");
  const puedeAnular = !!clubActual && puede("anularVenta");
  const maxPct = clubActual?.rolStaff === "dueño" ? 100 : Number.isFinite(Number(clubActual?.descuentoMax)) ? Number(clubActual.descuentoMax) : 0;

  const online = useOnline();
  const pendientes = usePendientes();
  const [dispositivo] = useState(dispositivoGuardado);
  const [cajaEstado, setCajaEstado] = useState({ para: null, caja: null, error: false });
  const [prods, setProds] = useState(ESTADO_INICIAL);
  const [cats, setCats] = useState(ESTADO_INICIAL);
  const [numeracion, setNumeracion] = useState(() => (clubId ? estadoNumeracion(clubId) : { proximo: null, agotado: true, bloque: null }));
  const [items, setItems] = useState([]);
  const [descuentoGeneral, setDescuentoGeneral] = useState(null);
  const [cliente, setCliente] = useState({ nombre: "", telefono: "" });
  const [ultimaVenta, setUltimaVenta] = useState(null); // panel post-venta
  const [reimpresion, setReimpresion] = useState(null); // venta a reimprimir desde "Ventas"
  const [dialogo, setDialogo] = useState(null);
  const [ancho, setAncho] = useState(anchoTicketGuardado);
  const [imprimirDirecto, setImprimirDirecto] = useState(imprimirDirectoGuardado);
  const inputRef = useRef(null);

  const enfocar = () => setTimeout(() => inputRef.current?.focus(), 0);

  // Caja abierta de este dispositivo
  useEffect(() => {
    if (!clubId || !puedeVender) return undefined;
    const unsub = escucharCajaAbierta(
      clubId,
      dispositivo,
      (caja) => setCajaEstado({ para: clubId, caja, error: false }),
      (err) => {
        console.error("Error escuchando la caja:", err);
        setCajaEstado({ para: clubId, caja: null, error: true });
      },
    );
    return () => unsub();
  }, [clubId, dispositivo, puedeVender]);

  // Productos (en vivo: el stock cambia con cada venta) y categorías
  useEffect(() => {
    if (!clubId || !puedeVender) return undefined;
    let vivo = true;
    const unsub = escucharProductos(
      clubId,
      (lista) => setProds({ para: clubId, lista, error: false }),
      (err) => {
        console.error("Error escuchando productos:", err);
        setProds({ para: clubId, lista: [], error: true });
      },
    );
    getCategorias(clubId)
      .then((lista) => vivo && setCats({ para: clubId, lista, error: false }))
      .catch((e) => {
        console.error("Error cargando categorías:", e);
        if (vivo) setCats({ para: clubId, lista: [], error: true });
      });
    return () => {
      vivo = false;
      unsub();
    };
  }, [clubId, puedeVender]);

  // Numeración lista de antemano: código del dispositivo y bloque con números (pide más cuando quedan pocos)
  const caja = cajaEstado.para === clubId ? cajaEstado.caja : null;
  useEffect(() => {
    if (!clubId || !puedeVender || !caja || !online) return undefined;
    let vivo = true;
    prepararNumeracion(clubId, { dispositivo, uid, online: true }).then(() => vivo && setNumeracion(estadoNumeracion(clubId)));
    return () => {
      vivo = false;
    };
  }, [clubId, puedeVender, caja, online, dispositivo, uid]);

  const productos = useMemo(() => (prods.para === clubId ? prods.lista : []), [prods, clubId]);
  const categorias = useMemo(() => (cats.para === clubId ? cats.lista : []), [cats, clubId]);
  const totales = useMemo(() => calcularTotales(items, descuentoGeneral, maxPct), [items, descuentoGeneral, maxPct]);
  const sinNumeros = numeracion.agotado && !online;
  const bloqueo = !caja ? "Abrí la caja para vender" : sinNumeros ? "Sin números de ticket: conectate a internet un momento" : "";

  // ----- Ticket -----
  const agregar = (p, cantidad = 1) => {
    setItems((lista) => {
      const i = lista.findIndex((l) => l.productoId === p.id);
      if (i >= 0) return lista.map((l, k) => (k === i ? { ...l, cantidad: l.cantidad + cantidad } : l));
      return [...lista, { key: p.id, productoId: p.id, nombre: p.nombre, precio: Number(p.precio) || 0, cantidad, descuento: 0, controlaStock: p.controlaStock !== false }];
    });
    enfocar();
  };
  const cambiarCantidad = (linea, delta) => {
    setItems((lista) => lista.map((l) => (l.key === linea.key ? { ...l, cantidad: l.cantidad + delta } : l)).filter((l) => l.cantidad > 0));
    enfocar();
  };
  const quitar = (linea) => {
    setItems((lista) => lista.filter((l) => l.key !== linea.key));
    enfocar();
  };
  const limpiar = () => {
    setItems([]);
    setDescuentoGeneral(null);
    setCliente({ nombre: "", telefono: "" });
  };
  const vaciar = async () => {
    if (items.length === 0) return;
    const ok = await confirmar({ titulo: "¿Vaciar el ticket?", mensaje: "Se quitan todas las líneas.", confirmText: "Vaciar", danger: true });
    if (ok) limpiar();
    enfocar();
  };
  const cerrarDialogo = () => {
    setDialogo(null);
    enfocar();
  };

  // ----- Venta -----
  const confirmarVenta = async (calculo) => {
    if (!caja) throw new Error("Abrí la caja para vender");
    let estado = estadoNumeracion(clubId);
    if (estado.agotado) {
      if (!online) throw new SinNumerosError();
      await prepararNumeracion(clubId, { dispositivo, uid, online: true });
      estado = estadoNumeracion(clubId);
      if (estado.agotado) throw new SinNumerosError();
    }
    const { numero, n, codigo } = tomarNumero(clubId);
    const venta = {
      numero,
      dispositivo,
      codigoDispositivo: codigo,
      secuencia: n,
      cajaId: caja.id,
      items: totales.lineas.map((l) => ({
        productoId: l.productoId,
        nombre: l.nombre,
        precio: l.precio,
        cantidad: l.cantidad,
        descuento: l.descuento,
        subtotal: l.subtotal,
        controlaStock: l.controlaStock !== false,
      })),
      subtotal: totales.subtotal,
      descuento: totales.descuento,
      descuentoTotal: totales.descuentoTotal,
      total: totales.total,
      pagos: calculo.pagos,
      pagado: calculo.pagado,
      vuelto: calculo.vuelto,
      cuentaId: null,
      cliente: cliente.nombre.trim() || cliente.telefono.trim() ? { nombre: cliente.nombre.trim() || null, telefono: cliente.telefono.trim() || null } : null,
      creadoPor: uid,
      creadoPorNombre: nombre || null,
    };
    crearVenta(clubId, venta);
    toast.success(`Venta ${numero} · ${formatPrecio(venta.total)}`);
    limpiar();
    setDialogo(null);
    setUltimaVenta({ ...venta, creadoEn: new Date(), estado: "ok" });
    setNumeracion(estadoNumeracion(clubId));
    if (online && bloqueNecesitaReserva(estadoNumeracion(clubId).bloque)) {
      prepararNumeracion(clubId, { dispositivo, uid, online: true }).then(() => setNumeracion(estadoNumeracion(clubId)));
    }
    enfocar();
  };

  // Reimpresión desde "Ventas": directa (ajuste) o con vista previa
  const reimprimir = async (venta) => {
    if (imprimirDirecto) {
      await imprimirHtml(htmlTicketVenta({ club: clubActual, venta, clubId }), { ancho, titulo: `Ticket ${venta.numero}` });
      return;
    }
    setReimpresion(venta);
  };

  const cambiarAncho = (valor) => {
    const n = Number(valor);
    guardarAnchoTicket(n);
    setAncho(ANCHOS_TICKET.includes(n) ? n : 80);
  };
  const cambiarImprimirDirecto = (valor) => {
    guardarImprimirDirecto(valor);
    setImprimirDirecto(valor);
  };

  // ----- Estados previos -----
  if (!clubCargado || (clubActual && puedeVender && cajaEstado.para !== clubId && !cajaEstado.error)) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-40" />
        <div className="pd-skeleton h-10 w-full max-w-md" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="pd-skeleton h-64 rounded-lg" />
          <div className="pd-skeleton h-64 rounded-lg" />
        </div>
      </div>
    );
  }
  if (!clubActual) {
    return (
      <Card className="text-center py-12!">
        <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
        <p className="heading-sm m-0">No tenés un club registrado</p>
        <p className="body-sm text-ink-2 mt-1 m-0">Registrate como club o pedí que te sumen al equipo de uno para vender en el bar.</p>
      </Card>
    );
  }
  if (!puedeVender) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Vender</h1>
        <SinPermiso />
      </div>
    );
  }

  const lineaDescuento = dialogo?.tipo === "descLinea" ? totales.lineas.find((l) => l.key === dialogo.key) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h1 className="heading-lg m-0">Vender</h1>
          {caja ? (
            <Badge tone="success" dot>
              {caja.dispositivo} · abierta
            </Badge>
          ) : (
            <Badge tone="warning">{dispositivo} · sin caja</Badge>
          )}
          <Badge tone={online ? "neutral" : "danger"} className="inline-flex items-center gap-1">
            {online ? <Wifi className="pd-icon" size={16} aria-hidden="true" /> : <WifiOff className="pd-icon" size={16} aria-hidden="true" />}
            {online ? (pendientes.length ? `${pendientes.length} por sincronizar` : "En línea") : `Sin conexión${pendientes.length ? ` · ${pendientes.length} por sincronizar` : ""}`}
          </Badge>
        </div>
        <div className="pd-btn-group">
          <Button icon={icono(History)} onClick={() => setDialogo({ tipo: "ventas" })} disabled={!caja}>
            Ventas
          </Button>
        </div>
      </div>

      {numeracion.proximo ? (
        <p className="pd-help m-0">
          Próximo ticket {numeracion.proximo} · {numerosLibres(numeracion.bloque)} números disponibles sin conexión
        </p>
      ) : (
        caja && <p className="pd-help m-0">{online ? "Preparando la numeración de tickets…" : "Sin números de ticket: conectate a internet un momento."}</p>
      )}

      {cajaEstado.error && <Alert tone="danger">No pudimos leer la caja de este dispositivo. Recargá la página para intentar de nuevo.</Alert>}
      {!caja && !cajaEstado.error && (
        <Alert tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>Abrí la caja para vender.</strong> Las ventas de este dispositivo ({dispositivo}) entran en su caja.
            </span>
            <Button as="link" to="/admin/bar/caja" size="sm">
              Ir a Caja
            </Button>
          </div>
        </Alert>
      )}
      {prods.error && <Alert tone="danger">No pudimos cargar los productos.</Alert>}

      <TurnosStrip clubId={clubId} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <GrillaProductos
          productos={productos}
          categorias={categorias}
          inputRef={inputRef}
          deshabilitado={!caja}
          onAgregar={agregar}
          onCantidad={(p) => setDialogo({ tipo: "cantidad", producto: p })}
        />
        <TicketPanel
          className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-48px)]"
          totales={totales}
          maxPct={maxPct}
          cliente={cliente}
          onCliente={setCliente}
          onCantidad={cambiarCantidad}
          onQuitar={quitar}
          onDescuentoLinea={(l) => setDialogo({ tipo: "descLinea", key: l.key })}
          onDescuentoGeneral={() => setDialogo({ tipo: "descGeneral" })}
          onCobrar={() => setDialogo({ tipo: "cobrar" })}
          onVaciar={vaciar}
          bloqueo={bloqueo}
        />
      </div>

      {/* Pie: preferencias de impresión de este navegador */}
      <div className="mt-6 pt-4 border-t border-line flex flex-wrap items-end gap-4">
        <Field label="Ancho del ticket" className="max-w-[200px]">
          <Select value={String(ancho)} onChange={(e) => cambiarAncho(e.target.value)}>
            {ANCHOS_TICKET.map((a) => (
              <option key={a} value={a}>
                {a} mm
              </option>
            ))}
          </Select>
        </Field>
        <label className="pd-check h-11">
          <input type="checkbox" checked={imprimirDirecto} onChange={(e) => cambiarImprimirDirecto(e.target.checked)} />
          <Printer className="pd-icon" size={20} aria-hidden="true" />
          Imprimir sin vista previa
        </label>
        <Button as="link" to="/admin/bar/kiosk" variant="ghost" size="sm" className="ml-auto">
          Configurar PC de barra
        </Button>
      </div>

      {dialogo?.tipo === "cantidad" && (
        <CantidadDialog
          producto={dialogo.producto}
          onCerrar={cerrarDialogo}
          onConfirmar={(n) => {
            agregar(dialogo.producto, n);
            setDialogo(null);
          }}
        />
      )}
      {lineaDescuento && (
        <DescuentoDialog
          titulo="Descuento en la línea"
          descripcion={lineaDescuento.nombre}
          base={lineaDescuento.bruto}
          maxPct={maxPct}
          inicial={lineaDescuento.descuento > 0 ? { tipo: "monto", valor: lineaDescuento.descuento } : null}
          onCerrar={cerrarDialogo}
          onQuitar={() => {
            setItems((lista) => lista.map((l) => (l.key === lineaDescuento.key ? { ...l, descuento: 0 } : l)));
            cerrarDialogo();
          }}
          onGuardar={({ tipo, valor }) => {
            const monto = tipo === "monto" ? valor : (lineaDescuento.bruto * valor) / 100;
            setItems((lista) => lista.map((l) => (l.key === lineaDescuento.key ? { ...l, descuento: Math.round(monto * 100) / 100 } : l)));
            cerrarDialogo();
          }}
        />
      )}
      {dialogo?.tipo === "descGeneral" && (
        <DescuentoDialog
          titulo="Descuento del ticket"
          descripcion={`Sobre el subtotal de ${formatPrecio(totales.subtotal)}`}
          base={totales.subtotal}
          maxPct={maxPct}
          inicial={descuentoGeneral}
          onCerrar={cerrarDialogo}
          onQuitar={() => {
            setDescuentoGeneral(null);
            cerrarDialogo();
          }}
          onGuardar={(d) => {
            setDescuentoGeneral(d);
            cerrarDialogo();
          }}
        />
      )}
      {dialogo?.tipo === "cobrar" && <CobrarDialog total={totales.total} sinNumeros={sinNumeros} onCerrar={cerrarDialogo} onConfirmar={confirmarVenta} />}
      {dialogo?.tipo === "ventas" && caja && (
        <VentasDeHoy clubId={clubId} caja={caja} uid={uid} nombre={nombre} puedeAnular={puedeAnular} onReimprimir={reimprimir} onCerrar={cerrarDialogo} />
      )}
      {ultimaVenta && (
        <PostVentaDialog
          venta={ultimaVenta}
          club={clubActual}
          clubId={clubId}
          ancho={ancho}
          imprimirDirecto={imprimirDirecto}
          onCerrar={() => {
            setUltimaVenta(null);
            enfocar();
          }}
        />
      )}
      {reimpresion && (
        <TicketPreview
          titulo={`Ticket ${reimpresion.numero}`}
          html={htmlTicketVenta({ club: clubActual, venta: reimpresion, clubId })}
          ancho={ancho}
          onCerrar={() => setReimpresion(null)}
          onImprimido={() => setReimpresion(null)}
        />
      )}
    </div>
  );
}
