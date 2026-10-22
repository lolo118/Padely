import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Download, FileSpreadsheet, X } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import { toast } from "../../../components/Toast";
import { Alert, Badge, Button, Field, Input, Select, StatTile, Tabs } from "../../../components/ui";
import {
  crearProveedor,
  datosDeProducto,
  escribirEnLotes,
  guardarMapeoProveedor,
  refNuevoMovimiento,
  refNuevoProducto,
  refProducto,
  serverTimestamp,
} from "../../../services/productosService";
import {
  CAMPOS_IMPORTACION,
  analizarImportacion,
  armarPlan,
  autoMapear,
  campoDeEncabezado,
  columnasComoTexto,
  detectarDelimitador,
  detectarFilaEncabezado,
  encabezadosDe,
  letraColumna,
  parsearFilas,
} from "../../../utils/importacion";
import { normalizarNombre } from "../../../utils/productos";
import { parsearNumero } from "../../../utils/numeros";
import { formatPrecio } from "../../../utils/format";
import { descargarPlantilla } from "../../../utils/plantillaProductos";

// Asistente de importación de productos del bar desde una planilla (XLSX, XLS o CSV), en seis pasos.
// SheetJS se carga con import() dinámico (chunk propio) recién al leer el archivo.

const PASOS = ["Archivo", "Hoja y encabezado", "Columnas", "Qué hacer", "Revisar", "Confirmar"];
const NUEVO_PROVEEDOR = "__nuevo";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILAS_VISTA = 300;
const FILAS_PREVIEW = 15;
const COLUMNAS_PREVIEW = 8;
const HOJA_VACIA = { nombre: "", filas: [], filaBase: 0, colBase: 0 };

const numeroAR = (n) => Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
const recortar = (v, max = 28) => {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};

export default function ImportarProductos(props) {
  // El asistente se monta al abrir, así cada apertura empieza de cero
  if (!props.abierto) return null;
  return <Asistente {...props} />;
}

async function leerLibro(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    let texto = new TextDecoder("utf-8").decode(buf);
    // Un CSV exportado de Excel en Windows suele venir en latin-1: si el UTF-8 no cierra, se decodifica así
    if (texto.includes(String.fromCharCode(0xfffd))) texto = new TextDecoder("windows-1252").decode(buf);
    if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
    wb = XLSX.read(texto, { type: "string", FS: detectarDelimitador(texto), raw: true });
  } else {
    wb = XLSX.read(buf, { type: "array" });
  }
  return wb.SheetNames.map((nombre) => {
    const ws = wb.Sheets[nombre];
    const rango = ws?.["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    return {
      nombre,
      filas: ws ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: true }) : [],
      filaBase: rango ? rango.s.r : 0,
      colBase: rango ? rango.s.c : 0,
    };
  });
}

