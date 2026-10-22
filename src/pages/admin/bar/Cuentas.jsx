import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import { Alert, Badge, Button, Card, Tabs } from "../../../components/ui";
import { escucharCuentasAbiertas, getCuentasCerradas } from "../../../services/cuentasService";
import { partesPagadas } from "../../../utils/cuentas";
import { formatPrecio } from "../../../utils/format";
import { formatDiaCorto, formatFechaHora } from "../../../utils/formatDate";

// Cuentas del turno: abiertas (tarjetas, en vivo) y cerradas (últimas 50). El detalle vive en /admin/bar/cuentas/:id.

const haceTexto = (ts) => {
  const d = ts && typeof ts.toDate === "function" ? ts.toDate() : null;
  if (!d) return "";
  const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `hace ${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
};

const TONO_ESTADO = { abierta: "success", cerrada: "neutral", anulada: "danger" };
const ETIQUETA_ESTADO = { abierta: "Abierta", cerrada: "Cerrada", anulada: "Anulada" };

export default function Cuentas() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const clubId = clubActual?.id || null;
  const puedeEntrar = !!clubActual && (puede("cobrarTurnos") || puede("vender"));
  const navigate = useNavigate();
  const [tab, setTab] = useState("abiertas");
  const [abiertas, setAbiertas] = useState({ para: null, lista: [], error: false });
  const [cerradas, setCerradas] = useState({ para: null, lista: [], error: false });

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    const unsub = escucharCuentasAbiertas(
      clubId,
      (lista) => setAbiertas({ para: clubId, lista, error: false }),
      (err) => {
        console.error("Error escuchando las cuentas abiertas:", err);
        setAbiertas({ para: clubId, lista: [], error: true });
      },
    );
    return () => unsub();
  }, [clubId, puedeEntrar]);

  useEffect(() => {
    if (!clubId || !puedeEntrar || tab !== "cerradas") return undefined;
    let vivo = true;
    getCuentasCerradas(clubId)
      .then((lista) => vivo && setCerradas({ para: clubId, lista, error: false }))
      .catch((e) => {
        console.error("Error cargando las cuentas cerradas:", e);
        if (vivo) setCerradas({ para: clubId, lista: [], error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, puedeEntrar, tab]);

  if (!clubCargado) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!clubActual) {
    return (
      <Card className="text-center py-12!">
        <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
        <p className="heading-sm m-0">No tenés un club registrado</p>
      </Card>
    );
  }
  if (!puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Cuentas</h1>
        <SinPermiso />
      </div>
    );
  }

  const lista = abiertas.para === clubId ? abiertas.lista : [];
  const totalAbierto = lista.reduce((s, c) => s + (Number(c.totales?.total) || 0), 0);

  const tarjeta = (c) => {
    const pagadas = partesPagadas(c);
    const partes = c.division?.partes?.length || 0;
    return (
      <Card key={c.id} variant="hover" as="div" role="link" tabIndex={0} onClick={() => navigate(`/admin/bar/cuentas/${c.id}`)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate(`/admin/bar/cuentas/${c.id}`)}>
        <Card.Row className="items-start!">
          <Card.Eyebrow>
            {c.canchaNombre} · {c.horaInicio}
            {c.horaFin ? `–${c.horaFin}` : ""}
          </Card.Eyebrow>
          <Badge tone="success" dot>
            Abierta
          </Badge>
        </Card.Row>
        <Card.Title className="mt-2!">{c.nombreJugador || "Sin nombre"}</Card.Title>
        <Card.Meta className="mt-1!">
          {(c.items || []).length} {(c.items || []).length === 1 ? "consumo" : "consumos"} · abierta {haceTexto(c.abiertaEn)}
          {partes ? ` · ${pagadas}/${partes} partes pagadas` : ""}
        </Card.Meta>
        <p className="numeral-md pd-tnum mt-3 mb-0">{formatPrecio(c.totales?.total)}</p>
      </Card>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="heading-lg m-0">Cuentas</h1>
        {lista.length > 0 && (
          <span className="body-sm text-ink-2 pd-tnum">
            {lista.length} {lista.length === 1 ? "abierta" : "abiertas"} · {formatPrecio(totalAbierto)}
          </span>
        )}
      </div>
      <Tabs
        items={[
          { value: "abiertas", label: "Abiertas", count: lista.length || undefined },
          { value: "cerradas", label: "Cerradas" },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="Cuentas"
        className="mb-6"
      />

      {tab === "abiertas" &&
        (abiertas.error ? (
          <Alert tone="danger">No pudimos cargar las cuentas abiertas.</Alert>
        ) : abiertas.para !== clubId ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando cuentas">
            {[0, 1, 2].map((i) => (
              <div key={i} className="pd-skeleton h-36 rounded-lg" />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <Card className="text-center py-12!">
            <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
            <p className="heading-sm m-0">No hay cuentas abiertas</p>
            <p className="body-sm text-ink-2 mt-1 mb-0">Se abren solas cuando cargás el primer consumo a un turno desde Vender.</p>
            <Button as="link" to="/admin/bar/vender" variant="primary" className="mt-4">
              Ir a Vender
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{lista.map(tarjeta)}</div>
        ))}

      {tab === "cerradas" &&
        (cerradas.error ? (
          <Alert tone="danger">No pudimos cargar las cuentas cerradas.</Alert>
        ) : cerradas.para !== clubId ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando">
            {[0, 1, 2].map((i) => (
              <div key={i} className="pd-skeleton h-14" />
            ))}
          </div>
        ) : cerradas.lista.length === 0 ? (
          <Card className="text-center py-12!">
            <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
            <p className="heading-sm m-0">Todavía no hay cuentas cerradas.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="body-sm text-ink-3 m-0">{cerradas.lista.length >= 50 ? "Las últimas 50 cuentas." : `${cerradas.lista.length} ${cerradas.lista.length === 1 ? "cuenta" : "cuentas"}.`}</p>
            <div className="flex flex-col gap-4 md:hidden">
              {cerradas.lista.map((c) => (
                <Card key={c.id}>
                  <Card.Row className="items-start!">
                    <Card.Eyebrow>
                      {formatDiaCorto(c.fecha)} · {c.canchaNombre} · {c.horaInicio}
                    </Card.Eyebrow>
                    <Badge tone={TONO_ESTADO[c.estado] || "neutral"}>{ETIQUETA_ESTADO[c.estado] || c.estado}</Badge>
                  </Card.Row>
                  <Card.Title className="mt-2!">{c.nombreJugador || "Sin nombre"}</Card.Title>
                  <Card.Meta className="mt-1! pd-tnum">
                    {formatPrecio(c.totales?.total)}
                    {(c.ventas || []).length ? ` · ${c.ventas.join(", ")}` : ""}
                  </Card.Meta>
                  <div className="mt-3">
                    <Button size="sm" onClick={() => navigate(`/admin/bar/cuentas/${c.id}`)}>
                      Ver
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
            <div className="pd-table-wrap hidden md:block">
              <div className="overflow-x-auto">
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Turno</th>
                      <th>A nombre de</th>
                      <th className="num">Total</th>
                      <th>Ventas</th>
                      <th>Estado</th>
                      <th>Cerrada</th>
                      <th>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cerradas.lista.map((c) => (
                      <tr key={c.id}>
                        <td className="pd-tnum whitespace-nowrap">{formatDiaCorto(c.fecha)}</td>
                        <td className="font-semibold whitespace-nowrap">
                          {c.canchaNombre} · {c.horaInicio}
                          {c.horaFin ? `–${c.horaFin}` : ""}
                        </td>
                        <td>{c.nombreJugador || "—"}</td>
                        <td className="num pd-tnum">{formatPrecio(c.totales?.total)}</td>
                        <td className="pd-tnum">{(c.ventas || []).join(", ") || "—"}</td>
                        <td>
                          <Badge tone={TONO_ESTADO[c.estado] || "neutral"}>{ETIQUETA_ESTADO[c.estado] || c.estado}</Badge>
                        </td>
                        <td className="pd-tnum whitespace-nowrap">
                          {formatFechaHora(c.cerradaEn)}
                          {c.cerradaPor === "sistema" ? " · sistema" : ""}
                        </td>
                        <td className="num">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/bar/cuentas/${c.id}`)}>
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      {tab === "abiertas" && lista.length > 0 && (
        <p className="pd-help mt-6 mb-0">Las cuentas abiertas de otros días sin consumos se anulan solas a las 4 de la mañana; con consumos, avisan al dueño.</p>
      )}
    </div>
  );
}
