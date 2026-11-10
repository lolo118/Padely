import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import Dialogo from "../../../components/Dialogo";
import { toast } from "../../../components/Toast";
import { Alert, Badge, Button, Card, Field, Input, Pills } from "../../../components/ui";
import { escucharMesas } from "../../../services/mesasService";
import { abrirCuentaDeMesa, escucharCuentasAbiertas } from "../../../services/cuentasService";
import { esCuentaDeMesa, lugarDeCuenta, saldosDeCuenta } from "../../../utils/cuentas";
import { estadoMesa, minutosAbierta, ocupacionDeMesas, resumenMesas, textoTiempo, zonasDe } from "../../../utils/mesas";
import { formatPrecio } from "../../../utils/format";
import { useOnline } from "../../../utils/conexion";

// Mesas del bar: la grilla en vivo. Libre → abrir una cuenta en la mesa (comensales sin turno). Ocupada → el detalle
// de su cuenta (el mismo de Cuentas: agregar consumos, dividir, cobrar, Mercado Pago, ticket). La ocupación se deriva
// de las cuentas abiertas: cerrar o anular la cuenta libera la mesa. Una cuenta del turno también puede estar en una
// mesa (se asigna desde su detalle).

function AbrirMesaDialog({ mesa, ocupado, onCerrar, onAbrir }) {
  const [cliente, setCliente] = useState("");
  return (
    <Dialogo
      titulo={`Abrir ${mesa.nombre}`}
      descripcion={[mesa.zona, mesa.capacidad ? `${mesa.capacidad} personas` : null].filter(Boolean).join(" · ") || undefined}
      onCerrar={onCerrar}
      onSubmit={() => onAbrir(cliente)}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={ocupado ? "Abriendo…" : ""}>
            Abrir cuenta
          </Button>
        </>
      }
    >
      <div className="mt-4">
        <Field label="A nombre de" help="Opcional: para ubicar la cuenta. Si no, queda con el nombre de la mesa.">
          <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ej: Gómez" maxLength={40} autoComplete="off" data-autofocus />
        </Field>
      </div>
    </Dialogo>
  );
}