function Asistente({ onCerrar, clubId, productos = [], categorias = [], proveedores = [], onTerminado }) {
  const user = useAuthStore((s) => s.user);
  const puede = useAuthStore((s) => s.puede);
  useAuthStore((s) => s.clubActual); // re-render si cambian los permisos
  const puedeEditar = puede("editarProductos");
  const puedeStock = puede("cargarStock") || puede("importar");

  const [paso, setPaso] = useState(1);
  // Paso 1
  const [proveedorSel, setProveedorSel] = useState("");
  const [nombreProveedor, setNombreProveedor] = useState("");
  const [archivo, setArchivo] = useState(null); // { nombre }
  const [hojas, setHojas] = useState([]);
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [intentoPaso1, setIntentoPaso1] = useState(false);
  // Paso 2 y 3
  const [hojaIdx, setHojaIdx] = useState(0);
  const [filaEncabezado, setFilaEncabezado] = useState(0);
  const [mapeo, setMapeo] = useState(() => autoMapear([]));
  // Paso 4
  const [opciones, setOpciones] = useState({ crear: true, actualizarPrecios: true, sumarStock: true, usarMargen: true });
  const [multiplicadorTexto, setMultiplicadorTexto] = useState("1,6");
  // Paso 5
  const [marcas, setMarcas] = useState({}); // clave → bool (lo que el usuario cambió)
  const [seccion, setSeccion] = useState("nuevos");
  // Paso 6
  const [escribiendo, setEscribiendo] = useState(false);
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 });
  const [resultado, setResultado] = useState(null); // { creados, actualizados, movimientos, mapeoGuardado }
  const [errorEscritura, setErrorEscritura] = useState("");

  const dialogoRef = useRef(null);

  const proveedor = proveedores.find((p) => p.id === proveedorSel) || null;
  const hoja = hojas[hojaIdx] || HOJA_VACIA;
  const encabezados = useMemo(() => encabezadosDe(hoja.filas, filaEncabezado), [hoja, filaEncabezado]);
  const filas = useMemo(
    () => (paso >= 3 ? parsearFilas(hoja.filas, filaEncabezado, mapeo, { filaBase: hoja.filaBase }) : []),
    [paso, hoja, filaEncabezado, mapeo],
  );
  const multiplicador = parsearNumero(multiplicadorTexto);
  const multiplicadorValido = multiplicador !== null && multiplicador >= 1 && multiplicador <= 10;

  // Qué se puede hacer con este archivo y estos permisos
  const tieneColumna = (campo) => mapeo[campo] !== null && mapeo[campo] !== undefined;
  const posible = {
    crear: puedeEditar,
    actualizarPrecios: puedeEditar && (tieneColumna("precio") || tieneColumna("costo")),
    sumarStock: puedeStock && tieneColumna("stock"),
    usarMargen: tieneColumna("costo"),
  };
  const efectivas = {
    crear: opciones.crear && posible.crear,
    actualizarPrecios: opciones.actualizarPrecios && posible.actualizarPrecios,
    sumarStock: opciones.sumarStock && posible.sumarStock,
    usarMargen: opciones.usarMargen && posible.usarMargen,
  };

  const analisis = useMemo(
    () =>
      paso >= 5
        ? analizarImportacion(filas, productos, categorias, {
            usarMargen: efectivas.usarMargen && multiplicadorValido,
            multiplicador: multiplicador ?? 1.6,
          })
        : null,
    [paso, filas, productos, categorias, efectivas.usarMargen, multiplicadorValido, multiplicador],
  );

  // Por defecto todo marcado, salvo el stock de productos que no controlan stock
  const marcadaPorDefecto = (item) => !(item.producto && item.producto.controlaStock === false && item.clave.startsWith("s:"));
  const estaMarcada = (item) => (item.clave in marcas ? marcas[item.clave] : marcadaPorDefecto(item));
  const seleccion = useMemo(() => {
    if (!analisis) return new Set();
    const todas = [...analisis.nuevos, ...analisis.cambios, ...analisis.stock];
    return new Set(todas.filter((it) => (it.clave in marcas ? marcas[it.clave] : marcadaPorDefecto(it))).map((it) => it.clave));
  }, [analisis, marcas]);
  const plan = useMemo(() => (analisis ? armarPlan(analisis, seleccion, efectivas) : null), [analisis, seleccion, efectivas.crear, efectivas.actualizarPrecios, efectivas.sumarStock]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPlan = plan ? plan.crear.length + plan.actualizar.length + plan.movimientos.length : 0;

  // Escape cierra (salvo mientras se escribe); el foco arranca en el diálogo
  const cerrar = () => {
    if (escribiendo) return;
    if (resultado) onTerminado?.();
    onCerrar?.();
  };
  const cerrarRef = useRef(cerrar);
  useEffect(() => {
    cerrarRef.current = cerrar;
  });
  useEffect(() => {
    dialogoRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") cerrarRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    dialogoRef.current?.scrollTo?.({ top: 0 });
  }, [paso]);

  // ----- Paso 1: archivo -----
  const elegirArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErrorArchivo("");
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setErrorArchivo("Elegí un archivo .xlsx, .xls o .csv.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrorArchivo("El archivo pesa más de 10 MB. Partilo en varios.");
      return;
    }
    setLeyendo(true);
    try {
      const libro = await leerLibro(file);
      if (!libro.length || libro.every((h) => !h.filas.length)) {
        setErrorArchivo("El archivo no tiene datos.");
        setArchivo(null);
        setHojas([]);
      } else {
        setArchivo({ nombre: file.name });
        setHojas(libro);
      }
    } catch (err) {
      console.error("Error leyendo el archivo:", err);
      setErrorArchivo("No pudimos leer el archivo. Probá guardarlo de nuevo como .xlsx.");
      setArchivo(null);
      setHojas([]);
    } finally {
      setLeyendo(false);
    }
  };

  const bajarPlantilla = async () => {
    try {
      await descargarPlantilla();
    } catch (err) {
      console.error("Error generando la plantilla:", err);
      toast.error("No se pudo descargar la plantilla");
    }
  };

  // Hoja + fila de encabezado → mapeo (el guardado del proveedor primero, después la detección)
  const aplicarEncabezado = (idx, fila) => {
    const h = hojas[idx];
    setHojaIdx(idx);
    setFilaEncabezado(fila);
    setMapeo(autoMapear(encabezadosDe(h?.filas || [], fila), proveedor?.mapeoImportacion?.columnas || null));
  };
  const elegirHoja = (idx) => aplicarEncabezado(idx, detectarFilaEncabezado(hojas[idx]?.filas || []));

  const nombreProveedorFalta = proveedorSel === NUEVO_PROVEEDOR && !nombreProveedor.trim();
  const irAPaso2 = () => {
    setIntentoPaso1(true);
    if (!archivo || !hojas.length || nombreProveedorFalta) return;
    const guardado = proveedor?.mapeoImportacion;
    let idx = hojas.findIndex((h) => guardado?.hoja && h.nombre === guardado.hoja);
    if (idx < 0) idx = hojas.findIndex((h) => h.filas.length);
    if (idx < 0) idx = 0;
    const filasHoja = hojas[idx].filas;
    const fila =
      guardado && Number.isInteger(guardado.filaEncabezado) && guardado.filaEncabezado < filasHoja.length && guardado.hoja === hojas[idx].nombre
        ? guardado.filaEncabezado
        : detectarFilaEncabezado(filasHoja);
    aplicarEncabezado(idx, fila);
    setPaso(2);
  };

  // ----- Paso 3 → 4: opciones por defecto según lo que el archivo y los permisos permiten -----
  const irAPaso4 = () => {
    if (!tieneColumna("nombre")) return;
    setOpciones({
      crear: puedeEditar,
      actualizarPrecios: puedeEditar,
      sumarStock: puedeStock,
      usarMargen: true,
    });
    setPaso(4);
  };
  const algunaAccion = efectivas.crear || efectivas.actualizarPrecios || efectivas.sumarStock;
  const irAPaso5 = () => {
    if (!algunaAccion || (efectivas.usarMargen && !multiplicadorValido)) return;
    setMarcas({});
    setSeccion(efectivas.crear ? "nuevos" : efectivas.actualizarPrecios ? "cambios" : "stock");
    setPaso(5);
  };

  // ----- Paso 5 → 6: escribir -----
  const importar = async () => {
    if (!plan || !totalPlan || escribiendo) return;
    setPaso(6);
    setEscribiendo(true);
    setErrorEscritura("");
    setProgreso({ hechos: 0, total: totalPlan });
    let proveedorId = proveedor?.id || null;
    try {
      if (proveedorSel === NUEVO_PROVEEDOR) {
        const nombre = nombreProveedor.trim();
        const existente = proveedores.find((p) => normalizarNombre(p.nombre) === normalizarNombre(nombre));
        proveedorId = existente ? existente.id : await crearProveedor(clubId, { nombre });
      }
      const nota = `Importación ${archivo?.nombre || ""}`.trim();
      const ops = [];
      const idsNuevos = new Map();
      for (const n of plan.crear) {
        const r = refNuevoProducto(clubId);
        idsNuevos.set(n.clave, r.id);
        const datos = {
          ...datosDeProducto({
            nombre: n.nombre,
            precio: n.precio,
            costo: n.costo,
            sku: n.sku,
            codigoBarras: n.codigoBarras,
            categoriaId: n.categoriaId,
            stockMinimo: n.stockMinimo,
            unidad: n.unidad,
          }),
          stock: 0,
          creadoEn: serverTimestamp(),
          actualizadoEn: serverTimestamp(),
        };
        ops.push((batch) => batch.set(r, datos));
      }
      for (const c of plan.actualizar) {
        const campos = { precio: c.despues, actualizadoEn: serverTimestamp() };
        if (c.costo !== null && c.costo !== undefined) campos.costo = c.costo;
        ops.push((batch) => batch.update(refProducto(clubId, c.producto.id), campos));
      }
      for (const m of plan.movimientos) {
        const productoId = m.nuevo ? idsNuevos.get(m.nuevo.clave) : m.productoId;
        if (!productoId) continue;
        const mov = {
          productoId,
          tipo: "importacion",
          cantidad: Number(m.cantidad),
          costoUnitario: m.costo ?? null,
          proveedorId: proveedorId || null,
          nota,
          creadoPor: user?.uid,
          creadoEn: serverTimestamp(),
          aplicado: false,
        };
        ops.push((batch) => batch.set(refNuevoMovimiento(clubId), mov));
      }
      setProgreso({ hechos: 0, total: ops.length });
      await escribirEnLotes(ops, (hechos, total) => setProgreso({ hechos, total }));

      let mapeoGuardado = false;
      if (proveedorId) {
        try {
          await guardarMapeoProveedor(clubId, proveedorId, {
            hoja: hoja.nombre,
            filaEncabezado,
            columnas: columnasComoTexto(mapeo, encabezados),
          });
          mapeoGuardado = true;
        } catch (err) {
          console.error("Error guardando el mapeo del proveedor:", err);
        }
      }
      setResultado({
        creados: plan.crear.length,
        actualizados: plan.actualizar.length,
        movimientos: plan.movimientos.length,
        mapeoGuardado,
        proveedorNombre: proveedor?.nombre || nombreProveedor.trim(),
      });
      toast.success("Importación terminada");
    } catch (err) {
      console.error("Error importando productos:", err);
      setErrorEscritura("No se pudo terminar la importación.");
      toast.error("No se pudo terminar la importación");
    } finally {
      setEscribiendo(false);
    }
  };

  // ----- Marcas de la revisión -----
  const marcar = (clave, valor) => setMarcas((m) => ({ ...m, [clave]: valor }));
  const marcarTodas = (items, valor) =>
    setMarcas((m) => {
      const nuevo = { ...m };
      items.forEach((it) => {
        nuevo[it.clave] = valor;
      });
      return nuevo;
    });

  // ----- Render -----
  const pasoActual = PASOS[paso - 1];

  return (
    <div className="pd-backdrop z-50">
      <div
        ref={dialogoRef}
        tabIndex={-1}
        className="pd-dialog max-w-[960px]! w-full max-h-[calc(100dvh-32px)] overflow-y-auto focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="importar-titulo"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="pd-dialog-title" id="importar-titulo">
              Importar productos
            </h2>
            <p className="body-sm text-ink-2 m-0">
              Paso {paso} de {PASOS.length}: {pasoActual}
            </p>
          </div>
          <Button variant="ghost" iconOnly aria-label="Cerrar" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={cerrar} disabled={escribiendo} />
        </div>

        <ol className="pd-steps mt-4" aria-label="Pasos de la importación">
          {PASOS.map((nombre, i) => (
            <li key={nombre} aria-current={paso === i + 1 ? "step" : undefined} className={paso > i + 1 ? "is-done" : undefined}>
              <Badge>
                {i + 1} {nombre}
              </Badge>
            </li>
          ))}
        </ol>

        <div className="mt-6 grid gap-4">
          {paso === 1 && renderPaso1()}
          {paso === 2 && renderPaso2()}
          {paso === 3 && renderPaso3()}
          {paso === 4 && renderPaso4()}
          {paso === 5 && renderPaso5()}
          {paso === 6 && renderPaso6()}
        </div>

        <div className="pd-dialog-actions">{renderAcciones()}</div>
      </div>
    </div>
  );

  // ---------- Pasos (funciones que devuelven JSX, no componentes) ----------

  function renderPaso1() {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proveedor" help={proveedor?.mapeoImportacion ? "Usamos las columnas de la última importación de este proveedor." : "Si elegís uno, recordamos las columnas para la próxima."}>
            <Select value={proveedorSel} onChange={(e) => setProveedorSel(e.target.value)}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
              {puedeEditar && <option value={NUEVO_PROVEEDOR}>Nuevo proveedor…</option>}
            </Select>
          </Field>
          {proveedorSel === NUEVO_PROVEEDOR && (
            <Field label="Nombre del proveedor" help="Se crea al importar." error={intentoPaso1 && nombreProveedorFalta ? "Escribí el nombre del proveedor." : ""}>
              <Input value={nombreProveedor} onChange={(e) => setNombreProveedor(e.target.value)} placeholder="Distribuidora…" autoComplete="off" />
            </Field>
          )}
        </div>

        <Field as="div" label="Archivo" error={errorArchivo || (intentoPaso1 && !archivo && !leyendo ? "Elegí el archivo a importar." : "")}>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className="pd-btn cursor-pointer! has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
              aria-disabled={leyendo || undefined}
            >
              <FileSpreadsheet className="pd-icon" size={20} aria-hidden="true" />
              {leyendo ? "Leyendo…" : archivo ? "Cambiar archivo" : "Elegir archivo"}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={elegirArchivo} disabled={leyendo} className="sr-only" />
            </label>
            {archivo && (
              <span className="body-sm text-ink">
                {archivo.nombre}
                <span className="text-ink-2">
                  {" "}
                  · {hojas.length === 1 ? "1 hoja" : `${hojas.length} hojas`}
                </span>
              </span>
            )}
          </div>
          {!errorArchivo && <span className="pd-help">Excel (.xlsx, .xls) o CSV separado por coma o punto y coma.</span>}
        </Field>

        <Alert>
          ¿Armás la lista vos? Usá la <strong>plantilla de Padely</strong>: las columnas se reconocen solas.
          <div className="mt-2">
            <Button size="sm" variant="ghost" icon={<Download className="pd-icon" size={20} aria-hidden="true" />} onClick={bajarPlantilla}>
              Descargar plantilla
            </Button>
          </div>
        </Alert>
      </>
    );
  }

  function renderPaso2() {
    const vista = hoja.filas.slice(0, FILAS_PREVIEW);
    const ancho = Math.min(COLUMNAS_PREVIEW, Math.max(0, ...vista.map((f) => f.length)));
    const filasDatos = hoja.filas.length - filaEncabezado - 1;
    return (
      <>
        {hojas.length > 1 && (
          <Field label="Hoja">
            <Select value={String(hojaIdx)} onChange={(e) => elegirHoja(Number(e.target.value))}>
              {hojas.map((h, i) => (
                <option key={h.nombre} value={i}>
                  {h.nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <p className="body-md text-ink-2 m-0">
          Marcá la fila que tiene los títulos de las columnas. Detectamos la fila {filaEncabezado + hoja.filaBase + 1}; si no es, elegí otra.
        </p>
        <div className="pd-table-wrap">
          <div className="overflow-x-auto">
            <table className="pd-table">
              <thead>
                <tr>
                  <th scope="col">Encabezado</th>
                  <th scope="col" className="num">
                    Fila
                  </th>
                  {Array.from({ length: ancho }, (_, c) => (
                    <th key={c} scope="col">
                      {letraColumna(c + hoja.colBase)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vista.map((fila, i) => {
                  const elegida = i === filaEncabezado;
                  return (
                    <tr key={i} className={elegida ? "bg-surface-hover" : undefined}>
                      <td>
                        <label className="pd-check">
                          <input
                            type="radio"
                            name="fila-encabezado"
                            checked={elegida}
                            onChange={() => aplicarEncabezado(hojaIdx, i)}
                            aria-label={`Usar la fila ${i + hoja.filaBase + 1} como encabezado`}
                          />
                          {elegida && <Badge tone="court">Encabezado</Badge>}
                        </label>
                      </td>
                      <td className="num text-ink-3">{i + hoja.filaBase + 1}</td>
                      {Array.from({ length: ancho }, (_, c) => (
                        <td key={c} className={elegida ? "font-semibold whitespace-nowrap" : "whitespace-nowrap"}>
                          {recortar(fila[c])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="body-sm text-ink-2 m-0">
          {filasDatos > 0 ? `${numeroAR(filasDatos)} filas debajo del encabezado.` : "No hay filas debajo de ese encabezado."}
        </p>
      </>
    );
  }

  function renderPaso3() {
    const ejemplo = hoja.filas.slice(filaEncabezado + 1).find((f) => (f || []).some((c) => String(c ?? "").trim())) || [];
    const hayCampo = (campo) => encabezados.some((e) => campoDeEncabezado(e.texto) === campo) || tieneColumna(campo);
    const campos = CAMPOS_IMPORTACION.filter((c) => !c.opcional || hayCampo(c.campo));
    return (
      <>
        <p className="body-md text-ink-2 m-0">Indicá qué columna del archivo corresponde a cada dato. Solo el nombre es obligatorio.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {campos.map(({ campo, label, requerido }) => {
            const valor = mapeo[campo];
            const muestra = valor === null || valor === undefined ? "" : recortar(ejemplo[valor], 40);
            return (
              <Field
                key={campo}
                label={requerido ? `${label} (obligatorio)` : label}
                error={requerido && valor === null ? "Elegí la columna del nombre." : ""}
                help={muestra ? `Ej.: ${muestra}` : valor === null ? "No se importa." : ""}
              >
                <Select
                  value={valor === null || valor === undefined ? "" : String(valor)}
                  onChange={(e) => setMapeo((m) => ({ ...m, [campo]: e.target.value === "" ? null : Number(e.target.value) }))}
                >
                  <option value="">No está en el archivo</option>
                  {encabezados.map((enc) => (
                    <option key={enc.indice} value={enc.indice}>
                      {enc.texto || "Sin título"} · columna {letraColumna(enc.indice + hoja.colBase)}
                    </option>
                  ))}
                </Select>
              </Field>
            );
          })}
        </div>
      </>
    );
  }

  function renderPaso4() {
    const sinPermisos = !puedeEditar && !puedeStock;
    const casilla = (clave, label, ayuda) => (
      <div className="grid gap-1">
        <label className={["pd-check", !posible[clave] && "opacity-50 cursor-not-allowed!"].filter(Boolean).join(" ")}>
          <input
            type="checkbox"
            checked={efectivas[clave]}
            disabled={!posible[clave]}
            onChange={(e) => setOpciones((o) => ({ ...o, [clave]: e.target.checked }))}
          />
          {label}
        </label>
        {ayuda && <span className="pd-help pl-7">{ayuda}</span>}
      </div>
    );
    return (
      <>
        {sinPermisos && <Alert tone="warning">Tu rol no puede crear productos, cambiar precios ni cargar stock. Pedile al dueño del club el permiso.</Alert>}
        <div className="grid gap-4">
          {casilla("crear", "Crear productos nuevos", !puedeEditar ? "Necesitás el permiso Editar productos." : "Los que no coinciden por SKU, código de barras ni nombre.")}
          {casilla(
            "actualizarPrecios",
            "Actualizar precios",
            !puedeEditar ? "Necesitás el permiso Editar productos." : !posible.actualizarPrecios ? "El archivo no tiene columna de precio ni de costo." : "De los productos que ya existen; el stock no se toca.",
          )}
          {casilla(
            "sumarStock",
            "Sumar stock",
            !puedeStock ? "Necesitás el permiso Cargar stock o Importar." : !tieneColumna("stock") ? "El archivo no tiene columna de stock." : "La cantidad del archivo se suma al stock actual como un movimiento de importación.",
          )}
          <div className="grid gap-2">
            <label className={["pd-check", !posible.usarMargen && "opacity-50 cursor-not-allowed!"].filter(Boolean).join(" ")}>
              <input
                type="checkbox"
                checked={efectivas.usarMargen}
                disabled={!posible.usarMargen}
                onChange={(e) => setOpciones((o) => ({ ...o, usarMargen: e.target.checked }))}
              />
              Si el archivo trae solo costo: precio = costo ×
            </label>
            {posible.usarMargen ? (
              <Field
                className="pl-7 max-w-[200px]"
                label="Multiplicador"
                help="Redondeamos a los $ 10 más cercanos."
                error={efectivas.usarMargen && !multiplicadorValido ? "Un número entre 1 y 10, por ejemplo 1,6." : ""}
              >
                <Input inputMode="decimal" value={multiplicadorTexto} disabled={!efectivas.usarMargen} onChange={(e) => setMultiplicadorTexto(e.target.value)} />
              </Field>
            ) : (
              <span className="pd-help pl-7">El archivo no tiene columna de costo.</span>
            )}
          </div>
        </div>
        {tieneColumna("categoria") && (
          <Alert>
            Las categorías se buscan por nombre entre las del club. Las que no existan quedan sin categoría: no se crean categorías nuevas.
          </Alert>
        )}
        {!algunaAccion && !sinPermisos && <p className="pd-error m-0">Elegí al menos una acción.</p>}
      </>
    );
  }

  function renderPaso5() {
    if (!analisis) return null;
    const secciones = [
      efectivas.crear && { value: "nuevos", label: "Nuevos", count: analisis.nuevos.length },
      efectivas.actualizarPrecios && { value: "cambios", label: "Cambios de precio", count: analisis.cambios.length },
      efectivas.sumarStock && { value: "stock", label: "Stock a sumar", count: analisis.stock.length },
      { value: "errores", label: "Filas con error", count: analisis.errores.length },
    ].filter(Boolean);
    const activa = secciones.some((s) => s.value === seccion) ? seccion : secciones[0].value;
    return (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {secciones.map((s) => (
            <StatTile key={s.value} value={numeroAR(s.count)} label={s.label} />
          ))}
        </div>
        {analisis.sinCambios > 0 && (
          <p className="body-sm text-ink-2 m-0">
            {analisis.sinCambios === 1 ? "1 fila coincide con un producto y no trae cambios." : `${numeroAR(analisis.sinCambios)} filas coinciden con productos y no traen cambios.`}
          </p>
        )}
        <Tabs items={secciones} value={activa} onChange={setSeccion} ariaLabel="Secciones de la revisión" />
        {activa === "nuevos" && renderNuevos()}
        {activa === "cambios" && renderCambios()}
        {activa === "stock" && renderStock()}
        {activa === "errores" && renderErrores()}
        <p className="body-sm text-ink-2 m-0">
          Se van a escribir {plan.crear.length} productos nuevos, {plan.actualizar.length} precios y {plan.movimientos.length} movimientos de stock.
        </p>
      </>
    );
  }

  function cabeceraSeccion(items, titulo) {
    const marcadas = items.filter(estaMarcada).length;
    return (
      <div className="pd-table-head">
        <h3>
          {titulo}
          <span className="pd-count">
            {marcadas} de {items.length}
          </span>
        </h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => marcarTodas(items, true)}>
            Marcar todo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => marcarTodas(items, false)}>
            Ninguno
          </Button>
        </div>
      </div>
    );
  }

  function avisoTope(items) {
    return items.length > MAX_FILAS_VISTA ? (
      <p className="body-sm text-ink-2 m-0 px-4 py-3">
        Se muestran las primeras {MAX_FILAS_VISTA} filas. Las otras {numeroAR(items.length - MAX_FILAS_VISTA)} también se importan si quedan marcadas.
      </p>
    ) : null;
  }

  function casillaFila(item, nombre) {
    return (
      <label className="pd-check">
        <input type="checkbox" checked={estaMarcada(item)} onChange={(e) => marcar(item.clave, e.target.checked)} aria-label={`Incluir ${nombre}`} />
      </label>
    );
  }

  function vacio(texto) {
    return <p className="body-md text-ink-2 m-0 py-6 text-center">{texto}</p>;
  }

  function renderNuevos() {
    const items = analisis.nuevos;
    if (!items.length) return vacio("No hay productos nuevos en el archivo.");
    return (
      <>
        {analisis.categoriasDesconocidas.length > 0 && (
          <Alert tone="warning">
            Estas categorías no existen en el club y sus productos quedan sin categoría: <strong>{analisis.categoriasDesconocidas.join(", ")}</strong>. Si las querés,
            creálas antes en Categorías y volvé a importar.
          </Alert>
        )}
        <div className="pd-table-wrap">
          {cabeceraSeccion(items, "Productos nuevos")}
          <div className="overflow-x-auto">
            <table className="pd-table">
              <thead>
                <tr>
                  <th scope="col" className="w-10">
                    <span className="sr-only">Incluir</span>
                  </th>
                  <th scope="col">Producto</th>
                  <th scope="col" className="num">
                    Precio
                  </th>
                  <th scope="col" className="num">
                    Costo
                  </th>
                  <th scope="col" className="num">
                    Stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, MAX_FILAS_VISTA).map((n) => (
                  <tr key={n.clave}>
                    <td>{casillaFila(n, n.nombre)}</td>
                    <td>
                      <span className="block">{n.nombre}</span>
                      <span className="body-sm text-ink-3">
                        Fila {n.fila}
                        {n.sku ? ` · SKU ${n.sku}` : ""}
                        {n.categoria ? ` · ${n.categoriaId ? n.categoria : `${n.categoria} (sin categoría)`}` : ""}
                      </span>
                    </td>
                    <td className="num whitespace-nowrap">
                      {formatPrecio(n.precio)}
                      {n.precioDerivado && <span className="block body-sm text-ink-3">desde costo</span>}
                    </td>
                    <td className="num whitespace-nowrap">{n.costo !== null ? formatPrecio(n.costo) : "—"}</td>
                    <td className="num">{n.stock !== null && efectivas.sumarStock ? numeroAR(n.stock) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {avisoTope(items)}
        </div>
      </>
    );
  }

  function renderCambios() {
    const items = analisis.cambios;
    if (!items.length) return vacio("Ningún precio cambia con este archivo.");
    return (
      <div className="pd-table-wrap">
        {cabeceraSeccion(items, "Cambios de precio")}
        <div className="overflow-x-auto">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col" className="w-10">
                  <span className="sr-only">Incluir</span>
                </th>
                <th scope="col">Producto</th>
                <th scope="col" className="num">
                  Precio
                </th>
                <th scope="col" className="num">
                  Variación
                </th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, MAX_FILAS_VISTA).map((c) => {
                const v = c.variacion;
                const textoV = v === null ? "—" : `${v > 0 ? "+" : ""}${v}%`;
                return (
                  <tr key={c.clave}>
                    <td>{casillaFila(c, c.producto.nombre)}</td>
                    <td>
                      <span className="block">{c.producto.nombre}</span>
                      <span className="body-sm text-ink-3">
                        Fila {c.fila}
                        {c.precioDerivado ? " · desde costo" : ""}
                      </span>
                    </td>
                    <td className="num whitespace-nowrap">
                      <span className="text-ink-2">{formatPrecio(c.antes)}</span>
                      <ArrowRight className="pd-icon inline mx-1 align-[-4px]" size={20} aria-label="pasa a" />
                      <span className="font-semibold">{formatPrecio(c.despues)}</span>
                    </td>
                    <td className="num">{v !== null && Math.abs(v) > 30 ? <Badge tone="warning">{textoV}</Badge> : textoV}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {avisoTope(items)}
      </div>
    );
  }

  function renderStock() {
    const items = analisis.stock;
    if (!items.length) return vacio("No hay stock para sumar a productos que ya existen.");
    return (
      <div className="pd-table-wrap">
        {cabeceraSeccion(items, "Stock a sumar")}
        <div className="overflow-x-auto">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col" className="w-10">
                  <span className="sr-only">Incluir</span>
                </th>
                <th scope="col">Producto</th>
                <th scope="col" className="num">
                  Actual
                </th>
                <th scope="col" className="num">
                  Suma
                </th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, MAX_FILAS_VISTA).map((s) => (
                <tr key={s.clave}>
                  <td>{casillaFila(s, s.producto.nombre)}</td>
                  <td>
                    <span className="block">{s.producto.nombre}</span>
                    <span className="body-sm text-ink-3">Fila {s.fila}</span>
                    {s.producto.controlaStock === false && (
                      <Badge className="ml-2">No controla stock</Badge>
                    )}
                  </td>
                  <td className="num">{numeroAR(s.actual)}</td>
                  <td className="num font-semibold">
                    {s.cantidad > 0 ? "+" : ""}
                    {numeroAR(s.cantidad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {avisoTope(items)}
      </div>
    );
  }

  function renderErrores() {
    const items = analisis.errores;
    if (!items.length) return vacio("Todas las filas se pueden importar.");
    return (
      <div className="pd-table-wrap">
        <div className="pd-table-head">
          <h3>
            Filas con error<span className="pd-count">{items.length}</span>
          </h3>
          <span className="body-sm text-ink-2">No se importan. Corregilas en el archivo si las necesitás.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="pd-table">
            <thead>
              <tr>
                <th scope="col" className="num">
                  Fila
                </th>
                <th scope="col">Producto</th>
                <th scope="col">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, MAX_FILAS_VISTA).map((e) => (
                <tr key={e.fila}>
                  <td className="num">{e.fila}</td>
                  <td>{e.nombre || <span className="text-ink-3">—</span>}</td>
                  <td>
                    <Badge tone="danger">{e.motivo}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {avisoTope(items)}
      </div>
    );
  }

  function renderPaso6() {
    const pct = progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : 0;
    if (resultado) {
      const partes = [
        `${numeroAR(resultado.creados)} ${resultado.creados === 1 ? "producto creado" : "productos creados"}`,
        `${numeroAR(resultado.actualizados)} ${resultado.actualizados === 1 ? "precio actualizado" : "precios actualizados"}`,
        `${numeroAR(resultado.movimientos)} ${resultado.movimientos === 1 ? "movimiento de stock" : "movimientos de stock"}`,
      ];
      return (
        <>
          <Alert tone="success">
            <strong>Listo.</strong> {partes.join(", ")}.
          </Alert>
          {resultado.movimientos > 0 && <p className="body-sm text-ink-2 m-0">El stock se actualiza en unos segundos, cuando se procesan los movimientos.</p>}
          {resultado.proveedorNombre && (
            <p className="body-sm text-ink-2 m-0">
              {resultado.mapeoGuardado
                ? `Guardamos las columnas para la próxima lista de ${resultado.proveedorNombre}.`
                : `No pudimos guardar las columnas de ${resultado.proveedorNombre}; la próxima vez vas a tener que elegirlas de nuevo.`}
            </p>
          )}
        </>
      );
    }
    if (errorEscritura) {
      return (
        <Alert tone="danger">
          <strong>{errorEscritura}</strong> Se guardaron {numeroAR(progreso.hechos)} de {numeroAR(progreso.total)} cambios. Revisá los productos antes de volver a importar el mismo
          archivo, para no sumar el stock dos veces.
        </Alert>
      );
    }
    return (
      <div className="grid gap-2" aria-live="polite">
        <p className="body-md text-ink m-0">
          Guardando… {numeroAR(progreso.hechos)} de {numeroAR(progreso.total)}
        </p>
        <div
          className="bg-surface-sunken rounded-pill h-2 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Progreso de la importación"
        >
          <div className="bg-lime h-full rounded-pill" style={{ width: `${pct}%` }} />
        </div>
        <p className="body-sm text-ink-2 m-0">No cierres esta ventana.</p>
      </div>
    );
  }

  function renderAcciones() {
    if (paso === 6) {
      return (
        <Button variant="primary" onClick={cerrar} disabled={escribiendo}>
          {resultado ? "Listo" : "Cerrar"}
        </Button>
      );
    }
    const atras = paso > 1 && (
      <Button key="atras" onClick={() => setPaso(paso - 1)}>
        Atrás
      </Button>
    );
    const cancelar = (
      <Button key="cancelar" variant="ghost" onClick={cerrar}>
        Cancelar
      </Button>
    );
    let principal = null;
    if (paso === 1)
      principal = (
        <Button variant="primary" onClick={irAPaso2} disabled={leyendo}>
          Siguiente
        </Button>
      );
    if (paso === 2)
      principal = (
        <Button variant="primary" onClick={() => setPaso(3)} disabled={hoja.filas.length <= filaEncabezado + 1}>
          Siguiente
        </Button>
      );
    if (paso === 3)
      principal = (
        <Button variant="primary" onClick={irAPaso4} disabled={!tieneColumna("nombre")}>
          Siguiente
        </Button>
      );
    if (paso === 4)
      principal = (
        <Button variant="primary" onClick={irAPaso5} disabled={!algunaAccion || (efectivas.usarMargen && !multiplicadorValido)}>
          Siguiente
        </Button>
      );
    if (paso === 5)
      principal = (
        <Button variant="primary" onClick={importar} disabled={!totalPlan}>
          Importar
        </Button>
      );
    return (
      <>
        {cancelar}
        {atras}
        {principal}
      </>
    );
  }
}
