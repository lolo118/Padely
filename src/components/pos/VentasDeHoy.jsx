import { useEffect, useState } from "react";
import Dialogo from "../Dialogo";
import { toast } from "../Toast";
import { confirmar } from "../ConfirmDialog";
import { Alert, Badge, Button, Field, Input } from "../ui";
import { anularVenta, escucharVentasDeCaja } from "../../services/ventasService";
import { esVentaOnlineMp, mpAnularVenta } from "../../services/mercadoPagoService";
import { ETIQUETA_MEDIO } from "../../utils/caja";
import { formatPrecio } from "../../utils/format";
import { formatHora } from "../../utils/formatDate";

// Ventas de la caja abierta (en tiempo real): lista → detalle con items y pagos, "Reimprimir" y "Anular" (con motivo).

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });

function AnularDialog({ venta, clubId, uid, nombre, onCerrar, onAnulada }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const anular = async () => {
    const texto = motivo.trim();
    if (!texto) {
      setError("Contá por qué se anula.");
      return;
    }
    const online = esVentaOnlineMp(venta);
    const ok = await confirmar({
      titulo: `¿Anular la venta ${venta.numero}?`,
      mensaje: online
        ? `Se anula la venta ${venta.numero} y le pedimos a Mercado Pago que devuelva ${formatPrecio(venta.total)}. Si Mercado Pago no lo acepta, te avisamos para que lo hagas desde tu cuenta.`
        : `Se repone el stock y se descuenta ${formatPrecio(venta.total)} de la caja. El número de ticket queda registrado como anulado.`,
      confirmText: "Anular venta",
      danger: true,
    });
    if (!ok) return;
    setGuardando(true);
    try {
      if (online) {
        // Venta online de Mercado Pago (cajaId null): la regla de ventas no la deja tocar; va por la callable (B-P3-8-1)
        const r = await mpAnularVenta({ clubId, numero: venta.numero, motivo: texto });
        if (r?.devolucion?.ok) toast.success(`Venta ${venta.numero} anulada · Mercado Pago devuelve ${formatPrecio(r.devolucion.monto || venta.total)}`);
        else toast.error(`Venta ${venta.numero} anulada, pero Mercado Pago no aceptó la devolución: hacela desde tu cuenta de MP.`);
      } else {
        await anularVenta(clubId, venta.numero, { motivo: texto, uid, nombre });
        toast.success(`Venta ${venta.numero} anulada`);
      }
      onAnulada();
    } catch (e) {
      console.error("Error anulando la venta:", e);
      toast.error("No pudimos anular la venta. Si la caja ya se cerró, no se puede anular.");
      setGuardando(false);
    }
  };
  return (
    <Dialogo
      titulo="Anular venta"
      descripcion={`${venta.numero} · ${formatPrecio(venta.total)}`}
      onCerrar={onCerrar}
      onSubmit={anular}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="danger" cargando={guardando ? "Anulando…" : ""}>
            Anular
          </Button>
        </>
      }
    >
      <div className="mt-4">
        <Field label="Motivo" error={error}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: se cobró dos veces" data-autofocus maxLength={120} />
        </Field>
      </div>
    </Dialogo>
  );
}

