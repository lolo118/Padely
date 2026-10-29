import { useEffect, useMemo, useState } from "react";
import { getSociosActivos } from "../../services/membresiasService";
import { beneficiosVigentes } from "../../utils/membresias";
import Dialogo from "../Dialogo";
import { Button, SearchInput } from "../ui";

// Vender (P3-16): elegir un socio activo → su % de descuento en el bar se aplica al ticket (venta.socio). Las reglas
// suman ese % al tope de descuento del cajero.
export default function SocioDialog({ clubId, onElegir, onCerrar }) {
  const [socios, setSocios] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let vivo = true;
    getSociosActivos(clubId)
      .then((l) => vivo && setSocios(l))
      .catch(() => vivo && setSocios([]));
    return () => {
      vivo = false;
    };
  }, [clubId]);
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (socios || [])
      .map((s) => ({ ...s, ben: beneficiosVigentes(s) }))
      .filter((s) => s.ben)
      .filter((s) => !t || String(s.nombre || "").toLowerCase().includes(t) || String(s.numero || "") === t)
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"))
      .slice(0, 30);
  }, [socios, q]);

  return (
    <Dialogo titulo="Venta a un socio" descripcion="Se aplica el descuento en el bar de su plan." onCerrar={onCerrar} onSubmit={(e) => e.preventDefault()} acciones={<Button onClick={onCerrar}>Cancelar</Button>}>
      <div className="mt-4 grid gap-3">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o número de socio" aria-label="Buscar socio" data-autofocus />
        {socios === null ? (
          <div className="pd-skeleton h-24 rounded-lg" aria-busy="true" aria-label="Cargando" />
        ) : lista.length === 0 ? (
          <p className="body-sm text-ink-3 m-0">{socios.length ? "Ningún socio activo coincide." : "El club todavía no tiene socios activos."}</p>
        ) : (
          <ul className="m-0 p-0 list-none grid gap-2 max-h-80 overflow-y-auto">
            {lista.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full text-left rounded-md border border-line px-3 py-2 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => onElegir({ id: s.id, nombre: s.nombre, numero: s.numero || null, planNombre: s.planNombre || null, pct: s.ben.descuentoBarPct })}
                >
                  <span className="body-md font-semibold">{s.nombre}</span>
                  <span className="body-sm text-ink-2">
                    {" "}
                    · {[s.numero ? `Nº ${s.numero}` : null, s.planNombre, s.ben.descuentoBarPct ? `${s.ben.descuentoBarPct} % en el bar` : "sin descuento en el bar"].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialogo>
  );
}
