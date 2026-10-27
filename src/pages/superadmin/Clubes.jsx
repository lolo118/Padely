import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Badge, Button, Card, Field, Input, SearchInput } from "../../components/ui";
import Dialogo from "../../components/Dialogo";
import { toast } from "../../components/Toast";
import { getClubesAdmin, reactivarEntidad, suspenderEntidad } from "../../services/superadminService";
import { mpSetComision } from "../../services/mercadoPagoService";
import { useAuthStore } from "../../store/authStore";
import { ubicacionCorta } from "../../utils/format";
import { comisionPct } from "../../utils/planes";
import SuspensionDialog from "./SuspensionDialog";

// Fecha de alta (Timestamp de Firestore, Date, millis o string) → "DD/MM/YY" local; "—" sin dato
function fechaAlta(valor) {
  if (!valor) return "—";
  let fecha = null;
  if (typeof valor.toDate === "function") fecha = valor.toDate();
  else if (valor instanceof Date) fecha = valor;
  else if (typeof valor.seconds === "number") fecha = new Date(valor.seconds * 1000);
  else if (typeof valor === "number" || typeof valor === "string") fecha = new Date(valor);
  if (!fecha || Number.isNaN(fecha.getTime())) return "—";
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const yy = String(fecha.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

const normalizar = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const conteo = (n) => (n === null || n === undefined ? "—" : n);

function Estado({ club }) {
  return club.suspendido ? (
    <Badge tone="danger" title={club.suspendidoMotivo || undefined}>
      Suspendido
    </Badge>
  ) : (
    <Badge tone="success">Activo</Badge>
  );
}

// Comisión de Padely por pago de Mercado Pago (marketplace_fee). P3-9: la normal sale del plan (FREE 2,5 %, el resto 0);
// acá se guarda un override explícito de 0 a 10 % en pasos de 0,5, o se vuelve a la del plan
const tieneOverride = (club) => club?.mercadoPago?.comisionOverridePct !== undefined && club?.mercadoPago?.comisionOverridePct !== null;
function ComisionDialog({ club, onCerrar, onGuardado }) {
  // Vacío = sin override (usa la del plan); así abrir y guardar sin cambios no fija la comisión para siempre
  const [pct, setPct] = useState(tieneOverride(club) ? String(club.mercadoPago.comisionOverridePct) : "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const volverAlPlan = async () => {
    setGuardando(true);
    try {
      await mpSetComision({ clubId: club.id, pct: null });
      toast.success(`${club.nombre || "El club"} vuelve a la comisión de su plan`);
      onGuardado(null);
    } catch (err) {
      console.error("Error quitando el override de comisión:", err);
      setError(err?.message || "No pudimos guardar la comisión.");
      setGuardando(false);
    }
  };
  const guardar = async () => {
    if (String(pct).trim() === "") {
      if (tieneOverride(club)) await volverAlPlan();
      else onCerrar();
      return;
    }
    const n = Number(String(pct).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 10 || Math.round(n * 2) !== n * 2) {
      setError("Entre 0 y 10, en pasos de 0,5.");
      return;
    }
    setGuardando(true);
    try {
      await mpSetComision({ clubId: club.id, pct: n });
      toast.success(`Comisión de ${club.nombre || "el club"}: ${n} %`);
      onGuardado(n);
    } catch (err) {
      console.error("Error guardando la comisión:", err);
      setError(err?.message || "No pudimos guardar la comisión.");
      setGuardando(false);
    }
  };
  return (
    <Dialogo
      titulo="Comisión Padely"
      descripcion={`${club.nombre || "Club"} · se descuenta de cada pago por Mercado Pago (marketplace_fee)`}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          {tieneOverride(club) && (
            <Button variant="ghost" onClick={volverAlPlan} disabled={guardando}>
              Usar la del plan
            </Button>
          )}
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mt-4">
        <Field label="Comisión (%)" help={`Vacío = la del plan (FREE 2,5 %, prueba y PRO 0 %). Un número la fija para este club${tieneOverride(club) ? " (hoy tiene una fija)" : ""}. Cambia los pagos nuevos, no los ya creados.`} error={error}>
          <Input type="number" min="0" max="10" step="0.5" inputMode="decimal" value={pct} placeholder={`${comisionPct(club).toLocaleString("es-AR")} (según el plan)`} onChange={(e) => setPct(e.target.value)} data-autofocus className="pd-tnum" />
        </Field>
      </div>
    </Dialogo>
  );
}

function Acciones({ club, onAccion, className = "" }) {
  return (
    <div className={["pd-btn-group", className].filter(Boolean).join(" ")}>
      <Button size="sm" as="link" to={`/club/${club.id}`}>
        Ver página pública
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onAccion("verComo", club)}>
        Ver como
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onAccion("comision", club)}>
        {`Comisión MP ${comisionPct(club).toLocaleString("es-AR")} %${tieneOverride(club) ? " (fija)" : ""}`}
      </Button>
      {club.suspendido ? (
        <Button size="sm" onClick={() => onAccion("reactivar", club)}>
          Reactivar
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => onAccion("suspender", club)}>
          Suspender
        </Button>
      )}
    </div>
  );
}