export function DetalleVenta({ venta, clubId, uid, nombre, puedeAnular, onReimprimir, onCerrar }) {
  const [anulando, setAnulando] = useState(false);
  const anulada = venta.estado === "anulada";
  return (
    <>
      <Dialogo
        titulo={`Venta ${venta.numero}`}
        descripcion={`${formatHora(venta.creadoEn)} · ${venta.creadoPorNombre || "—"}${venta.cliente?.nombre ? ` · ${venta.cliente.nombre}` : ""}`}
        ancho
        onCerrar={onCerrar}
        acciones={
          <>
            {puedeAnular && !anulada && (
              <Button variant="danger" onClick={() => setAnulando(true)}>
                Anular
              </Button>
            )}
            {onReimprimir && <Button onClick={() => onReimprimir(venta)}>Reimprimir</Button>}
            <Button variant="primary" onClick={onCerrar}>
              Cerrar
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-col gap-4">
          {anulada && (
            <Alert tone="danger">
              <strong>Anulada</strong>
              {venta.anulacion?.porNombre ? ` por ${venta.anulacion.porNombre}` : ""}
              {venta.anulacion?.motivo ? `: ${venta.anulacion.motivo}` : ""}
            </Alert>
          )}
          {venta.pendienteDeSync && <Alert tone="warning">Todavía no se sincronizó con el servidor.</Alert>}
          <div className="pd-table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th className="num">Cant.</th>
                  <th>Producto</th>
                  <th className="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(venta.items || []).map((it, i) => (
                  <tr key={i}>
                    <td className="num">{fmtCant(it.cantidad)}</td>
                    <td>
                      {it.nombre}
                      <span className="block body-sm text-ink-3 pd-tnum">
                        {formatPrecio(it.precio)} c/u{it.descuento > 0 ? ` · desc. −${formatPrecio(it.descuento)}` : ""}
                      </span>
                    </td>
                    <td className="num pd-tnum">{formatPrecio(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="pd-dl">
            <div>
              <dt>Subtotal</dt>
              <dd className="pd-tnum">{formatPrecio(venta.subtotal)}</dd>
            </div>
            {venta.descuento?.monto > 0 && (
              <div>
                <dt>Descuento</dt>
                <dd className="pd-tnum">−{formatPrecio(venta.descuento.monto)}</dd>
              </div>
            )}
            <div>
              <dt>Total</dt>
              <dd className="pd-tnum font-semibold">{formatPrecio(venta.total)}</dd>
            </div>
            {(venta.pagos || []).map((p, i) => (
              <div key={i}>
                <dt>{ETIQUETA_MEDIO[p.medio] || p.medio}</dt>
                <dd className="pd-tnum">
                  {p.medio === "efectivo" && p.entregado ? `${formatPrecio(p.entregado)} · vuelto ${formatPrecio(venta.vuelto)}` : formatPrecio(p.monto)}
                  {p.ref ? <span className="block body-sm text-ink-3">{p.ref}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Dialogo>
      {anulando && (
        <AnularDialog
          venta={venta}
          clubId={clubId}
          uid={uid}
          nombre={nombre}
          onCerrar={() => setAnulando(false)}
          onAnulada={() => {
            setAnulando(false);
            onCerrar();
          }}
        />
      )}
    </>
  );
}

export default function VentasDeHoy({ clubId, caja, uid, nombre, puedeAnular, onReimprimir, onCerrar }) {
  const [estado, setEstado] = useState({ lista: [], cargado: false, error: false });
  const [detalle, setDetalle] = useState(null);
  useEffect(() => {
    if (!clubId || !caja?.id) return undefined;
    const unsub = escucharVentasDeCaja(
      clubId,
      caja.id,
      (lista) => setEstado({ lista, cargado: true, error: false }),
      (err) => {
        console.error("Error escuchando las ventas:", err);
        setEstado({ lista: [], cargado: true, error: true });
      },
    );
    return () => unsub();
  }, [clubId, caja?.id]);

  const okLista = estado.lista.filter((v) => v.estado !== "anulada");
  const totalVendido = okLista.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const ventaDetalle = detalle ? estado.lista.find((v) => v.id === detalle) || null : null;

  return (
    <>
      <Dialogo
        titulo="Ventas de esta caja"
        descripcion={estado.cargado ? `${okLista.length} ${okLista.length === 1 ? "venta" : "ventas"} · ${formatPrecio(totalVendido)}${estado.lista.length - okLista.length ? ` · ${estado.lista.length - okLista.length} anuladas` : ""}` : "Cargando…"}
        ancho="xl"
        onCerrar={onCerrar}
        acciones={
          <Button variant="primary" onClick={onCerrar}>
            Cerrar
          </Button>
        }
      >
        <div className="mt-4">
          {estado.error ? (
            <Alert tone="danger">No pudimos cargar las ventas.</Alert>
          ) : !estado.cargado ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando ventas">
              {[0, 1, 2].map((i) => (
                <div key={i} className="pd-skeleton h-12" />
              ))}
            </div>
          ) : estado.lista.length === 0 ? (
            <p className="body-md text-ink-2 m-0 py-8 text-center">Todavía no hay ventas en esta caja.</p>
          ) : (
            <ul className="m-0 p-0 list-none divide-y divide-line" aria-label="Ventas">
              {estado.lista.map((v) => {
                const anulada = v.estado === "anulada";
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="w-full text-left flex items-center justify-between gap-3 py-3 px-2 rounded-md hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      onClick={() => setDetalle(v.id)}
                      title={anulada ? v.anulacion?.motivo || "Anulada" : undefined}
                    >
                      <span className="flex flex-col min-w-0">
                        <span className="font-semibold pd-tnum">
                          {v.numero} <span className="text-ink-3 font-medium">· {formatHora(v.creadoEn)}</span>
                        </span>
                        <span className="body-sm text-ink-2 truncate">
                          {(v.items || []).map((it) => `${fmtCant(it.cantidad)} ${it.nombre}`).join(", ")}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 flex-none">
                        {(v.pagos || []).map((p, i) => (
                          <Badge key={i}>{ETIQUETA_MEDIO[p.medio] || p.medio}</Badge>
                        ))}
                        {anulada && <Badge tone="danger">Anulada</Badge>}
                        {v.pendienteDeSync && (
                          <Badge tone="warning" dot>
                            Sin sincronizar
                          </Badge>
                        )}
                        <span className={["font-semibold pd-tnum", anulada && "line-through text-ink-3"].filter(Boolean).join(" ")}>{formatPrecio(v.total)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialogo>
      {ventaDetalle && (
        <DetalleVenta
          venta={ventaDetalle}
          clubId={clubId}
          uid={uid}
          nombre={nombre}
          puedeAnular={puedeAnular && caja?.estado === "abierta"}
          onReimprimir={onReimprimir}
          onCerrar={() => setDetalle(null)}
        />
      )}
    </>
  );
}
