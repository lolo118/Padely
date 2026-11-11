import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { CheckCircle2, ChevronLeft, CreditCard, UserPlus, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import useTituloPagina from "../../hooks/useTituloPagina";
import { getCanchas, getReservas, getTurnosFijos } from "../../services/canchaService";
import { buscarPerfiles } from "../../services/participantesService";
import { getDisponibilidad, getOcupacion, getProfe, getVinculo, pagarClaseOnline, reservarClase, useFlagProfes } from "../../services/profesService";
import { DIAS_ANTICIPACION_CLASE, clasesActivas, labelTipoClase, montoReserva, pagoOnlineDisponible, precioEnClub, slotsDeClase, tipoClase } from "../../utils/profes";
import { addDaysLocal, getTodayLocal } from "../../utils/formatDate";
import { formatPrecio } from "../../utils/format";
import { toast } from "../../components/Toast";
import { AvatarProfe, ProfesApagado } from "../../components/profes/ProfeCard";
import { Alert, Badge, Button, Card, Field, Input, Pills } from "../../components/ui";

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const etiquetaDia = (f, i) => {
  if (i === 0) return "Hoy";
  if (i === 1) return "Mañana";
  const [y, m, d] = f.split("-").map(Number);
  return `${DIAS_CORTOS[new Date(y, m - 1, d).getDay()]} ${d}`;
};
const DIAS_VISIBLES = Math.min(14, DIAS_ANTICIPACION_CLASE);

// Acompañantes de una clase de a 2 / grupal: por nombre, o un jugador de Padely (búsqueda por nombre, 3 letras)
function Acompanantes({ lista, max, onCambiar }) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState({ para: "", lista: [] });
  const consulta = texto.trim();
  useEffect(() => {
    if (consulta.length < 3) return undefined;
    let vivo = true;
    const t = setTimeout(() => {
      buscarPerfiles(consulta)
        .then((l) => vivo && setResultados({ para: consulta, lista: l }))
        .catch(() => vivo && setResultados({ para: consulta, lista: [] }));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [consulta]);
  const sugeridos = consulta.length >= 3 && resultados.para === consulta ? resultados.lista.filter((p) => !lista.some((x) => x.uid === p.uid)) : [];
  const lleno = lista.length >= max;
  const sumar = (p) => {
    if (lleno) return;
    onCambiar([...lista, p]);
    setTexto("");
  };
  return (
    <div className="flex flex-col gap-3">
      {lista.length > 0 && (
        <ul className="flex flex-wrap gap-2 m-0 p-0 list-none">
          {lista.map((p, i) => (
            <li key={`${p.uid || p.nombre}-${i}`}>
              <Badge tone={p.uid ? "court" : "neutral"}>
                {p.nombre}
                {p.uid ? " · Padely" : ""}
                <button type="button" className="ml-1 cursor-pointer" aria-label={`Sacar a ${p.nombre}`} onClick={() => onCambiar(lista.filter((_, j) => j !== i))}>
                  <X size={14} aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {!lleno && (
        <>
          <Field label="Sumá a quien viene con vos" help="Escribí el nombre. Si tiene cuenta en Padely, elegilo de la lista y le llega el aviso.">
            <div className="flex gap-2">
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre" maxLength={60} autoComplete="off" />
              <Button icon={<UserPlus className="pd-icon" size={20} aria-hidden="true" />} disabled={consulta.length < 2} onClick={() => sumar({ nombre: consulta, uid: null })}>
                Sumar
              </Button>
            </div>
          </Field>
          {sugeridos.length > 0 && (
            <ul className="m-0 p-0 list-none divide-y divide-line">
              {sugeridos.map((p) => (
                <li key={p.uid} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold truncate">{p.nombre}</span>
                    {p.ciudad && <span className="block body-sm text-ink-3 truncate">{p.ciudad}</span>}
                  </span>
                  <Button size="sm" onClick={() => sumar({ nombre: p.nombre, uid: p.uid })}>
                    Elegir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// /profe/:id/reservar (flags.profes): profe → tipo de clase → club → día y horario → acompañantes → reservar.
// Los horarios salen de la disponibilidad del profe en ese club, sus otras clases y, si la clase ocupa cancha, de la
// grilla del club (reservas, turnos fijos y torneos). La Function vuelve a validar todo en una transacción.
export default function ReservarClase() {
  const { id } = useParams();
  const flag = useFlagProfes();
  const user = useAuthStore((s) => s.user);
  const [profe, setProfe] = useState(undefined);
  const [tipo, setTipo] = useState("");
  const [clubId, setClubId] = useState("");
  const hoy = getTodayLocal();
  const [fecha, setFecha] = useState(hoy);
  const [datosClub, setDatosClub] = useState(null); // { clubId, club, vinculo, disponibilidad, canchas, turnosFijos }
  const [grilla, setGrilla] = useState(null); // { clave, reservas, ocupacion }
  const [slot, setSlot] = useState(null);
  const [acompanantes, setAcompanantes] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [hecha, setHecha] = useState(null);
  const [pagando, setPagando] = useState(false);
  const [version, setVersion] = useState(0);
  useTituloPagina(profe?.nombre ? `Clase con ${profe.nombre}` : "Reservar clase");

  useEffect(() => {
    if (flag !== true) return undefined;
    let vivo = true;
    getProfe(id)
      .then((p) => {
        if (!vivo) return;
        setProfe(p);
        const clases = clasesActivas(p);
        if (clases.length) setTipo(clases[0].tipo);
        const clubes = Object.entries(p?.clubes || {}).filter(([, c]) => c?.estado === "activo");
        if (clubes.length === 1) setClubId(clubes[0][0]);
      })
      .catch(() => vivo && setProfe(null));
    return () => {
      vivo = false;
    };
  }, [id, flag]);

  // Datos del club elegido (una vez por club)
  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    Promise.all([getDoc(doc(db, "clubs", clubId)), getVinculo(clubId, id), getDisponibilidad(id, clubId), getCanchas(clubId), getTurnosFijos(clubId)])
      .then(([clubSnap, vinculo, disponibilidad, canchas, turnosFijos]) => {
        if (vivo) setDatosClub({ clubId, club: clubSnap.exists() ? { id: clubSnap.id, ...clubSnap.data() } : null, vinculo, disponibilidad, canchas, turnosFijos });
      })
      .catch((err) => {
        console.error("Error cargando el club:", err);
        if (vivo) setDatosClub({ clubId, error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, id]);

  // Reservas del día y ocupación del profe (se recargan al cambiar de día o después de reservar)
  const clave = `${clubId}|${fecha}|${version}`;
  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    Promise.all([getReservas(clubId, fecha), getOcupacion(id, hoy)])
      .then(([reservas, ocupacion]) => vivo && setGrilla({ clave, reservas, ocupacion }))
      .catch((err) => {
        console.error("Error cargando horarios:", err);
        if (vivo) setGrilla({ clave, reservas: [], ocupacion: [], error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, fecha, id, hoy, clave]);

  const conf = useMemo(() => clasesActivas(profe).find((c) => c.tipo === tipo) || null, [profe, tipo]);
  const listos = datosClub && datosClub.clubId === clubId && !datosClub.error;
  const grillaLista = grilla && grilla.clave === clave;
  const lugares = 1 + acompanantes.length;
  const slots = useMemo(() => {
    if (!conf || !listos || !grillaLista) return null;
    return slotsDeClase({
      disponibilidad: datosClub.disponibilidad,
      fecha,
      tipo,
      duracion: conf.duracion,
      capacidad: conf.capacidad,
      lugares: tipo === "pareja" ? 2 : 1,
      clubId,
      bloqueaCancha: datosClub.vinculo?.bloqueaCancha !== false,
      canchas: datosClub.canchas,
      permitidas: datosClub.vinculo?.canchas || [],
      reservas: grilla.reservas,
      turnosFijos: datosClub.turnosFijos,
      ocupacion: grilla.ocupacion,
    });
  }, [conf, listos, grillaLista, datosClub, fecha, tipo, clubId, grilla]);

  if (flag === null || (flag && profe === undefined)) return <div className="pd-skeleton h-60 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!flag) return <ProfesApagado />;
  if (!profe || profe.activo === false) {
    return (
      <Card className="text-center py-10!">
        <p className="body-md text-ink-2 m-0">Este profe no está dando clases por ahora.</p>
        <Button as="link" to="/profes" className="mt-4">
          Ver profes
        </Button>
      </Card>
    );
  }
  if (user?.uid === id) {
    return <Alert tone="info">Este es tu perfil de profe: tus alumnos reservan desde acá. Tus clases están en <Link to="/profe/agenda" className="underline">Mi agenda</Link>.</Alert>;
  }

  const clases = clasesActivas(profe);
  const clubes = Object.entries(profe.clubes || {}).filter(([, c]) => c?.estado === "activo");
  const precio = listos ? precioEnClub(profe, datosClub.vinculo, tipo) : conf?.precio || 0;
  const total = montoReserva(precio, lugares);
  const capacidadMax = slot?.unirse ? Math.min(slot.lugares, conf?.capacidad || 1) : conf?.capacidad || 1;
  const maxAcompanantes = tipo === "individual" ? 0 : tipo === "pareja" ? 1 : Math.max(0, capacidadMax - 1);
  const faltaPareja = tipo === "pareja" && acompanantes.length !== 1;
  const online = listos && pagoOnlineDisponible(datosClub.vinculo, datosClub.club);
  const dias = Array.from({ length: DIAS_VISIBLES }, (_, i) => {
    const f = addDaysLocal(hoy, i);
    return { value: f, label: etiquetaDia(f, i) };
  });

  const elegirTipo = (t) => {
    setTipo(t);
    setSlot(null);
    setAcompanantes([]);
  };

  const reservar = async () => {
    if (!slot || !conf) return;
    setEnviando(true);
    try {
      const r = await reservarClase({ profeUid: id, clubId, tipo, fecha, hora: slot.hora, participantes: acompanantes.slice(0, maxAcompanantes) });
      setHecha({ ...r, fecha, hora: slot.hora, horaFin: slot.horaFin, clubNombre: datosClub.club?.nombre || "" });
      toast.success(r.unirse ? "¡Listo! Te sumaste a la clase" : "¡Clase reservada!");
    } catch (err) {
      console.error("Error reservando la clase:", err);
      toast.error(err?.message || "No pudimos reservar la clase. Probá de nuevo.");
      setSlot(null);
      setVersion((v) => v + 1);
    } finally {
      setEnviando(false);
    }
  };

  const pagar = async () => {
    setPagando(true);
    try {
      await pagarClaseOnline(hecha.claseId);
    } catch (err) {
      toast.error(err?.message || "No pudimos abrir Mercado Pago. Podés pagar en el club.");
      setPagando(false);
    }
  };

  if (hecha) {
    return (
      <Card className="max-w-xl mx-auto text-center">
        <CheckCircle2 className="pd-icon-lg mx-auto mb-2 text-success" size={32} aria-hidden="true" />
        <h1 className="heading-lg m-0">{hecha.unirse ? "Te sumaste a la clase" : "Clase reservada"}</h1>
        <p className="body-md text-ink-2 mt-2 mb-0">
          {labelTipoClase(tipo)} con {profe.nombre} · {hecha.clubNombre} · {etiquetaDia(hecha.fecha, hecha.fecha === hoy ? 0 : 2)} {hecha.hora}–{hecha.horaFin}
        </p>
        <p className="numeral-md pd-tnum mt-3 mb-0">{formatPrecio(hecha.monto)}</p>
        <p className="body-sm text-ink-3 mt-1 mb-0">{hecha.pagarOnline ? "Pagala ahora con Mercado Pago o en el club." : "Se paga en el club o al profe."}</p>
        <div className="pd-btn-group justify-center mt-4">
          {hecha.pagarOnline && (
            <Button variant="primary" icon={<CreditCard className="pd-icon" size={20} aria-hidden="true" />} onClick={pagar} cargando={pagando ? "Abriendo…" : ""}>
              Pagar con Mercado Pago
            </Button>
          )}
          <Button as="link" to="/mis-clases">
            Mis clases
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button as="link" to={`/profe/${id}`} variant="ghost" iconOnly aria-label="Volver al perfil" icon={<ChevronLeft className="pd-icon" size={20} aria-hidden="true" />} className="-ml-3 shrink-0" />
        <AvatarProfe profe={profe} size={48} />
        <div className="min-w-0">
          <h1 className="heading-xl m-0 truncate">Clase con {profe.nombre}</h1>
          <p className="body-sm text-ink-3 m-0">Elegí la clase, el club y el horario</p>
        </div>
      </div>

      {clases.length === 0 || clubes.length === 0 ? (
        <Alert tone="info">Este profe todavía no tiene clases o clubes cargados.</Alert>
      ) : (
        <>
          <Card>
            <Card.Title as="h2">Clase</Card.Title>
            <Pills className="mt-3" items={clases.map((c) => ({ value: c.tipo, label: labelTipoClase(c.tipo) }))} value={tipo} onChange={elegirTipo} ariaLabel="Tipo de clase" />
            {conf && (
              <Card.Meta className="mt-2!">
                {conf.duracion} min{conf.capacidad > 1 ? ` · hasta ${conf.capacidad} alumnos · precio por alumno` : ""}
              </Card.Meta>
            )}
            {clubes.length > 1 && (
              <>
                <p className="pd-label mt-4 mb-2">Club</p>
                <Pills
                  items={clubes.map(([cid, c]) => ({ value: cid, label: c.nombre || "Club" }))}
                  value={clubId}
                  onChange={(v) => {
                    setClubId(v);
                    setSlot(null);
                  }}
                  ariaLabel="Club"
                />
              </>
            )}
          </Card>

          {clubId && (
            <Card>
              <Card.Title as="h2">Día y horario</Card.Title>
              <Pills
                className="mt-3 flex-nowrap! overflow-x-auto pb-1"
                items={dias}
                value={fecha}
                onChange={(v) => {
                  setFecha(v);
                  setSlot(null);
                }}
                ariaLabel="Día"
              />
              {datosClub?.error || grilla?.error ? (
                <Alert tone="danger" className="mt-3">No pudimos cargar los horarios. Probá de nuevo en un rato.</Alert>
              ) : slots === null ? (
                <div className="pd-skeleton h-24 rounded-lg mt-3" aria-busy="true" aria-label="Cargando horarios" />
              ) : slots.length === 0 ? (
                <p className="body-sm text-ink-2 mt-3 mb-0">No hay horarios libres este día. Probá con otro.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Horarios">
                  {slots.map((s) => {
                    const elegido = slot?.hora === s.hora;
                    return (
                      <button key={s.hora} type="button" className="pd-pill" aria-pressed={elegido} onClick={() => setSlot(s)}>
                        {s.hora}–{s.horaFin}
                        {s.unirse && <span className="pd-count">{s.lugares === 1 ? "1 lugar" : `${s.lugares} lugares`}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {slots && slots.some((s) => s.unirse) && <Card.Meta className="mt-2!">Los horarios con lugares son clases grupales ya armadas: te sumás.</Card.Meta>}
            </Card>
          )}

          {slot && (
            <Card>
              <Card.Title as="h2">Quiénes van</Card.Title>
              {maxAcompanantes === 0 ? (
                <Card.Meta className="mt-2!">Clase individual: vas vos.</Card.Meta>
              ) : (
                <div className="mt-3">
                  <Acompanantes lista={acompanantes} max={maxAcompanantes} onCambiar={setAcompanantes} />
                </div>
              )}
              {faltaPareja && <Alert tone="info" className="mt-3">La clase de a 2 es para dos: sumá a tu compañero.</Alert>}
              <div className="flex items-baseline justify-between gap-3 mt-4 border-t border-line pt-3">
                <span className="body-md">
                  {lugares > 1 ? `${lugares} × ${formatPrecio(precio)}` : "Total"}
                  <span className="block body-sm text-ink-3">{online ? "Pagás online con Mercado Pago o en el club" : "Se paga en el club o al profe"}</span>
                </span>
                <span className="numeral-md pd-tnum">{formatPrecio(total)}</span>
              </div>
              <Button className="mt-4" variant="primary" block disabled={faltaPareja || (tipoClase(tipo)?.capacidadMax || 1) < lugares} onClick={reservar} cargando={enviando ? "Reservando…" : ""}>
                {slot.unirse ? "Sumarme a la clase" : "Reservar clase"}
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
