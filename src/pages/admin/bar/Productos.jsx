import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Download, Pencil, Plus, RefreshCw, Star, Trash2, Upload, X } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import Dialogo from "../../../components/Dialogo";
import { toast } from "../../../components/Toast";
import { confirmar } from "../../../components/ConfirmDialog";
import { Alert, Badge, Button, Card, Field, Input, Pills, SearchInput, Select, Tabs } from "../../../components/ui";
import {
  escucharProductos,
  crearProducto,
  actualizarProducto,
  actualizarCamposProducto,
  crearMovimiento,
  getMovimientos,
  getCategorias,
  crearCategoria,
  crearCategoriasSugeridas,
  actualizarCategoria,
  intercambiarOrden,
  eliminarCategoria,
  getProveedores,
  crearProveedor,
  actualizarProveedor,
  guardarMapeoProveedor,
  eliminarProveedor,
  UNIDADES,
  CATEGORIAS_SUGERIDAS,
} from "../../../services/productosService";
import { margenPorcentaje, tonoStock, stockBajo, normalizarNombre, ETIQUETA_UNIDAD } from "../../../utils/productos";
import { formatPrecio } from "../../../utils/format";
import { formatDiaCorto, aDate } from "../../../utils/formatDate";
import { descargarPlantilla } from "../../../utils/plantillaProductos";
import { escucharAlertasStock } from "../../../services/reportesService";

// El asistente de importación (y SheetJS, que carga él) se bajan recién al abrirlo
const ImportarProductos = lazy(() => import("./ImportarProductos"));

// ----- Helpers de formato -----

// Cantidades: hasta tres decimales (kilos y litros), con el formato es-AR
const fmtCantidad = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
const unidadDe = (p) => ETIQUETA_UNIDAD[p?.unidad] || "u";
const textoStock = (p) => `${fmtCantidad(p?.stock)} ${unidadDe(p)}`;
const fmtMargen = (p) => {
  const m = margenPorcentaje(p.precio, p.costo);
  return m === null ? "—" : `${m} %`;
};
const fmtCosto = (c) => (c === null || c === undefined || c === "" ? "—" : formatPrecio(c));

