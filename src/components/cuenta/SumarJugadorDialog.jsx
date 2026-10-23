import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import Dialogo from "../Dialogo";
import { Alert, Badge, Button, Field, Input, Tabs } from "../ui";
import { toast } from "../Toast";
import InvitarWhatsApp from "./InvitarWhatsApp";
import { buscarPerfiles, getCompaneros, sumarJugador } from "../../services/participantesService";
import { iniciales } from "../../utils/cuentas";

// "Sumar jugador" (staff y titular): tres pestañas. Buscar (perfilesPublicos por prefijo, mínimo 3 letras), Por
// nombre (invitado sin cuenta) e Invitar por WhatsApp (el link). Con `companerosDe` (uid) también muestra "Jugaste
// con…". Cada alta pasa por la Function sumarJugador (crea la cuenta si hace falta y avisa al jugador registrado).
//   clubId · grupoId · clubNombre · turno { fecha, horaInicio, canchaNombre } · participantes (activos, para no repetir)
export default function SumarJugadorDialog({ clubId, grupoId, clubNombre, turno, participantes = [], companerosDe = null, pestañaInicial = "buscar", onCerrar, onSumado }) {
  const [tab, setTab] = useState(pestañaInicial);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState({ para: "", lista: [] });
  const [companeros, setCompaneros] = useState([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(null); // uid | "nombre"
  const yaEsta = (uid) => participantes.some((p) => p.uid === uid);

  // Búsqueda con espera corta; "buscando" se deriva (resultados.para es el texto que ya se buscó)
  const consulta = texto.trim();
  useEffect(() => {
    if (consulta.length < 3) return undefined;
    let vivo = true;
    const t = setTimeout(() => {
      buscarPerfiles(consulta)
        .then((lista) => vivo && setResultados({ para: consulta, lista }))
        .catch((err) => {
          console.error("Error buscando jugadores:", err);
          if (vivo) setResultados({ para: consulta, lista: [] });
        });
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [consulta]);
  const buscando = consulta.length >= 3 && resultados.para !== consulta;
  const lista = consulta.length >= 3 && resultados.para === consulta ? resultados.lista : [];

  useEffect(() => {
    if (!companerosDe) return undefined;
    let vivo = true;
    getCompaneros(companerosDe)
      .then((lista) => vivo && setCompaneros(lista))
      .catch((err) => console.error("Error cargando compañeros:", err));
    return () => {
      vivo = false;
    };
  }, [companerosDe]);

  const sumar = async (datos, clave) => {
    setOcupado(clave);
    setError("");
    try {
      const r = await sumarJugador({ clubId, grupoId, ...datos });
      toast.success(r.nuevo === false ? "Ya estaba en el turno" : `${datos.nombre || "Jugador"} sumado al turno`.replace("Jugador sumado", "Sumado"));
      onSumado?.(r);
      if (datos.nombre) setNombre("");
    } catch (e) {
      console.error("Error sumando al turno:", e);
      setError(e?.message || "No pudimos sumar a esa persona.");
    } finally {
      setOcupado(null);
    }
  };
  const sumarPorNombre = () => {
    const n = nombre.trim();
    if (n.length < 2) {
      setError("Un nombre de al menos 2 letras.");
      return;
    }
    sumar({ nombre: n }, "nombre");
  };

  const filaJugador = (j, origen) => (
    <li key={`${origen}-${j.uid}`} className="flex items-center gap-3 py-2">
      <span className="pd-avatar" aria-hidden="true">
        {j.foto ? <img src={j.foto} alt="" /> : iniciales(j.nombre)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold truncate">{j.nombre || "Sin nombre"}</span>
        <span className="block body-sm text-ink-3 truncate">{j.ciudad || (origen === "companero" ? `Jugaron juntos ${j.veces || 1} ${j.veces === 1 ? "vez" : "veces"}` : "")}</span>
      </span>
      {yaEsta(j.uid) ? (
        <Badge tone="success">En el turno</Badge>
      ) : (
        <Button size="sm" icon={<UserPlus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => sumar({ uid: j.uid, nombre: j.nombre }, j.uid)} cargando={ocupado === j.uid ? "…" : ""}>
          Sumar
        </Button>
      )}
    </li>
  );

  return (
    <Dialogo
      titulo="Sumar jugador"
      descripcion={turno ? `${turno.canchaNombre || "Cancha"} · ${turno.horaInicio || ""}${turno.horaFin ? `–${turno.horaFin}` : ""}` : undefined}
      ancho
      onCerrar={onCerrar}
      onSubmit={tab === "nombre" ? sumarPorNombre : undefined}
      acciones={<Button onClick={onCerrar}>Listo</Button>}
    >
      <div className="mt-4 flex flex-col gap-4">
        <Tabs
          items={[
            { value: "buscar", label: "Buscar" },
            { value: "nombre", label: "Por nombre" },
            { value: "wa", label: "Invitar por WhatsApp" },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setError("");
          }}
          ariaLabel="Cómo sumar"
        />
        {tab === "buscar" && (
          <>
            <Field label="Nombre del jugador" help="Jugadores registrados en Padely que aceptan aparecer en las búsquedas. Mínimo 3 letras.">
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: Acosta" maxLength={60} autoComplete="off" data-autofocus />
            </Field>
            {buscando && <div className="pd-skeleton h-12 rounded-lg" aria-busy="true" aria-label="Buscando" />}
            {!buscando && consulta.length >= 3 && lista.length === 0 && <p className="body-sm text-ink-2 m-0">Nadie con ese nombre. Probá "Por nombre" para sumarlo sin cuenta, o invitalo por WhatsApp.</p>}
            {lista.length > 0 && <ul className="m-0 p-0 list-none divide-y divide-line">{lista.map((j) => filaJugador(j, "busqueda"))}</ul>}
            {companerosDe && companeros.length > 0 && consulta.length < 3 && (
              <div>
                <p className="pd-eyebrow m-0 mb-1">Jugaste con…</p>
                <ul className="m-0 p-0 list-none divide-y divide-line">{companeros.map((j) => filaJugador(j, "companero"))}</ul>
              </div>
            )}
          </>
        )}
        {tab === "nombre" && (
          <>
            <Field label="Nombre" help="Para alguien sin cuenta de Padely: queda como invitado, con su parte de la cancha y lo que pida." error={error && tab === "nombre" ? error : ""}>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Pedro" maxLength={40} autoComplete="off" data-autofocus />
            </Field>
            <Button variant="primary" className="self-start" onClick={sumarPorNombre} cargando={ocupado === "nombre" ? "Sumando…" : ""}>
              Sumar invitado
            </Button>
          </>
        )}
        {tab === "wa" && <InvitarWhatsApp clubId={clubId} grupoId={grupoId} clubNombre={clubNombre} turno={turno} />}
        {error && tab !== "nombre" && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialogo>
  );
}
