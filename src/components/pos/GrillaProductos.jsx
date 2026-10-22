import { useMemo, useState } from "react";
import { Badge, Pills, SearchInput } from "../ui";
import { normalizarNombre, tonoStock } from "../../utils/productos";
import { formatPrecio } from "../../utils/format";

// Columna izquierda del POS: buscador (siempre con el foco: un lector de códigos escribe + Enter), pastillas de
// categoría y la grilla de productos. Tocar una tarjeta suma 1; "×n" abre el diálogo de cantidad.

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });

export default function GrillaProductos({ productos = [], categorias = [], onAgregar, onCantidad, inputRef, deshabilitado = false }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("favoritos");

  const activos = useMemo(() => productos.filter((p) => p.activo !== false), [productos]);
  const hayFavoritos = activos.some((p) => p.favorito);
  const filtroEfectivo = filtro === "favoritos" && !hayFavoritos ? "todos" : filtro;
  const termino = normalizarNombre(busqueda);

  const visibles = useMemo(() => {
    let lista = activos;
    if (termino) {
      lista = lista.filter(
        (p) =>
          (p.nombreNorm || normalizarNombre(p.nombre)).includes(termino) ||
          String(p.sku || "").toLowerCase().includes(termino) ||
          String(p.codigoBarras || "").includes(termino),
      );
    } else if (filtroEfectivo === "favoritos") lista = lista.filter((p) => p.favorito);
    else if (filtroEfectivo !== "todos") lista = lista.filter((p) => (p.categoriaId || "sin") === filtroEfectivo);
    return [...lista].sort((a, b) => {
      const fa = a.favorito ? 0 : 1;
      const fb = b.favorito ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const oa = Number(a.orden) || 0;
      const ob = Number(b.orden) || 0;
      if (oa !== ob) return oa - ob;
      return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
    });
  }, [activos, termino, filtroEfectivo]);

  const pills = useMemo(() => {
    const items = [];
    if (hayFavoritos) items.push({ value: "favoritos", label: "Favoritos" });
    items.push({ value: "todos", label: "Todos", count: activos.length });
    const conCategoria = new Set(activos.map((p) => p.categoriaId || "sin"));
    for (const c of [...categorias].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))) {
      if (conCategoria.has(c.id)) items.push({ value: c.id, label: c.nombre });
    }
    if (conCategoria.has("sin") && categorias.length) items.push({ value: "sin", label: "Sin categoría" });
    return items;
  }, [activos, categorias, hayFavoritos]);

  // Enter: un código de barras o SKU exacto suma 1 y limpia; si no, el filtro queda
  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const codigo = busqueda.trim().toLowerCase();
    if (!codigo) return;
    const exacto = activos.find((p) => String(p.codigoBarras || "").toLowerCase() === codigo || String(p.sku || "").toLowerCase() === codigo);
    const unico = !exacto && visibles.length === 1 ? visibles[0] : null;
    const elegido = exacto || unico;
    if (elegido && !deshabilitado) {
      onAgregar(elegido, 1);
      setBusqueda("");
    }
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <SearchInput
        ref={inputRef}
        wrapperClassName="w-full"
        placeholder="Buscar o escanear código…"
        aria-label="Buscar producto o escanear código"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
        autoComplete="off"
        enterKeyHint="done"
      />
      {!termino && pills.length > 1 && <Pills items={pills} value={filtroEfectivo} onChange={setFiltro} ariaLabel="Categorías" />}

      {visibles.length === 0 ? (
        <p className="body-md text-ink-2 m-0 py-8 text-center">{termino ? "Ningún producto coincide." : "No hay productos activos para vender."}</p>
      ) : (
        <ul className="m-0 p-0 list-none grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" aria-label="Productos">
          {visibles.map((p) => {
            const tono = tonoStock(p);
            return (
              <li key={p.id} className="pd-card p-0! flex flex-col min-h-[96px] overflow-hidden">
                <button
                  type="button"
                  className="flex-1 flex flex-col justify-between gap-1 text-left p-3 min-h-[64px] hover:bg-surface-hover active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus disabled:opacity-50"
                  onClick={() => onAgregar(p, 1)}
                  disabled={deshabilitado}
                  aria-label={`Agregar ${p.nombre}, ${formatPrecio(p.precio)}`}
                >
                  <span className="body-sm font-semibold text-ink leading-tight line-clamp-2 break-words">{p.nombre}</span>
                  <span className="flex items-end justify-between gap-2">
                    <span className="font-display font-bold text-[18px] leading-6 pd-tnum">{formatPrecio(p.precio)}</span>
                    {p.controlaStock !== false && (
                      <Badge tone={tono || "neutral"} className="pd-tnum">
                        {fmtCant(p.stock)}
                      </Badge>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="h-9 border-t border-line body-sm font-semibold text-ink-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus disabled:opacity-50"
                  onClick={() => onCantidad(p)}
                  disabled={deshabilitado}
                  aria-label={`Agregar varias unidades de ${p.nombre}`}
                >
                  ×n
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