export default function Clubes() {
  const user = useAuthStore((s) => s.user);
  const entrarVerComo = useAuthStore((s) => s.entrarVerComo);
  const navigate = useNavigate();
  const [clubes, setClubes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [dialogo, setDialogo] = useState(null); // { modo, club }
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    let vigente = true;
    getClubesAdmin()
      .then((lista) => {
        if (!vigente) return;
        setClubes(lista);
        setError(false);
      })
      .catch((err) => {
        console.error("Error cargando clubes:", err);
        if (vigente) setError(true);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [intento]);

  const reintentar = () => {
    setCargando(true);
    setError(false);
    setIntento((n) => n + 1);
  };

  const ordenados = useMemo(
    () => [...clubes].sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" })),
    [clubes],
  );

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return ordenados;
    return ordenados.filter((c) =>
      [c.nombre, c.ciudad, c.dueñoEmail].some((campo) => normalizar(campo).includes(q)),
    );
  }, [ordenados, busqueda]);

  // P3-15: "Ver como" abre el panel del club en solo lectura (banner con Salir)
  const verComo = async (club) => {
    const ok = await entrarVerComo(club.id);
    if (ok) navigate("/admin");
    else toast.error("No pudimos abrir el panel de ese club.");
  };
  const abrirDialogo = (modo, club) => (modo === "verComo" ? verComo(club) : modo === "comision" ? setComisionDe(club) : setDialogo({ modo, club }));
  const [comisionDe, setComisionDe] = useState(null); // club con el diálogo de comisión abierto
  const cerrarDialogo = () => {
    if (!procesando) setDialogo(null);
  };

  const confirmar = async (motivo) => {
    if (!dialogo || !user?.uid) return;
    const { modo, club } = dialogo;
    setProcesando(true);
    try {
      if (modo === "suspender") {
        await suspenderEntidad("clubs", club.id, { motivo, uid: user.uid });
        setClubes((prev) =>
          prev.map((c) => (c.id === club.id ? { ...c, suspendido: true, suspendidoMotivo: String(motivo || "").trim() } : c)),
        );
        toast.success("Club suspendido");
      } else {
        await reactivarEntidad("clubs", club.id, { uid: user.uid });
        setClubes((prev) => prev.map((c) => (c.id === club.id ? { ...c, suspendido: false, suspendidoMotivo: "" } : c)));
        toast.success("Club reactivado");
      }
      setDialogo(null);
    } catch (err) {
      console.error("Error cambiando el estado del club:", err);
      toast.error(
        modo === "suspender"
          ? "No pudimos suspender el club. Intentá de nuevo."
          : "No pudimos reactivar el club. Intentá de nuevo.",
      );
    } finally {
      setProcesando(false);
    }
  };

  const vacio = clubes.length === 0 ? "Todavía no hay clubes." : "Ningún club coincide con la búsqueda.";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="heading-lg m-0">
          Clubes
          {!cargando && !error && <span className="pd-count">{clubes.length}</span>}
        </h1>
        <SearchInput
          wrapperClassName="w-full md:max-w-sm"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, ciudad o email"
          aria-label="Buscar clubes por nombre, ciudad o email del dueño"
        />
      </header>

      {cargando ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando clubes">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-16" />
          ))}
        </div>
      ) : error ? (
        <Alert tone="danger">
          <p className="m-0">No pudimos cargar los clubes.</p>
          <Button size="sm" className="mt-2" onClick={reintentar}>
            Reintentar
          </Button>
        </Alert>
      ) : filtrados.length === 0 ? (
        <p className="body-md text-ink-2 m-0">{vacio}</p>
      ) : (
        <>
          {/* Teléfono: una tarjeta por club */}
          <div className="flex flex-col gap-4 md:hidden">
            {filtrados.map((club) => (
              <Card key={club.id}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <Card.Title className="m-0! break-words">{club.nombre || "Sin nombre"}</Card.Title>
                  <Estado club={club} />
                </div>
                <dl className="pd-dl">
                  <div>
                    <dt>Ubicación</dt>
                    <dd>{ubicacionCorta(club) || "—"}</dd>
                  </div>
                  <div>
                    <dt>Dueño</dt>
                    <dd className="break-all">{club.dueñoEmail || "—"}</dd>
                  </div>
                  <div>
                    <dt>Canchas</dt>
                    <dd className="pd-tnum">{conteo(club.canchasCount)}</dd>
                  </div>
                  <div>
                    <dt>Staff</dt>
                    <dd className="pd-tnum">{conteo(club.staffCount)}</dd>
                  </div>
                  <div>
                    <dt>Alta</dt>
                    <dd className="pd-tnum">{fechaAlta(club.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Mercado Pago</dt>
                    <dd>{club.mercadoPago?.conectado ? `Conectado${club.mercadoPago.liveMode === false ? " (prueba)" : ""}` : "—"}</dd>
                  </div>
                  {club.suspendido && club.suspendidoMotivo && (
                    <div className="col-span-full">
                      <dt>Motivo</dt>
                      <dd>{club.suspendidoMotivo}</dd>
                    </div>
                  )}
                </dl>
                <Acciones club={club} onAccion={abrirDialogo} className="mt-4" />
              </Card>
            ))}
          </div>

          {/* Desde md: tabla */}
          <div className="pd-table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Club</th>
                    <th>Ubicación</th>
                    <th>Dueño</th>
                    <th className="num">Canchas</th>
                    <th className="num">Staff</th>
                    <th>Alta</th>
                    <th>Estado</th>
                    <th className="num">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((club) => (
                    <tr key={club.id}>
                      <td className="font-semibold">{club.nombre || "Sin nombre"}</td>
                      <td>{ubicacionCorta(club) || "—"}</td>
                      <td className="break-all">{club.dueñoEmail || "—"}</td>
                      <td className="num">{conteo(club.canchasCount)}</td>
                      <td className="num">{conteo(club.staffCount)}</td>
                      <td className="pd-tnum whitespace-nowrap">{fechaAlta(club.createdAt)}</td>
                      <td>
                        <Estado club={club} />
                      </td>
                      <td className="num">
                        <Acciones club={club} onAccion={abrirDialogo} className="justify-end flex-nowrap!" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {comisionDe && (
        <ComisionDialog
          club={comisionDe}
          onCerrar={() => setComisionDe(null)}
          onGuardado={(pct) => {
            setClubes((prev) => prev.map((c) => (c.id === comisionDe.id ? { ...c, mercadoPago: { ...(c.mercadoPago || {}), comisionOverridePct: pct } } : c)));
            setComisionDe(null);
          }}
        />
      )}
      <SuspensionDialog
        abierto={!!dialogo}
        modo={dialogo?.modo}
        nombre={dialogo?.club?.nombre || "este club"}
        tipo="club"
        onConfirmar={confirmar}
        onCerrar={cerrarDialogo}
        cargando={procesando}
      />
    </div>
  );
}
