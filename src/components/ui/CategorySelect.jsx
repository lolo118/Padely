import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import RankMark from "./RankMark";
import { NIVELES, descriptorDeCategoria, esSuma } from "../../utils/categorias";

// Listbox de categoría (pd-catselect): cada opción lleva su marca de rango. El botón cerrado se ve como un Input
// (44px, line-strong, mismo halo de foco). Flechas mueven, Enter elige, Escape cierra, tipear "6" salta.
// value: la categoría elegida ("6ta", "Suma 13") · onChange(categoria)
// opciones: lista de categorías (default: los niveles). Las "Suma N" van en el grupo "Por suma de la pareja".
// placeholder: texto cuando no hay valor · sub: descriptor del botón (default: el de la categoría)
// Para la categoría propia del jugador (solo lectura) no va este componente: RankMark size 40 + el nombre.
export default function CategorySelect({
  value = "",
  onChange,
  opciones = NIVELES,
  placeholder = "Elegí una categoría",
  sub,
  disabled = false,
  id,
  className = "",
  "aria-label": ariaLabel,
  ...rest
}) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const raiz = useRef(null);
  const boton = useRef(null);
  const lista = useRef(null);
  const tipeo = useRef({ texto: "", hasta: 0 });
  const listaId = useId();

  const niveles = useMemo(() => opciones.filter((c) => !esSuma(c)), [opciones]);
  const sumas = useMemo(() => opciones.filter(esSuma), [opciones]);
  const planas = useMemo(() => [...niveles, ...sumas], [niveles, sumas]);
  const indiceValor = planas.indexOf(value);

  function abrir() {
    if (disabled) return;
    setActivo(indiceValor >= 0 ? indiceValor : 0);
    setAbierto(true);
  }
  function cerrar(enfocar = true) {
    setAbierto(false);
    setActivo(-1);
    if (enfocar) boton.current?.focus();
  }
  function elegir(cat) {
    onChange?.(cat);
    cerrar();
  }

  // Click afuera cierra sin devolver el foco
  useEffect(() => {
    if (!abierto) return;
    function afuera(e) {
      if (raiz.current && !raiz.current.contains(e.target)) {
        setAbierto(false);
        setActivo(-1);
      }
    }
    document.addEventListener("mousedown", afuera);
    document.addEventListener("touchstart", afuera);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("touchstart", afuera);
    };
  }, [abierto]);

  // La opción activa queda a la vista
  useEffect(() => {
    if (!abierto || activo < 0) return;
    const el = lista.current?.querySelector(`[data-indice="${activo}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [abierto, activo]);

  function saltarPorTipeo(tecla, ahora) {
    const buffer = ahora - tipeo.current.hasta < 600 ? tipeo.current.texto + tecla : tecla;
    tipeo.current = { texto: buffer.toLowerCase(), hasta: ahora };
    const desde = activo >= 0 ? activo + 1 : 0;
    const orden = [...planas.slice(desde), ...planas.slice(0, desde)];
    const encontrado = orden.find((c) => c.toLowerCase().startsWith(tipeo.current.texto));
    if (encontrado) setActivo(planas.indexOf(encontrado));
  }

  function onKeyDown(e) {
    if (disabled) return;
    if (!abierto) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActivo((i) => Math.min(planas.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActivo((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActivo(0);
        break;
      case "End":
        e.preventDefault();
        setActivo(planas.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activo >= 0) elegir(planas[activo]);
        break;
      case "Escape":
        e.preventDefault();
        cerrar();
        break;
      case "Tab":
        cerrar(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) saltarPorTipeo(e.key, e.timeStamp);
    }
  }

  const activoId = abierto && activo >= 0 ? `${listaId}-${activo}` : undefined;

  // Función, no componente: así las opciones no se desmontan en cada render
  function opcion(cat) {
    const indice = planas.indexOf(cat);
    return (
      <li
        key={cat}
        id={`${listaId}-${indice}`}
        className="pd-catselect-opt"
        role="option"
        aria-selected={cat === value}
        data-active={indice === activo ? "true" : undefined}
        data-indice={indice}
        onMouseEnter={() => setActivo(indice)}
        onClick={() => elegir(cat)}
      >
        <Marca cat={cat} />
        <b>{cat}</b>
        <span>{descriptorDeCategoria(cat)}</span>
      </li>
    );
  }

  return (
    <div ref={raiz} className={["pd-catselect", className].filter(Boolean).join(" ")} {...rest}>
      <button
        ref={boton}
        id={id}
        type="button"
        className="pd-catselect-btn"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? listaId : undefined}
        aria-activedescendant={activoId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={onKeyDown}
      >
        {value ? (
          <>
            <Marca cat={value} />
            <b className="font-display text-[18px]">{value}</b>
            <span className="pd-catselect-sub">{sub ?? descriptorDeCategoria(value)}</span>
          </>
        ) : (
          <span className="pd-catselect-sub">{placeholder}</span>
        )}
        <ChevronDown className="pd-icon" size={20} aria-hidden="true" />
      </button>
      {abierto && (
        <ul ref={lista} id={listaId} className="pd-catselect-list" role="listbox" aria-label={ariaLabel || "Categoría"}>
          {niveles.length > 0 && <li className="pd-catselect-group">{sumas.length > 0 ? "Por nivel" : "Nivel"}</li>}
          {niveles.map(opcion)}
          {sumas.length > 0 && <li className="pd-catselect-group">Por suma de la pareja</li>}
          {sumas.map(opcion)}
        </ul>
      )}
    </div>
  );
}

// La marca de una categoría: el rango del nivel, o las dos pelotas con el más para las sumas
export function Marca({ cat, size = 24 }) {
  if (esSuma(cat)) {
    return (
      <span className="pd-catselect-suma" aria-hidden="true">
        <i></i>
        <em>+</em>
        <i></i>
      </span>
    );
  }
  return <RankMark nivel={cat} size={size} />;
}