export default function Mesas() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const clubId = clubActual?.id || null;
  const uid = user?.uid || null;
  const nombre = perfil?.nombre || user?.displayName || user?.email || "";
  const puedeEntrar = !!clubActual && (puede("cobrarTurnos") || puede("vender"));
  const puedeConfigurar = !!clubActual && puede("editarProductos");
  const navigate = useNavigate();
  const online = useOnline();

  const [mesas, setMesas] = useState({ para: null, lista: [], error: false });
  const [cuentas, setCuentas] = useState({ para: null, lista: [], error: false });
  const [zona, setZona] = useState("");
  const [abriendo, setAbriendo] = useState(null); // mesa
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    const unsubMesas = escucharMesas(
      clubId,
      (lista) => setMesas({ para: clubId, lista, error: false }),
      (err) => {
        console.error("Error escuchando las mesas:", err);
        setMesas({ para: clubId, lista: [], error: true });
      },
    );
    const unsubCuentas = escucharCuentasAbiertas(
      clubId,
      (lista) => setCuentas({ para: clubId, lista, error: false }),
      (err) => {
        console.error("Error escuchando las cuentas abiertas:", err);
        setCuentas({ para: clubId, lista: [], error: true });
      },
    );
    return () => {
      unsubMesas();
      unsubCuentas();
    };
  }, [clubId, puedeEntrar]);

  // El tiempo abierta se refresca cada minuto
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const listaMesas = useMemo(() => (mesas.para === clubId ? mesas.lista.filter((m) => m.activa !== false) : []), [mesas, clubId]);
  const ocupacion = useMemo(() => ocupacionDeMesas(cuentas.para === clubId ? cuentas.lista : []), [cuentas, clubId]);
  const zonas = useMemo(() => zonasDe(listaMesas), [listaMesas]);

  if (!clubCargado) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!clubActual || !puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Mesas</h1>
        {puedeConfigurar ? (
          <Card>
            <p className="body-md m-0">Abrir y cobrar mesas es para quien vende o cobra. Vos podés cargar y editar las mesas del bar.</p>
            <Button as="link" to="/admin/bar/mesas/configurar" variant="primary" className="mt-4">
              Configurar mesas
            </Button>
          </Card>
        ) : (
          <SinPermiso />
        )}
      </div>
    );
  }

  const cargando = (mesas.para !== clubId || cuentas.para !== clubId) && !mesas.error && !cuentas.error;
  const visibles = zona ? listaMesas.filter((m) => m.zona === zona) : listaMesas;
  const resumen = resumenMesas(listaMesas, ocupacion);

  const abrir = async (cliente) => {
    if (!abriendo) return;
    setOcupado(true);
    try {
      const { cuenta, nueva } = await abrirCuentaDeMesa(clubId, abriendo.id, { uid, nombre, cliente });
      if (nueva) toast.success(`${abriendo.nombre}: cuenta abierta`);
      else toast.info(`${abriendo.nombre} ya tenía una cuenta abierta`);
      setAbriendo(null);
      navigate(`/admin/bar/cuentas/${cuenta.id}`);
    } catch (e) {
      console.error("Error abriendo la mesa:", e);
      toast.error(e?.code === "permission-denied" ? "Sin permiso." : e?.code === "unavailable" ? "Sin conexión: probá de nuevo." : e?.message || "No pudimos abrir la mesa.");
    } finally {
      setOcupado(false);
    }
  };

  const tarjeta = (m) => {
    const { libre, cuenta, otras } = estadoMesa(m, ocupacion);
    const ir = () => (libre ? setAbriendo(m) : navigate(`/admin/bar/cuentas/${cuenta.id}`));
    const s = cuenta && (cuenta.pagos || []).length ? saldosDeCuenta(cuenta) : null;
    const items = cuenta ? (cuenta.items || []).length : 0;
    return (
      <Card
        key={m.id}
        variant="hover"
        as="div"
        role="button"
        tabIndex={0}
        aria-label={libre ? `${m.nombre}, libre: abrir cuenta` : `${m.nombre}, ocupada: ver la cuenta`}
        aria-disabled={libre && !online ? true : undefined}
        className={["flex flex-col gap-2 min-h-36", libre ? "" : "bg-court-soft!"].filter(Boolean).join(" ")}
        onClick={() => (libre && !online ? toast.error("Sin conexión: no se puede abrir la mesa.") : ir())}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (libre && !online) toast.error("Sin conexión: no se puede abrir la mesa.");
          else ir();
        }}
      >
        <Card.Row className="items-start!">
          <Card.Title as="h2" className="break-words min-w-0">
            {m.nombre}
          </Card.Title>
          <Badge tone={libre ? "neutral" : "success"} dot={!libre}>
            {libre ? "Libre" : "Ocupada"}
          </Badge>
        </Card.Row>
        {libre ? (
          <Card.Meta className="mt-auto!">{[m.zona, m.capacidad ? `${m.capacidad} personas` : null].filter(Boolean).join(" · ") || "Tocá para abrir"}</Card.Meta>
        ) : (
          <>
            <p className="numeral-md pd-tnum m-0">{formatPrecio(s ? s.pendiente : cuenta.totales?.total)}</p>
            <Card.Meta className="mt-0!">
              {s ? `Falta cobrar · pagado ${formatPrecio(s.pagadoTotal)}` : `${items} ${items === 1 ? "consumo" : "consumos"}`} · {textoTiempo(minutosAbierta(cuenta, ahora))}
            </Card.Meta>
            <div className="flex flex-wrap gap-1 mt-auto">
              {!esCuentaDeMesa(cuenta) && <Badge tone="court">{`Turno · ${lugarDeCuenta(cuenta)}`}</Badge>}
              {cuenta.nombreJugador && cuenta.nombreJugador !== m.nombre && <Badge>{cuenta.nombreJugador}</Badge>}
              {Number(cuenta.pedidosPendientes) > 0 && <Badge tone="warning">{cuenta.pedidosPendientes === 1 ? "1 pedido" : `${cuenta.pedidosPendientes} pedidos`}</Badge>}
              {otras > 0 && <Badge tone="warning">{`+${otras} ${otras === 1 ? "cuenta" : "cuentas"}`}</Badge>}
            </div>
          </>
        )}
      </Card>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="heading-lg m-0">Mesas</h1>
          {!cargando && listaMesas.length > 0 && (
            <p className="body-sm text-ink-2 m-0 mt-1 pd-tnum">
              {resumen.libres} {resumen.libres === 1 ? "libre" : "libres"} · {resumen.ocupadas} {resumen.ocupadas === 1 ? "ocupada" : "ocupadas"}
            </p>
          )}
        </div>
        {puedeConfigurar && (
          <Button as="link" to="/admin/bar/mesas/configurar" variant="ghost" icon={<Settings2 className="pd-icon" size={20} aria-hidden="true" />}>
            Configurar mesas
          </Button>
        )}
      </div>
      {!online && <Alert tone="warning" className="mb-4">Sin conexión: las mesas se ven, pero para abrir una hace falta internet.</Alert>}
      {zonas.length > 1 && (
        <Pills
          className="mb-4"
          items={[{ value: "", label: "Todas" }, ...zonas.map((z) => ({ value: z, label: z }))]}
          value={zona}
          onChange={setZona}
          ariaLabel="Zona"
        />
      )}
      {mesas.error || cuentas.error ? (
        <Alert tone="danger">No pudimos cargar las mesas.</Alert>
      ) : cargando ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Cargando mesas">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-36 rounded-lg" />
          ))}
        </div>
      ) : listaMesas.length === 0 ? (
        <Card className="text-center py-12!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="heading-sm m-0">Todavía no hay mesas</p>
          <p className="body-sm text-ink-2 mt-1 mb-0">{puedeConfigurar ? "Cargá las mesas del salón y del patio para abrir cuentas en cada una." : "Pedile a quien configura el bar que cargue las mesas."}</p>
          {puedeConfigurar && (
            <Button as="link" to="/admin/bar/mesas/configurar" variant="primary" className="mt-4">
              Cargar mesas
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">{visibles.map(tarjeta)}</div>
      )}
      {!cargando && listaMesas.length > 0 && <p className="pd-help mt-6 mb-0">Cobrar o anular la cuenta libera la mesa. Para cambiar de mesa, entrá a la cuenta y tocá "Cambiar de mesa".</p>}
      {abriendo && <AbrirMesaDialog mesa={abriendo} ocupado={ocupado} onCerrar={() => setAbriendo(null)} onAbrir={abrir} />}
    </div>
  );
}
