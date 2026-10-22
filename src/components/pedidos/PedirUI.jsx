import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "../Toast";
import { confirmar } from "../ConfirmDialog";
import { Alert, Badge, Button, Card, Field, Pills, Textarea } from "../ui";
import { escucharCatalogo } from "../../services/reportesService";
import { cancelarPedido, crearPedido, escucharMisPedidosDeCuenta } from "../../services/pedidosService";
import { MAX_ITEMS, MAX_PENDIENTES, etiquetaEstado, haceCuanto, pedidoDesdeCarrito, resumenItems, subtotalPedido, tonoEstado } from "../../utils/pedidos";
import { formatPrecio } from "../../utils/format";

// Pedir a la barra (Noche): catálogo (categorías como Pills, favoritos primero), carrito con nota, "Enviar pedido",
// y "Mis pedidos de este turno" con el estado en vivo. La usan /pedir (jugador logueado) y el QR de la cancha
// (logueado o anónimo). Sin pagos acá: lo pedido va a la cuenta del turno y se cobra en el club.
//   clubId · club · reserva (agrupada) · uid · nombre · origen ("celular"|"qr") · anonimo · qrToken

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });

export default function PedirUI({ clubId, club, reserva, uid, nombre, origen = "celular", anonimo = false, qrToken = null }) {
  const grupoId = reserva.grupoId || reserva.id;
  const [prods, setProds] = useState({ lista: [], cargado: false, error: false });
  const [categorias, setCategorias] = useState([]);
  const [pedidos, setPedidos] = useState({ lista: [], cargado: false });
  const [vista, setVista] = useState("catalogo"); // "catalogo" | "pedidos"
  const [filtro, setFiltro] = useState("favoritos");
  const [carrito, setCarrito] = useState([]);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  // El catálogo público (clubs/{c}/catalogo): nombre, precio, categoría, favorito, activo, agotado — sin costos ni stock
  useEffect(() => {
    if (!clubId) return undefined;
    const unsub = escucharCatalogo(
      clubId,
      ({ productos, categorias: cats }) => {
        setProds({ lista: productos, cargado: true, error: false });
        setCategorias(cats);
      },
      (err) => {
        console.error("Error cargando el catálogo:", err);
        setProds({ lista: [], cargado: true, error: true });
      },
    );
    return () => unsub();
  }, [clubId]);

  useEffect(() => {
    if (!clubId || !grupoId || !uid) return undefined;
    const unsub = escucharMisPedidosDeCuenta(clubId, grupoId, uid, (lista) => setPedidos({ lista, cargado: true }), (err) => console.error("Error escuchando mis pedidos:", err));
    return () => unsub();
  }, [clubId, grupoId, uid]);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const activos = useMemo(() => prods.lista.filter((p) => p.activo !== false), [prods.lista]);
  const hayFavoritos = activos.some((p) => p.favorito);
  const filtroEfectivo = filtro === "favoritos" && !hayFavoritos ? "todos" : filtro;
  const pills = useMemo(() => {
    const items = [];
    if (hayFavoritos) items.push({ value: "favoritos", label: "Favoritos" });
    items.push({ value: "todos", label: "Todos" });
    const con = new Set(activos.map((p) => p.categoriaId || "sin"));
    [...categorias].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0)).forEach((c) => con.has(c.id) && items.push({ value: c.id, label: c.nombre }));
    if (con.has("sin") && categorias.length) items.push({ value: "sin", label: "Otros" });
    return items;
  }, [activos, categorias, hayFavoritos]);
  const visibles = useMemo(() => {
    let lista = activos;
    if (filtroEfectivo === "favoritos") lista = lista.filter((p) => p.favorito);
    else if (filtroEfectivo !== "todos") lista = lista.filter((p) => (p.categoriaId || "sin") === filtroEfectivo);
    return [...lista].sort((a, b) => (a.favorito ? 0 : 1) - (b.favorito ? 0 : 1) || (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(a.nombre).localeCompare(String(b.nombre), "es"));
  }, [activos, filtroEfectivo]);

  const sinStock = (p) => p.agotado === true;
  const cantidadEn = (id) => carrito.find((l) => l.productoId === id)?.cantidad || 0;
  const agregar = (p, delta = 1) =>
    setCarrito((c) => {
      const i = c.findIndex((l) => l.productoId === p.id);
      if (i < 0) {
        if (delta <= 0) return c;
        if (c.length >= MAX_ITEMS) {
          toast.error(`Hasta ${MAX_ITEMS} productos distintos por pedido`);
          return c;
        }
        return [...c, { productoId: p.id, nombre: p.nombre, precio: Number(p.precio) || 0, cantidad: 1, controlaStock: p.controlaStock !== false }];
      }
      return c.map((l, k) => (k === i ? { ...l, cantidad: l.cantidad + delta } : l)).filter((l) => l.cantidad > 0);
    });
  const subtotal = subtotalPedido(carrito);
  const pendientes = pedidos.lista.filter((p) => p.estado === "pendiente").length;
  const topePendientes = pendientes >= MAX_PENDIENTES;

  const enviar = async () => {
    if (!carrito.length || enviando) return;
    if (topePendientes) {
      toast.error(`Ya tenés ${MAX_PENDIENTES} pedidos en espera`);
      return;
    }
    setEnviando(true);
    try {
      await crearPedido(clubId, pedidoDesdeCarrito({ reserva, carrito, nota, uid, nombre, origen, anonimo, qrToken }));
      toast.success("Pedido enviado a la barra");
      setCarrito([]);
      setNota("");
      setVista("pedidos");
    } catch (e) {
      console.error("Error enviando el pedido:", e);
      toast.error(e?.code === "permission-denied" ? "No se pudo enviar: el turno no está en juego o el QR venció." : "No se pudo enviar el pedido. Revisá la conexión.");
    } finally {
      setEnviando(false);
    }
  };
  const cancelar = async (p) => {
    const ok = await confirmar({ titulo: "¿Cancelar el pedido?", mensaje: resumenItems(p.items), confirmText: "Cancelar pedido", cancelText: "Volver", danger: true });
    if (!ok) return;
    try {
      await cancelarPedido(clubId, p.id);
      toast.success("Pedido cancelado");
    } catch (e) {
      console.error("Error cancelando el pedido:", e);
      toast.error("No se pudo cancelar: la barra ya lo tomó.");
    }
  };

  const cabecera = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="pd-eyebrow m-0">{club?.nombre || "Club"}</p>
        <h1 className="heading-lg m-0 mt-1">Pedir a la barra</h1>
        <p className="body-sm text-ink-2 m-0 mt-1 pd-tnum">
          {reserva.canchaName || reserva.canchaNombre || "Cancha"} · {reserva.horaInicio}
          {reserva.horaFin ? `–${reserva.horaFin}` : ""}
          {nombre ? ` · ${nombre}` : ""}
        </p>
      </div>
      <Pills
        items={[
          { value: "catalogo", label: "Pedir" },
          { value: "pedidos", label: "Mis pedidos", count: pedidos.lista.length || undefined },
        ]}
        value={vista}
        onChange={setVista}
        ariaLabel="Sección"
      />
    </header>
  );

  if (vista === "pedidos") {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        {!pedidos.cargado ? (
          <div className="pd-skeleton h-24 rounded-lg" aria-busy="true" aria-label="Cargando" />
        ) : pedidos.lista.length === 0 ? (
          <Card className="text-center">
            <ShoppingBag className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
            <p className="heading-sm">Todavía no pediste nada en este turno.</p>
          </Card>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-3" aria-label="Mis pedidos">
            {pedidos.lista.map((p) => (
              <li key={p.id}>
                <Card>
                  <Card.Row className="items-start!">
                    <Card.Eyebrow className="pd-tnum">{haceCuanto(p.tiempos?.creado || p.creadoEn, ahora) || "ahora"}</Card.Eyebrow>
                    <Badge tone={tonoEstado(p.estado)} dot={p.estado === "pendiente" || p.estado === "aceptado"}>
                      {etiquetaEstado(p.estado)}
                    </Badge>
                  </Card.Row>
                  <p className="body-md m-0 mt-2">{resumenItems(p.items)}</p>
                  {p.nota && <p className="body-sm text-ink-2 m-0 mt-1">Nota: {p.nota}</p>}
                  {p.rechazo?.motivo && (p.estado === "rechazado" || p.estado === "cancelado") && (
                    <p className="body-sm text-danger m-0 mt-1">
                      {etiquetaEstado(p.estado)}: {p.rechazo.motivo}
                    </p>
                  )}
                  <Card.Row className="mt-3">
                    <span className="pd-tnum text-ink-2 body-sm">{formatPrecio(p.subtotal)}</span>
                    {p.estado === "pendiente" && (
                      <Button size="sm" onClick={() => cancelar(p)}>
                        Cancelar
                      </Button>
                    )}
                  </Card.Row>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button variant="primary" onClick={() => setVista("catalogo")} disabled={topePendientes} icon={<Plus className="pd-icon" size={20} aria-hidden="true" />}>
            Pedir otra cosa
          </Button>
          {topePendientes && <p className="pd-help mt-2 mb-0">Ya tenés {MAX_PENDIENTES} pedidos en espera. Cuando la barra tome alguno, podés pedir más.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-40">
      {cabecera}
      {topePendientes && <Alert tone="warning">Ya tenés {MAX_PENDIENTES} pedidos en espera: cuando la barra tome alguno, podés mandar otro.</Alert>}
      {prods.error && <Alert tone="danger">No pudimos cargar el catálogo.</Alert>}
      {!prods.cargado ? (
        <div className="grid gap-2 grid-cols-2" aria-busy="true" aria-label="Cargando catálogo">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-24 rounded-lg" />
          ))}
        </div>
      ) : activos.length === 0 ? (
        <Card className="text-center">
          <p className="heading-sm m-0">La barra todavía no cargó su carta.</p>
        </Card>
      ) : (
        <>
          {pills.length > 1 && <Pills items={pills} value={filtroEfectivo} onChange={setFiltro} ariaLabel="Categorías" />}
          <ul className="m-0 p-0 list-none grid gap-2 grid-cols-2 sm:grid-cols-3" aria-label="Carta">
            {visibles.map((p) => {
              const agotado = sinStock(p);
              const n = cantidadEn(p.id);
              return (
                <li key={p.id} className={["pd-card p-3! flex flex-col gap-2 min-h-[96px]", agotado && "opacity-60"].filter(Boolean).join(" ")}>
                  <span className="body-sm font-semibold leading-tight line-clamp-2 break-words">{p.nombre}</span>
                  <span className="flex items-end justify-between gap-2 mt-auto">
                    <span className="font-display font-bold text-[18px] pd-tnum">{formatPrecio(p.precio)}</span>
                    {agotado ? (
                      <Badge tone="danger">Sin stock</Badge>
                    ) : n > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Button size="sm" iconOnly aria-label={`Una menos de ${p.nombre}`} icon={<Minus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => agregar(p, -1)} />
                        <span className="min-w-[24px] text-center font-semibold pd-tnum">{fmtCant(n)}</span>
                        <Button size="sm" iconOnly variant="primary" aria-label={`Una más de ${p.nombre}`} icon={<Plus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => agregar(p, 1)} />
                      </span>
                    ) : (
                      <Button size="sm" variant="primary" iconOnly aria-label={`Agregar ${p.nombre}`} icon={<Plus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => agregar(p, 1)} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Carrito: pegado abajo */}
      <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-4 pointer-events-none">
        <div className="pd-card max-w-2xl mx-auto pointer-events-auto flex flex-col gap-3 shadow-[var(--shadow-overlay)]" aria-label="Tu pedido">
          {carrito.length === 0 ? (
            <p className="body-sm text-ink-2 m-0 text-center">Tocá + en lo que quieras pedir.</p>
          ) : (
            <>
              <ul className="m-0 p-0 list-none grid gap-1 max-h-40 overflow-y-auto">
                {carrito.map((l) => (
                  <li key={l.productoId} className="flex items-center justify-between gap-2 body-sm">
                    <span className="min-w-0 truncate">
                      <strong className="pd-tnum">{fmtCant(l.cantidad)} ×</strong> {l.nombre}
                    </span>
                    <span className="flex items-center gap-1 flex-none">
                      <span className="pd-tnum text-ink-2">{formatPrecio(l.precio * l.cantidad)}</span>
                      <Button size="sm" variant="ghost" iconOnly aria-label={`Quitar ${l.nombre}`} icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />} onClick={() => agregar({ id: l.productoId }, -l.cantidad)} />
                    </span>
                  </li>
                ))}
              </ul>
              <Field label="Nota para la barra" className="mb-0">
                <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo que la barra tenga que saber (sin hielo, bien frío…)" maxLength={200} />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <span className="heading-sm pd-tnum">{formatPrecio(subtotal)}</span>
                <Button variant="primary" onClick={enviar} disabled={topePendientes} cargando={enviando ? "Enviando…" : ""} icon={<ShoppingBag className="pd-icon" size={20} aria-hidden="true" />}>
                  Enviar pedido
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