// Cantidad con signo: "+3", "−2"
const conSigno = (n) => {
  const v = Number(n) || 0;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtCantidad(Math.abs(v))}`;
};

// Timestamp de Firestore → "DD/MM/YY HH:MM"
const fechaHora = (valor) => {
  if (!valor) return "—";
  const d = typeof valor.toDate === "function" ? valor.toDate() : valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  const dos = (x) => String(x).padStart(2, "0");
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${dos(d.getFullYear() % 100)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

const numero = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const aTexto = (v) => (v === null || v === undefined ? "" : String(v));

// Activos primero; después por orden y por nombre
const ordenarProductos = (a, b) => {
  const aa = a.activo !== false ? 0 : 1;
  const bb = b.activo !== false ? 0 : 1;
  if (aa !== bb) return aa - bb;
  const oa = Number(a.orden) || 0;
  const ob = Number(b.orden) || 0;
  if (oa !== ob) return oa - ob;
  return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
};

const TIPOS_AJUSTE = [
  { value: "compra", label: "Compra" },
  { value: "ajuste", label: "Ajuste" },
  { value: "merma", label: "Merma" },
];

const TIPO_MOVIMIENTO = {
  compra: { label: "Compra", tone: "success" },
  ajuste: { label: "Ajuste", tone: "neutral" },
  merma: { label: "Merma", tone: "warning" },
  importacion: { label: "Importación", tone: "court" },
  venta: { label: "Venta", tone: "neutral" },
  anulacion: { label: "Anulación", tone: "neutral" },
};

const icono = (Icono, extra = {}) => <Icono className="pd-icon" size={20} aria-hidden="true" {...extra} />;

// ----- Nuevo producto / Editar -----

const formDeProducto = (p) => ({
  nombre: p?.nombre || "",
  categoriaId: p?.categoriaId || "",
  precio: aTexto(p?.precio),
  costo: aTexto(p?.costo),
  sku: p?.sku || "",
  codigoBarras: p?.codigoBarras || "",
  unidad: p?.unidad || "u",
  controlaStock: p ? p.controlaStock !== false : true,
  stockMinimo: aTexto(p?.stockMinimo),
  favorito: !!p?.favorito,
  activo: p ? p.activo !== false : true,
  orden: aTexto(p?.orden ?? 0),
  stockInicial: "",
  tipoInicial: "compra",
});

function ProductoDialog({ producto, categorias, clubId, uid, puedeStock, onCerrar, onCreado }) {
  const nuevo = !producto;
  const [form, setForm] = useState(() => formDeProducto(producto));
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const validar = () => {
    const err = {};
    if (!form.nombre.trim()) err.nombre = "Poné el nombre del producto.";
    const precio = numero(form.precio);
    if (precio === null) err.precio = "Poné el precio.";
    else if (!Number.isFinite(precio) || precio < 0) err.precio = "El precio tiene que ser 0 o más.";
    const costo = numero(form.costo);
    if (costo !== null && (!Number.isFinite(costo) || costo < 0)) err.costo = "El costo tiene que ser 0 o más.";
    const minimo = numero(form.stockMinimo);
    if (minimo !== null && (!Number.isFinite(minimo) || minimo < 0)) err.stockMinimo = "El mínimo tiene que ser 0 o más.";
    const orden = numero(form.orden);
    if (orden !== null && !Number.isFinite(orden)) err.orden = "Poné un número.";
    if (nuevo) {
      const inicial = numero(form.stockInicial);
      if (inicial !== null && (!Number.isFinite(inicial) || inicial < 0)) err.stockInicial = "El stock inicial tiene que ser 0 o más.";
    }
    return err;
  };

  const guardar = async () => {
    const err = validar();
    setErrores(err);
    if (Object.keys(err).length > 0) return;
    const { stockInicial, tipoInicial, ...datos } = form;
    setGuardando(true);
    try {
      if (nuevo) {
        const inicial = puedeStock ? numero(stockInicial) : null;
        const id = await crearProducto(clubId, datos, { stockInicial: inicial, tipoInicial, uid });
        if (inicial) onCreado?.(id);
        toast.success("Producto creado");
      } else {
        await actualizarProducto(clubId, producto.id, datos);
        toast.success("Producto actualizado");
      }
      onCerrar();
    } catch (e) {
      console.error("Error guardando el producto:", e);
      toast.error(nuevo ? "No pudimos crear el producto. Intentá de nuevo." : "No pudimos guardar el producto. Intentá de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo={nuevo ? "Nuevo producto" : "Editar producto"}
      onCerrar={onCerrar}
      onSubmit={guardar}
      ancho
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            {nuevo ? "Crear producto" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 mt-4 md:grid-cols-2">
        <Field label="Nombre" error={errores.nombre} className="md:col-span-2">
          <Input type="text" value={form.nombre} onChange={set("nombre")} placeholder="Ej: Agua mineral 500 ml" required data-autofocus />
        </Field>
        <Field label="Categoría">
          <Select value={form.categoriaId} onChange={set("categoriaId")}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unidad">
          <Select value={form.unidad} onChange={set("unidad")}>
            {UNIDADES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Precio" error={errores.precio}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={form.precio} onChange={set("precio")} required />
        </Field>
        <Field label="Costo" help="Opcional. Sirve para calcular el margen." error={errores.costo}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={form.costo} onChange={set("costo")} />
        </Field>
        <Field label="SKU">
          <Input type="text" value={form.sku} onChange={set("sku")} autoComplete="off" />
        </Field>
        <Field label="Código de barras">
          <Input type="text" value={form.codigoBarras} onChange={set("codigoBarras")} inputMode="numeric" autoComplete="off" />
        </Field>
        <Field label="Stock mínimo" help="Por debajo de este número se marca como stock bajo." error={errores.stockMinimo}>
          <Input type="number" min="0" step="any" inputMode="decimal" value={form.stockMinimo} onChange={set("stockMinimo")} />
        </Field>
        <Field label="Orden" help="Los números más bajos van primero." error={errores.orden}>
          <Input type="number" step="1" inputMode="numeric" value={form.orden} onChange={set("orden")} />
        </Field>
        {nuevo && puedeStock && (
          <>
            <Field label="Stock inicial" help="Opcional." error={errores.stockInicial}>
              <Input type="number" min="0" step="any" inputMode="decimal" value={form.stockInicial} onChange={set("stockInicial")} />
            </Field>
            <Field label="Cargarlo como" help="Se registra como un movimiento de stock.">
              <Select value={form.tipoInicial} onChange={set("tipoInicial")}>
                <option value="compra">Compra</option>
                <option value="ajuste">Ajuste</option>
              </Select>
            </Field>
          </>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-3 md:col-span-2">
          <label className="pd-check">
            <input type="checkbox" checked={form.controlaStock} onChange={set("controlaStock")} />
            Controla stock
          </label>
          <label className="pd-check">
            <input type="checkbox" checked={form.favorito} onChange={set("favorito")} />
            Favorito
          </label>
          {!nuevo && (
            <label className="pd-check">
              <input type="checkbox" checked={form.activo} onChange={set("activo")} />
              Activo
            </label>
          )}
        </div>
      </div>
    </Dialogo>
  );
}

// ----- Ajustar stock -----

function StockDialog({ producto, proveedores, clubId, uid, onCerrar, onMovido }) {
  const [tipo, setTipo] = useState("compra");
  const [cantidad, setCantidad] = useState("");
  const [costoUnitario, setCostoUnitario] = useState(aTexto(producto.costo));
  const [proveedorId, setProveedorId] = useState("");
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const esAjuste = tipo === "ajuste";
  const esCompra = tipo === "compra";

  const guardar = async () => {
    const err = {};
    const n = numero(cantidad);
    if (n === null || !Number.isFinite(n) || n === 0) err.cantidad = esAjuste ? "Poné una cantidad distinta de 0." : "Poné una cantidad mayor que 0.";
    else if (!esAjuste && n < 0) err.cantidad = "Poné una cantidad mayor que 0.";
    const costo = numero(costoUnitario);
    if (esCompra && costo !== null && (!Number.isFinite(costo) || costo < 0)) err.costoUnitario = "El costo tiene que ser 0 o más.";
    if (!esCompra && !nota.trim()) err.nota = "Contá por qué cambia el stock.";
    setErrores(err);
    if (Object.keys(err).length > 0) return;
    setGuardando(true);
    try {
      await crearMovimiento(clubId, {
        productoId: producto.id,
        tipo,
        cantidad: tipo === "merma" ? -Math.abs(n) : n,
        costoUnitario: esCompra ? costo : null,
        proveedorId: esCompra ? proveedorId || null : null,
        nota: nota.trim() || null,
        uid,
      });
      toast.success("Movimiento registrado");
      onMovido(producto.id, Number(producto.stock) || 0);
      onCerrar();
    } catch (e) {
      console.error("Error registrando el movimiento:", e);
      toast.error("No pudimos registrar el movimiento. Intentá de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo="Ajustar stock"
      descripcion={`${producto.nombre} · stock actual ${textoStock(producto)}`}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Registrar movimiento
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 mt-4">
        <Field label="Tipo" as="div">
          <Pills
            items={TIPOS_AJUSTE}
            value={tipo}
            onChange={(v) => {
              setTipo(v);
              setErrores({});
            }}
            ariaLabel="Tipo de movimiento"
          />
        </Field>
        <Field
          label={`Cantidad (${unidadDe(producto)})`}
          help={esAjuste ? "Positivo suma, negativo resta." : tipo === "merma" ? "Lo que se perdió o se rompió: se resta del stock." : "Lo que entra al stock."}
          error={errores.cantidad}
        >
          <Input
            type="number"
            step="any"
            min={esAjuste ? undefined : "0"}
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            data-autofocus
          />
        </Field>
        {esCompra && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Costo unitario" help="Opcional." error={errores.costoUnitario}>
              <Input type="number" min="0" step="any" inputMode="decimal" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} />
            </Field>
            <Field label="Proveedor">
              <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Nota" help={esCompra ? "Opcional." : undefined} error={errores.nota}>
          <Input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={esCompra ? "" : "Ej: conteo del viernes"} />
        </Field>
      </div>
    </Dialogo>
  );
}

// ----- Pestaña Categorías -----

function CategoriasTab({ clubId, estado, productos, puedeEditar, onRecargar }) {
  const [nueva, setNueva] = useState("");
  const [errorNueva, setErrorNueva] = useState("");
  const [editando, setEditando] = useState(null); // { id, nombre }
  const [trabajando, setTrabajando] = useState(""); // qué acción está en curso

  const categorias = estado.lista;
  const conteo = useMemo(() => {
    const c = {};
    productos.forEach((p) => {
      if (p.categoriaId) c[p.categoriaId] = (c[p.categoriaId] || 0) + 1;
    });
    return c;
  }, [productos]);

  const correr = async (clave, fn, ok, error) => {
    setTrabajando(clave);
    try {
      await fn();
      if (ok) toast.success(ok);
      await onRecargar();
    } catch (e) {
      console.error(e);
      toast.error(error);
    }
    setTrabajando("");
  };

  const crear = (e) => {
    e.preventDefault();
    const nombre = nueva.trim();
    if (!nombre) {
      setErrorNueva("Poné el nombre de la categoría.");
      return;
    }
    if (categorias.some((c) => normalizarNombre(c.nombre) === normalizarNombre(nombre))) {
      setErrorNueva("Ya hay una categoría con ese nombre.");
      return;
    }
    setErrorNueva("");
    const orden = categorias.reduce((m, c) => Math.max(m, Number(c.orden) || 0), -1) + 1;
    correr(
      "nueva",
      async () => {
        await crearCategoria(clubId, nombre, orden);
        setNueva("");
      },
      "Categoría creada",
      "No pudimos crear la categoría. Intentá de nuevo.",
    );
  };

  const guardarNombre = (e) => {
    e.preventDefault();
    const nombre = editando?.nombre.trim();
    if (!nombre) return;
    correr(
      "renombrar",
      async () => {
        await actualizarCategoria(clubId, editando.id, { nombre });
        setEditando(null);
      },
      "Categoría actualizada",
      "No pudimos guardar el nombre. Intentá de nuevo.",
    );
  };

  // Intercambia con la vecina; si los órdenes guardados están repetidos, primero los numera según la lista
  const mover = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= categorias.length) return;
    correr(
      "mover",
      async () => {
        const desordenadas = categorias.some((c, k) => (Number(c.orden) || 0) !== k);
        if (desordenadas) {
          await Promise.all(categorias.map((c, k) => ((Number(c.orden) || 0) !== k ? actualizarCategoria(clubId, c.id, { orden: k }) : null)));
          await intercambiarOrden(clubId, { id: categorias[i].id, orden: i }, { id: categorias[j].id, orden: j });
        } else {
          await intercambiarOrden(clubId, categorias[i], categorias[j]);
        }
      },
      null,
      "No pudimos cambiar el orden. Intentá de nuevo.",
    );
  };

  const eliminar = async (c) => {
    const ok = await confirmar({
      titulo: "Eliminar categoría",
      mensaje: `¿Eliminar la categoría ${c.nombre}?`,
      confirmText: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    correr("eliminar", () => eliminarCategoria(clubId, c.id), "Categoría eliminada", "No pudimos eliminar la categoría. Intentá de nuevo.");
  };

  if (estado.cargando) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando categorías">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pd-skeleton h-14" />
        ))}
      </div>
    );
  }

  if (estado.error) {
    return (
      <Alert tone="danger">
        <p className="m-0">No pudimos cargar las categorías.</p>
        <Button size="sm" className="mt-2" onClick={onRecargar}>
          Reintentar
        </Button>
      </Alert>
    );
  }

  const formNueva = puedeEditar && (
    <form onSubmit={crear} className="flex flex-wrap items-end gap-2" noValidate>
      <Field label="Nueva categoría" error={errorNueva} className="flex-1 min-w-[200px] max-w-sm">
        <Input type="text" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ej: Bebidas" />
      </Field>
      <Button type="submit" icon={icono(Plus)} cargando={trabajando === "nueva" ? "Creando…" : ""} className={errorNueva ? "mb-5" : undefined}>
        Crear
      </Button>
    </form>
  );

  if (categorias.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="text-center py-10!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="heading-sm m-0">Todavía no hay categorías.</p>
          <p className="body-sm text-ink-2 mt-1 mb-0">
            {puedeEditar
              ? `Creá las sugeridas (${CATEGORIAS_SUGERIDAS.join(", ")}) o cargá las tuyas.`
              : "Pedile a quien administra el bar que las cargue."}
          </p>
          {puedeEditar && (
            <Button
              className="mt-4"
              cargando={trabajando === "sugeridas" ? "Creando…" : ""}
              onClick={() =>
                correr("sugeridas", () => crearCategoriasSugeridas(clubId), "Categorías creadas", "No pudimos crear las categorías. Intentá de nuevo.")
              }
            >
              Crear las sugeridas
            </Button>
          )}
        </Card>
        {formNueva}
      </div>
    );
  }

  const ocupado = !!trabajando;

  return (
    <div className="flex flex-col gap-4">
      <ul className="pd-table-wrap m-0 p-0 list-none">
        {categorias.map((c, i) => {
          const n = conteo[c.id] || 0;
          const enEdicion = editando?.id === c.id;
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-line first:border-t-0">
              {enEdicion ? (
                <form onSubmit={guardarNombre} className="flex flex-1 flex-wrap items-center gap-2" noValidate>
                  <Input
                    type="text"
                    value={editando.nombre}
                    onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                    aria-label={`Nuevo nombre de ${c.nombre}`}
                    className="h-9! flex-1 min-w-[160px] max-w-sm"
                    autoFocus
                  />
                  <Button type="submit" size="sm" disabled={!editando.nombre.trim()} cargando={trabajando === "renombrar" ? "Guardando…" : ""}>
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                    Cancelar
                  </Button>
                </form>
              ) : (
                <div className="flex-1 min-w-[160px]">
                  <p className="heading-sm m-0 break-words">{c.nombre}</p>
                  <p className="body-sm text-ink-2 m-0 pd-tnum">{n === 0 ? "Sin productos" : `Tiene ${n} ${n === 1 ? "producto" : "productos"}`}</p>
                </div>
              )}
              {puedeEditar && !enEdicion && (
                <div className="pd-btn-group flex-nowrap!">
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={icono(ChevronUp)}
                    aria-label={`Subir ${c.nombre}`}
                    disabled={i === 0 || ocupado}
                    onClick={() => mover(i, -1)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={icono(ChevronDown)}
                    aria-label={`Bajar ${c.nombre}`}
                    disabled={i === categorias.length - 1 || ocupado}
                    onClick={() => mover(i, 1)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={icono(Pencil)}
                    aria-label={`Cambiar el nombre de ${c.nombre}`}
                    disabled={ocupado}
                    onClick={() => setEditando({ id: c.id, nombre: c.nombre || "" })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={icono(Trash2)}
                    aria-label={`Eliminar ${c.nombre}`}
                    title={n > 0 ? "Tiene productos: pasalos a otra categoría para poder eliminarla" : undefined}
                    disabled={n > 0 || ocupado}
                    onClick={() => eliminar(c)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {formNueva}
    </div>
  );
}

// ----- Pestaña Proveedores -----

function ProveedorDialog({ proveedor, clubId, onCerrar, onGuardado }) {
  const nuevo = !proveedor;
  const [form, setForm] = useState({
    nombre: proveedor?.nombre || "",
    contacto: proveedor?.contacto || "",
    telefono: proveedor?.telefono || "",
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const guardar = async () => {
    if (!form.nombre.trim()) {
      setError("Poné el nombre del proveedor.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      if (nuevo) await crearProveedor(clubId, form);
      else await actualizarProveedor(clubId, proveedor.id, form);
      toast.success(nuevo ? "Proveedor creado" : "Proveedor actualizado");
      await onGuardado();
      onCerrar();
    } catch (e) {
      console.error("Error guardando el proveedor:", e);
      toast.error("No pudimos guardar el proveedor. Intentá de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo={nuevo ? "Nuevo proveedor" : "Editar proveedor"}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            {nuevo ? "Crear proveedor" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 mt-4">
        <Field label="Nombre" error={error}>
          <Input type="text" value={form.nombre} onChange={set("nombre")} required data-autofocus />
        </Field>
        <Field label="Contacto" help="Opcional.">
          <Input type="text" value={form.contacto} onChange={set("contacto")} />
        </Field>
        <Field label="Teléfono" help="Opcional.">
          <Input type="tel" inputMode="tel" value={form.telefono} onChange={set("telefono")} />
        </Field>
      </div>
    </Dialogo>
  );
}

function ProveedoresTab({ clubId, estado, puedeEditar, puedeMapeo, onRecargar }) {
  const [dialogo, setDialogo] = useState(null); // { proveedor } (null = nuevo)

  const olvidarMapeo = async (p) => {
    try {
      await guardarMapeoProveedor(clubId, p.id, null);
      toast.success("Mapeo olvidado");
      await onRecargar();
    } catch (e) {
      console.error(e);
      toast.error("No pudimos olvidar el mapeo. Intentá de nuevo.");
    }
  };

  const eliminar = async (p) => {
    const ok = await confirmar({
      titulo: "Eliminar proveedor",
      mensaje: `¿Eliminar a ${p.nombre}? Los movimientos que ya lo nombran quedan sin proveedor.`,
      confirmText: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await eliminarProveedor(clubId, p.id);
      toast.success("Proveedor eliminado");
      await onRecargar();
    } catch (e) {
      console.error(e);
      toast.error("No pudimos eliminar el proveedor. Intentá de nuevo.");
    }
  };

  if (estado.cargando) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando proveedores">
        {[0, 1].map((i) => (
          <div key={i} className="pd-skeleton h-24" />
        ))}
      </div>
    );
  }

  if (estado.error) {
    return (
      <Alert tone="danger">
        <p className="m-0">No pudimos cargar los proveedores.</p>
        <Button size="sm" className="mt-2" onClick={onRecargar}>
          Reintentar
        </Button>
      </Alert>
    );
  }

  const proveedores = estado.lista;

  return (
    <div className="flex flex-col gap-4">
      {puedeEditar && proveedores.length > 0 && (
        <div>
          <Button icon={icono(Plus)} onClick={() => setDialogo({ proveedor: null })}>
            Nuevo proveedor
          </Button>
        </div>
      )}

      {proveedores.length === 0 ? (
        <Card className="text-center py-10!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="heading-sm m-0">Todavía no cargaste proveedores.</p>
          <p className="body-sm text-ink-2 mt-1 mb-0">
            {puedeEditar ? "Cargá a quién le comprás para registrar las compras de stock." : "Pedile a quien administra el bar que los cargue."}
          </p>
          {puedeEditar && (
            <Button className="mt-4" icon={icono(Plus)} onClick={() => setDialogo({ proveedor: null })}>
              Nuevo proveedor
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {proveedores.map((p) => {
            const mapeo = p.mapeoImportacion;
            return (
              <Card key={p.id}>
                <Card.Title className="break-words">{p.nombre}</Card.Title>
                {(p.contacto || p.telefono) && (
                  <Card.Meta className="break-words">
                    {p.contacto}
                    {p.contacto && p.telefono ? " · " : ""}
                    {p.telefono}
                  </Card.Meta>
                )}
                {mapeo && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="body-sm text-ink-2">
                      Mapeo guardado: hoja {mapeo.hoja ?? "—"}, fila {Number.isInteger(mapeo.filaEncabezado) ? mapeo.filaEncabezado + 1 : "—"}
                    </span>
                    {puedeMapeo && (
                      <Button size="sm" variant="ghost" onClick={() => olvidarMapeo(p)}>
                        Olvidar mapeo
                      </Button>
                    )}
                  </div>
                )}
                {puedeEditar && (
                  <Card.Foot>
                    <div className="pd-btn-group">
                      <Button size="sm" onClick={() => setDialogo({ proveedor: p })}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" icon={icono(Trash2)} onClick={() => eliminar(p)}>
                        Eliminar
                      </Button>
                    </div>
                  </Card.Foot>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {dialogo && (
        <ProveedorDialog proveedor={dialogo.proveedor} clubId={clubId} onCerrar={() => setDialogo(null)} onGuardado={onRecargar} />
      )}
    </div>
  );
}

// ----- Pestaña Movimientos -----

function MovimientosTab({ clubId, uid, productos, proveedores, filtro, onVerTodos }) {
  const [version, setVersion] = useState(0);
  const [estado, setEstado] = useState({ clave: null, lista: [], error: false });
  const filtroId = filtro?.id || null;
  const clave = `${clubId}|${filtroId || ""}|${version}`;

  useEffect(() => {
    let vivo = true;
    getMovimientos(clubId, { productoId: filtroId, max: 100 })
      .then((lista) => {
        if (vivo) setEstado({ clave, lista, error: false });
      })
      .catch((e) => {
        console.error("Error cargando movimientos:", e);
        if (vivo) setEstado({ clave, lista: [], error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, filtroId, clave]);

  const cargando = estado.clave !== clave;
  const nombreProducto = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p.nombre])), [productos]);
  const nombreProveedor = useMemo(() => Object.fromEntries(proveedores.map((p) => [p.id, p.nombre])), [proveedores]);
  const quien = (m) => (m.creadoPor && m.creadoPor === uid ? "Vos" : m.creadoPor ? String(m.creadoPor).slice(0, 6) : "—");
  const tipoDe = (m) => TIPO_MOVIMIENTO[m.tipo] || { label: m.tipo || "—", tone: "neutral" };
  const cantidadDe = (m) => (
    <span className={["pd-tnum whitespace-nowrap", Number(m.cantidad) < 0 && "text-danger"].filter(Boolean).join(" ")}>{conSigno(m.cantidad)}</span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {filtro && (
          <>
            <Badge>Producto: {filtro.nombre}</Badge>
            <Button size="sm" variant="ghost" icon={icono(X)} onClick={onVerTodos}>
              Ver todos
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" icon={icono(RefreshCw)} className="ml-auto" disabled={cargando} onClick={() => setVersion((v) => v + 1)}>
          Actualizar
        </Button>
      </div>

      {cargando ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando movimientos">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-12" />
          ))}
        </div>
      ) : estado.error ? (
        <Alert tone="danger">
          <p className="m-0">No pudimos cargar los movimientos.</p>
          <Button size="sm" className="mt-2" onClick={() => setVersion((v) => v + 1)}>
            Reintentar
          </Button>
        </Alert>
      ) : estado.lista.length === 0 ? (
        <Card className="text-center py-10!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="heading-sm m-0">{filtro ? "Este producto todavía no tiene movimientos." : "Todavía no hay movimientos de stock."}</p>
          <p className="body-sm text-ink-2 mt-1 mb-0">Se registran al cargar stock, ajustarlo o importar una lista.</p>
        </Card>
      ) : (
        <>
          <p className="body-sm text-ink-3 m-0">
            {estado.lista.length >= 100 ? "Los últimos 100 movimientos." : `${estado.lista.length} ${estado.lista.length === 1 ? "movimiento" : "movimientos"}.`}
          </p>

          {/* Teléfono: una tarjeta por movimiento */}
          <div className="flex flex-col gap-4 md:hidden">
            {estado.lista.map((m) => (
              <Card key={m.id}>
                <Card.Row className="items-start!">
                  <Card.Eyebrow className="pd-tnum">{fechaHora(m.creadoEn)}</Card.Eyebrow>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Badge tone={tipoDe(m).tone}>{tipoDe(m).label}</Badge>
                    {m.aplicado === false && <Badge tone="warning" dot>Pendiente</Badge>}
                  </div>
                </Card.Row>
                <Card.Title className="mt-2! break-words">{nombreProducto[m.productoId] || "—"}</Card.Title>
                <dl className="pd-dl mt-3">
                  <div>
                    <dt>Cantidad</dt>
                    <dd>{cantidadDe(m)}</dd>
                  </div>
                  <div>
                    <dt>Proveedor</dt>
                    <dd>{nombreProveedor[m.proveedorId] || "—"}</dd>
                  </div>
                  <div>
                    <dt>Quién</dt>
                    <dd>{quien(m)}</dd>
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

          {/* Desde md: tabla */}
          <div className="pd-table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Tipo</th>
                    <th className="num">Cantidad</th>
                    <th>Proveedor</th>
                    <th>Nota</th>
                    <th>Quién</th>
                    <th>
                      <span className="sr-only">Aplicado</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {estado.lista.map((m) => (
                    <tr key={m.id}>
                      <td className="pd-tnum whitespace-nowrap">{fechaHora(m.creadoEn)}</td>
                      <td className="font-semibold">{nombreProducto[m.productoId] || "—"}</td>
                      <td>
                        <Badge tone={tipoDe(m).tone}>{tipoDe(m).label}</Badge>
                      </td>
                      <td className="num">{cantidadDe(m)}</td>
                      <td>{nombreProveedor[m.proveedorId] || "—"}</td>
                      <td className="break-words max-w-[240px]">{m.nota || "—"}</td>
                      <td className="pd-tnum">{quien(m)}</td>
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
    </div>
  );
}

// ----- Página -----

const ESTADO_INICIAL = { para: null, lista: [], error: false };

export default function Productos() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const user = useAuthStore((s) => s.user);
  const clubId = clubActual?.id || null;
  const uid = user?.uid || null;

  // clubActual en la lista: los permisos se recalculan cuando cambia el club
  const puedeEditar = !!clubActual && puede("editarProductos");
  const puedeStock = !!clubActual && puede("cargarStock");
  const puedeImportar = !!clubActual && puede("importar");
  const puedeEntrar = puedeEditar || puedeStock || puedeImportar;

  const [tab, setTab] = useState("productos");
  const [prods, setProds] = useState(ESTADO_INICIAL);
  const [cats, setCats] = useState(ESTADO_INICIAL);
  const [provs, setProvs] = useState(ESTADO_INICIAL);

  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("todas");
  // ?filtro=bajo (desde el aviso diario de stock y la tarjeta de Hoy) abre la lista ya filtrada
  const [searchParams] = useSearchParams();
  const [soloBajo, setSoloBajo] = useState(() => searchParams.get("filtro") === "bajo");
  // Alertas de stock que mantiene la Function (clubs/{c}/alertasStock): cuenta del filtro y "bajo desde"
  const [alertas, setAlertas] = useState(null);
  const [dialogoProducto, setDialogoProducto] = useState(null); // { producto } (null = nuevo)
  const [dialogoStock, setDialogoStock] = useState(null); // producto
  const [filtroMov, setFiltroMov] = useState(null); // { id, nombre }
  const [importando, setImportando] = useState(false);

  // Productos con un movimiento recién registrado: id → stock que tenían; se borra a los 20 s
  const [recientes, setRecientes] = useState({});
  const timers = useRef({});

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    const unsub = escucharAlertasStock(clubId, setAlertas, (err) => console.error("Error escuchando las alertas de stock:", err));
    return () => unsub();
  }, [clubId, puedeEntrar]);

  // Productos en tiempo real
  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    const unsub = escucharProductos(
      clubId,
      (lista) => setProds({ para: clubId, lista, error: false }),
      (err) => {
        console.error("Error escuchando productos:", err);
        setProds({ para: clubId, lista: [], error: true });
      },
    );
    return () => unsub();
  }, [clubId, puedeEntrar]);

  const cargarCategorias = useCallback(async () => {
    if (!clubId) return;
    try {
      const lista = await getCategorias(clubId);
      setCats({ para: clubId, lista, error: false });
    } catch (e) {
      console.error("Error cargando categorías:", e);
      setCats({ para: clubId, lista: [], error: true });
    }
  }, [clubId]);

  const cargarProveedores = useCallback(async () => {
    if (!clubId) return;
    try {
      const lista = await getProveedores(clubId);
      setProvs({ para: clubId, lista, error: false });
    } catch (e) {
      console.error("Error cargando proveedores:", e);
      setProvs({ para: clubId, lista: [], error: true });
    }
  }, [clubId]);

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    let vivo = true;
    getCategorias(clubId)
      .then((lista) => vivo && setCats({ para: clubId, lista, error: false }))
      .catch((e) => {
        console.error("Error cargando categorías:", e);
        if (vivo) setCats({ para: clubId, lista: [], error: true });
      });
    getProveedores(clubId)
      .then((lista) => vivo && setProvs({ para: clubId, lista, error: false }))
      .catch((e) => {
        console.error("Error cargando proveedores:", e);
        if (vivo) setProvs({ para: clubId, lista: [], error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, puedeEntrar]);

  useEffect(() => {
    const pendientes = timers.current;
    return () => Object.values(pendientes).forEach(clearTimeout);
  }, []);

  const marcarMovido = useCallback((id, stockAntes) => {
    setRecientes((r) => ({ ...r, [id]: stockAntes }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      setRecientes((r) => {
        const { [id]: _quitado, ...resto } = r;
        return resto;
      });
      delete timers.current[id];
    }, 20000);
  }, []);

  const productos = useMemo(() => (prods.para === clubId ? prods.lista : []), [prods, clubId]);
  const categorias = useMemo(() => (cats.para === clubId ? cats.lista : []), [cats, clubId]);
  const proveedores = useMemo(() => (provs.para === clubId ? provs.lista : []), [provs, clubId]);
  const nombreCategoria = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c.nombre])), [categorias]);

  // Pastillas de categoría con conteos (sobre todos los productos)
  const itemsCategorias = useMemo(() => {
    const conteo = {};
    let sin = 0;
    productos.forEach((p) => {
      if (p.categoriaId && nombreCategoria[p.categoriaId] !== undefined) conteo[p.categoriaId] = (conteo[p.categoriaId] || 0) + 1;
      else sin += 1;
    });
    const items = [{ value: "todas", label: "Todas", count: productos.length }];
    categorias.forEach((c) => items.push({ value: c.id, label: c.nombre, count: conteo[c.id] || 0 }));
    if (sin > 0 && categorias.length > 0) items.push({ value: "sin", label: "Sin categoría", count: sin });
    return items;
  }, [productos, categorias, nombreCategoria]);
  const catActiva = itemsCategorias.some((i) => i.value === filtroCat) ? filtroCat : "todas";
  const alertasPorId = useMemo(() => Object.fromEntries((alertas || []).map((a) => [a.id, a])), [alertas]);
  const cantidadBajo = useMemo(() => (alertas ? alertas.length : productos.filter((p) => stockBajo(p)).length), [alertas, productos]);

  const filtrados = useMemo(() => {
    const q = normalizarNombre(busqueda);
    return productos
      .filter((p) => {
        if (catActiva === "sin" && p.categoriaId && nombreCategoria[p.categoriaId] !== undefined) return false;
        if (catActiva !== "todas" && catActiva !== "sin" && p.categoriaId !== catActiva) return false;
        if (soloBajo && !stockBajo(p)) return false;
        if (!q) return true;
        return (
          normalizarNombre(p.nombre).includes(q) ||
          normalizarNombre(p.sku).includes(q) ||
          normalizarNombre(p.codigoBarras).includes(q)
        );
      })
      .sort(ordenarProductos);
  }, [productos, busqueda, catActiva, soloBajo, nombreCategoria]);

  const abrirEditar = (p) => setDialogoProducto({ producto: p });
  const puedeAjustar = (p) => puedeStock && p.controlaStock !== false;

  // Lector de códigos: escribe y manda Enter. Un único producto con ese código de barras o SKU → se abre.
  const onBuscarKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const t = busqueda.trim();
    if (!t) return;
    const tl = t.toLowerCase();
    const coinciden = productos.filter(
      (p) => (p.codigoBarras && String(p.codigoBarras).trim() === t) || (p.sku && String(p.sku).trim().toLowerCase() === tl),
    );
    if (coinciden.length !== 1) return;
    e.preventDefault();
    const p = coinciden[0];
    if (puedeEditar) abrirEditar(p);
    else if (puedeAjustar(p)) setDialogoStock(p);
    else return;
    setBusqueda("");
  };

  const cambiarCampo = async (p, campos, ok) => {
    try {
      await actualizarCamposProducto(clubId, p.id, campos);
      if (ok) toast.success(ok);
    } catch (e) {
      console.error("Error actualizando el producto:", e);
      toast.error("No pudimos actualizar el producto. Intentá de nuevo.");
    }
  };

  const verMovimientos = (p) => {
    setFiltroMov({ id: p.id, nombre: p.nombre });
    setTab("movimientos");
  };

  // ----- Estados de la página -----

  if (!clubCargado) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-56" />
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
        <p className="body-sm text-ink-2 mt-1 m-0">Registrate como club o pedí que te sumen al equipo de uno para gestionar el bar.</p>
      </Card>
    );
  }

  if (!puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Productos</h1>
        <SinPermiso />
      </div>
    );
  }

  const cargandoProductos = prods.para !== clubId;
  const estadoCats = { lista: categorias, error: cats.para === clubId && cats.error, cargando: cats.para !== clubId };
  const estadoProvs = { lista: proveedores, error: provs.para === clubId && provs.error, cargando: provs.para !== clubId };

  const bajarPlantilla = async () => {
    try {
      await descargarPlantilla();
    } catch (e) {
      console.error("Error generando la plantilla:", e);
      toast.error("No se pudo descargar la plantilla");
    }
  };

  // ----- Partes de la lista de productos (funciones, no componentes) -----

  const favorito = (p) => {
    const fav = !!p.favorito;
    if (!puedeEditar) {
      return fav ? <Star className="pd-icon text-ink-2 shrink-0" size={20} fill="currentColor" aria-label="Favorito" role="img" /> : null;
    }
    return (
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-pressed={fav}
        aria-label={`Favorito: ${p.nombre}`}
        icon={icono(Star, { fill: fav ? "currentColor" : "none" })}
        onClick={() => cambiarCampo(p, { favorito: !fav })}
        className="shrink-0"
      />
    );
  };

  const stock = (p) => {
    if (p.controlaStock === false) return <span className="text-ink-3">No controla</span>;
    const tono = tonoStock(p);
    const reciente = recientes[p.id] !== undefined && (Number(p.stock) || 0) === recientes[p.id];
    return (
      <span className="inline-flex flex-col items-end gap-1">
        {tono ? <Badge tone={tono}>{textoStock(p)}</Badge> : <span className="pd-tnum whitespace-nowrap">{textoStock(p)}</span>}
        {reciente && <span className="pd-help whitespace-nowrap">Se actualiza en unos segundos</span>}
        {alertasPorId[p.id]?.desde && aDate(alertasPorId[p.id].desde) && <span className="pd-help whitespace-nowrap">Bajo desde {formatDiaCorto(`${aDate(alertasPorId[p.id].desde).getFullYear()}-${String(aDate(alertasPorId[p.id].desde).getMonth() + 1).padStart(2, "0")}-${String(aDate(alertasPorId[p.id].desde).getDate()).padStart(2, "0")}`)}</span>}
      </span>
    );
  };

  const activo = (p) => (p.activo !== false ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>);

  const acciones = (p, className = "") => (
    <div className={["pd-btn-group", className].filter(Boolean).join(" ")}>
      {puedeEditar && (
        <Button size="sm" onClick={() => abrirEditar(p)}>
          Editar
        </Button>
      )}
      {puedeAjustar(p) && (
        <Button size="sm" onClick={() => setDialogoStock(p)}>
          Ajustar stock
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => verMovimientos(p)}>
        Ver movimientos
      </Button>
      {puedeEditar && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => cambiarCampo(p, { activo: p.activo === false }, p.activo === false ? "Producto activado" : "Producto desactivado")}
        >
          {p.activo === false ? "Activar" : "Desactivar"}
        </Button>
      )}
    </div>
  );

  const vacioFiltrado = busqueda.trim()
    ? `No encontramos productos para "${busqueda.trim()}".`
    : soloBajo
      ? "No hay productos con stock bajo."
      : "No hay productos en esta categoría.";

  const tabProductos = (
    <div className="flex flex-col gap-4">
      {cargandoProductos ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando productos">
          <div className="pd-skeleton h-10 w-full max-w-sm" />
          <div className="pd-skeleton h-9 w-72 rounded-pill" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-14" />
          ))}
        </div>
      ) : prods.error ? (
        <Alert tone="danger">
          <p className="m-0">No pudimos cargar los productos. Recargá la página para intentar de nuevo.</p>
        </Alert>
      ) : productos.length === 0 ? (
        <Card className="text-center py-12!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="heading-sm m-0">Todavía no cargaste productos.</p>
          <p className="body-sm text-ink-2 mt-1 mb-0">
            {puedeEditar || puedeImportar
              ? "Creá el primero con \"Nuevo producto\" o importá la lista de un proveedor."
              : "Pedile a quien administra el bar que los cargue."}
          </p>
        </Card>
      ) : (
        <>
          <SearchInput
            wrapperClassName="w-full md:max-w-sm"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={onBuscarKeyDown}
            placeholder="Buscar por nombre, SKU o código de barras"
            aria-label="Buscar productos por nombre, SKU o código de barras"
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
            {categorias.length > 0 && <Pills items={itemsCategorias} value={catActiva} onChange={setFiltroCat} ariaLabel="Categoría" />}
            <div className="pd-pills">
              <button type="button" className="pd-pill" aria-pressed={soloBajo} onClick={() => setSoloBajo((v) => !v)}>
                Stock bajo
                {cantidadBajo > 0 && (
                  <Badge tone="warning" className="ml-1">
                    {cantidadBajo}
                  </Badge>
                )}
              </button>
            </div>
          </div>

          {filtrados.length === 0 ? (
            <p className="body-md text-ink-2 m-0">{vacioFiltrado}</p>
          ) : (
            <>
              {/* Teléfono: una tarjeta por producto */}
              <div className="flex flex-col gap-4 md:hidden">
                {filtrados.map((p) => (
                  <Card key={p.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-1 min-w-0">
                        {favorito(p)}
                        <Card.Title className="m-0! break-words">{p.nombre || "Sin nombre"}</Card.Title>
                      </div>
                      {activo(p)}
                    </div>
                    <dl className="pd-dl mt-4">
                      <div>
                        <dt>Categoría</dt>
                        <dd>{nombreCategoria[p.categoriaId] || "Sin categoría"}</dd>
                      </div>
                      <div>
                        <dt>Precio</dt>
                        <dd className="pd-tnum">{formatPrecio(p.precio)}</dd>
                      </div>
                      <div>
                        <dt>Costo</dt>
                        <dd className="pd-tnum">{fmtCosto(p.costo)}</dd>
                      </div>
                      <div>
                        <dt>Margen</dt>
                        <dd className="pd-tnum">{fmtMargen(p)}</dd>
                      </div>
                      <div>
                        <dt>Stock</dt>
                        <dd className="[&>span]:items-start!">{stock(p)}</dd>
                      </div>
                    </dl>
                    {acciones(p, "mt-4")}
                  </Card>
                ))}
              </div>

              {/* Desde md: tabla */}
              <div className="pd-table-wrap hidden md:block">
                <div className="overflow-x-auto">
                  <table className="pd-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Categoría</th>
                        <th className="num">Precio</th>
                        <th className="num">Costo</th>
                        <th className="num">Margen</th>
                        <th className="num">Stock</th>
                        <th>Activo</th>
                        <th className="num">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="flex items-center gap-1 min-w-[180px]">
                              {favorito(p)}
                              <span className="font-semibold break-words">{p.nombre || "Sin nombre"}</span>
                            </div>
                          </td>
                          <td>{nombreCategoria[p.categoriaId] || <span className="text-ink-3">Sin categoría</span>}</td>
                          <td className="num whitespace-nowrap">{formatPrecio(p.precio)}</td>
                          <td className="num whitespace-nowrap">{fmtCosto(p.costo)}</td>
                          <td className="num">{fmtMargen(p)}</td>
                          <td className="num">{stock(p)}</td>
                          <td>{activo(p)}</td>
                          <td className="num">{acciones(p, "justify-end flex-nowrap!")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="heading-lg m-0">Productos</h1>
        <div className="pd-btn-group">
          {puedeImportar && (
            <>
              <Button variant="ghost" icon={icono(Download)} onClick={bajarPlantilla}>
                Descargar plantilla
              </Button>
              <Button icon={icono(Upload)} onClick={() => setImportando(true)}>
                Importar
              </Button>
            </>
          )}
          {tab === "productos" && puedeEditar && (
            <Button variant="primary" icon={icono(Plus)} onClick={() => setDialogoProducto({ producto: null })}>
              Nuevo producto
            </Button>
          )}
        </div>
      </div>

      <Tabs
        items={[
          { value: "productos", label: "Productos" },
          { value: "categorias", label: "Categorías" },
          { value: "proveedores", label: "Proveedores" },
          { value: "movimientos", label: "Movimientos" },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="Secciones de productos"
        className="mb-6"
      />

      {tab === "productos" && tabProductos}
      {tab === "categorias" && (
        <CategoriasTab clubId={clubId} estado={estadoCats} productos={productos} puedeEditar={puedeEditar} onRecargar={cargarCategorias} />
      )}
      {tab === "proveedores" && (
        <ProveedoresTab
          clubId={clubId}
          estado={estadoProvs}
          puedeEditar={puedeEditar}
          puedeMapeo={puedeEditar || puedeImportar}
          onRecargar={cargarProveedores}
        />
      )}
      {tab === "movimientos" && (
        <MovimientosTab
          clubId={clubId}
          uid={uid}
          productos={productos}
          proveedores={proveedores}
          filtro={filtroMov}
          onVerTodos={() => setFiltroMov(null)}
        />
      )}

      {dialogoProducto && (
        <ProductoDialog
          producto={dialogoProducto.producto}
          categorias={categorias}
          clubId={clubId}
          uid={uid}
          puedeStock={puedeStock}
          onCerrar={() => setDialogoProducto(null)}
          onCreado={(id) => marcarMovido(id, 0)}
        />
      )}
      {dialogoStock && (
        <StockDialog
          producto={dialogoStock}
          proveedores={proveedores}
          clubId={clubId}
          uid={uid}
          onCerrar={() => setDialogoStock(null)}
          onMovido={marcarMovido}
        />
      )}
      {importando && (
        <Suspense fallback={null}>
          <ImportarProductos
            abierto
            clubId={clubId}
            productos={productos}
            categorias={categorias}
            proveedores={proveedores}
            onCerrar={() => setImportando(false)}
            onTerminado={cargarProveedores}
          />
        </Suspense>
      )}
    </div>
  );
}
