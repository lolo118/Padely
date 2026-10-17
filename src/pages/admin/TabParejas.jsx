import { Fragment, useEffect, useState } from "react";
import { Check, Info, Link, MessageCircle, Trash2, X } from "lucide-react";
import {
  agregarPareja,
  getParejas,
  eliminarPareja,
  getInscripciones,
  getContactosParejas,
  getContactosInscripciones,
  actualizarInscripcion,
  actualizarPareja,
  getGrupos,
  getCuadros,
} from "../../services/torneoService";
import { notificarInscripcionConfirmada, notificarInscripcionRechazada } from "../../services/notificationService";
import {
  listaCategorias,
  cuadrosDeTorneo,
  cuadroDePareja,
  cuadroDeGrupo,
  parejasDeCuadro,
  parejasSinCuadro,
} from "../../utils/torneo";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { Badge, Button, Card, Field, Input, MarcaCategoria, Pills, Select } from "../../components/ui";

const inscripcionTone = {
  esperando_companero: "neutral",
  pendiente_aprobacion: "warning",
  confirmada: "success",
  rechazada: "danger",
};

const inscripcionLabel = {
  esperando_companero: "Esperando compañero",
  pendiente_aprobacion: "Pendiente de aprobación",
  confirmada: "Confirmada",
  rechazada: "Rechazada",
};

// Nombre para mostrar: "Pérez / Gómez" (nombrePareja se guarda como "Pérez-Gómez")
const nombreDePareja = (p) =>
  p?.nombrePareja ? p.nombrePareja.replace("-", " / ") : `${p?.jugador1} / ${p?.jugador2}`;

// onParejasChange (opcional): recibe la lista completa de parejas cada vez que cambia, para que el padre
// actualice sus contadores
export default function TabParejas({ torneoId, torneo, onParejasChange }) {
  const [parejas, setParejas] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  // Grupos y documentos de bracket del torneo: sirven para saber qué cuadros ya se generaron
  const [grupos, setGrupos] = useState([]);
  const [cuadrosDocs, setCuadrosDocs] = useState({});
  // Contactos por pareja ({ [pairId]: { whatsapp1, whatsapp2, ... } }): viven aparte, solo los ve el organizador
  const [contactos, setContactos] = useState({});
  const [nombre1, setNombre1] = useState("");
  const [apellido1, setApellido1] = useState("");
  const [nombre2, setNombre2] = useState("");
  const [apellido2, setApellido2] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [whatsapp1, setWhatsapp1] = useState("");
  const [whatsapp2, setWhatsapp2] = useState("");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState(null);
  // Filtro de la lista por cuadro (solo con más de un cuadro): "todas", "sin-cuadro" o el id del cuadro
  const [filtroCuadro, setFiltroCuadro] = useState("todas");
  // Categorías del torneo (género|nivel); con una sola se asigna automáticamente
  const categorias = listaCategorias(torneo);
  const [categoriaManual, setCategoriaManual] = useState(() => {
    const lista = listaCategorias(torneo);
    return lista.length === 1 ? lista[0].id : "";
  });

  useEffect(() => {
    let cancelled = false;
    const cargar = async () => {
      try {
        const [parejasData, inscData, contactosData, contactosInsc, gruposData, cuadrosData] = await Promise.all([
          getParejas(torneoId),
          getInscripciones(torneoId),
          getContactosParejas(torneoId).catch((err) => {
            console.error("Error al cargar los contactos de las parejas:", err);
            return {};
          }),
          getContactosInscripciones(torneoId).catch((err) => {
            console.error("Error al cargar los contactos de las inscripciones:", err);
            return {};
          }),
          getGrupos(torneoId).catch((err) => {
            console.error("Error al cargar los grupos:", err);
            return [];
          }),
          getCuadros(torneoId).catch((err) => {
            console.error("Error al cargar los cuadros:", err);
            return {};
          }),
        ]);
        if (!cancelled) {
          setParejas(parejasData);
          // Los contactos de cada inscripción viven aparte (solo organizador): se suman acá para mostrarlos
          // y para copiarlos a la pareja al confirmar
          setInscripciones(inscData.map((i) => ({ ...i, ...(contactosInsc[i.id] || {}) })));
          setContactos(contactosData);
          setGrupos(gruposData);
          setCuadrosDocs(cuadrosData);
        }
      } catch (err) {
        console.error("Error al cargar parejas:", err);
      }
      if (!cancelled) setLoading(false);
    };
    cargar();
    return () => {
      cancelled = true;
    };
  }, [torneoId]);

  const handleAgregarPareja = async (e) => {
    e.preventDefault();
    if (!apellido1.trim() || !apellido2.trim()) return;
    if (categorias.length > 1 && !categoriaManual) return;
    setGuardando(true);
    try {
      const jugador1 = `${nombre1.trim()} ${apellido1.trim()}`.trim();
      const jugador2 = `${nombre2.trim()} ${apellido2.trim()}`.trim();
      const nombrePareja = `${apellido1.trim()}-${apellido2.trim()}`;
      const categoria = categorias.length === 1 ? categorias[0].id : categoriaManual || null;
      const nuevaPareja = {
        jugador1, jugador2, nombrePareja,
        whatsapp1: whatsapp1.trim(),
        whatsapp2: whatsapp2.trim(),
        jugador1Uid: null,
        jugador2Uid: null,
        categoria,
      };
      const nuevaId = await agregarPareja(torneoId, nuevaPareja);
      const nuevas = [...parejas, { id: nuevaId, ...nuevaPareja }];
      setParejas(nuevas);
      setContactos({ ...contactos, [nuevaId]: { whatsapp1: whatsapp1.trim(), whatsapp2: whatsapp2.trim() } });
      setNombre1(""); setApellido1(""); setNombre2(""); setApellido2("");
      setWhatsapp1(""); setWhatsapp2("");
      toast.success("Pareja agregada");
      onParejasChange?.(nuevas);
    } catch (err) {
      console.error("Error al agregar pareja:", err);
      toast.error("No pudimos agregar la pareja. Intentá de nuevo.");
    }
    setGuardando(false);
  };

  const handleEliminarPareja = async (parejaId) => {
    const ok = await confirmar({ titulo: "Eliminar pareja", mensaje: "¿Eliminar esta pareja del torneo?", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    try {
      await eliminarPareja(torneoId, parejaId);
      const nuevas = parejas.filter((p) => p.id !== parejaId);
      setParejas(nuevas);
      toast.success("Pareja eliminada");
      onParejasChange?.(nuevas);
    } catch (err) {
      console.error("Error al eliminar pareja:", err);
      toast.error("No pudimos eliminar la pareja. Intentá de nuevo.");
    }
  };

  const confirmarInscripcion = async (insc) => {
    try {
      await actualizarInscripcion(torneoId, insc.id, { status: "confirmada" });
      // Agregar como pareja confirmada: la pareja conserva los uids y contactos de la inscripción
      const nombrePareja = `${insc.apellido1}-${insc.apellido2}`;
      const jugador1 = `${insc.nombre1} ${insc.apellido1}`;
      const jugador2 = `${insc.nombre2} ${insc.apellido2}`;
      const nuevaPareja = {
        jugador1,
        jugador2,
        nombrePareja,
        jugador1Uid: insc.jugador1Uid ?? null,
        jugador2Uid: insc.jugador2Uid ?? null,
        whatsapp1: insc.whatsapp1 || "",
        whatsapp2: insc.whatsapp2 || "",
        email1: insc.email1 || "",
        email2: insc.email2 || "",
        categoria: insc.categoria || null,
        inscripcionId: insc.id,
      };
      const nuevaId = await agregarPareja(torneoId, nuevaPareja);
      const nuevas = [...parejas, { id: nuevaId, ...nuevaPareja }];
      setParejas(nuevas);
      setContactos({
        ...contactos,
        [nuevaId]: {
          whatsapp1: insc.whatsapp1 || "",
          whatsapp2: insc.whatsapp2 || "",
          email1: insc.email1 || "",
          email2: insc.email2 || "",
        },
      });
      setInscripciones(
        inscripciones.map((i) =>
          i.id === insc.id ? { ...i, status: "confirmada" } : i,
        ),
      );
      // Avisar a los jugadores vinculados
      const torneoNombre = torneo?.nombre || "torneo";
      if (insc.jugador1Uid) notificarInscripcionConfirmada(insc.jugador1Uid, torneoNombre, torneoId);
      if (insc.jugador2Uid) notificarInscripcionConfirmada(insc.jugador2Uid, torneoNombre, torneoId);
      toast.success("Inscripción confirmada");
      onParejasChange?.(nuevas);
    } catch (err) {
      console.error("Error al confirmar inscripción:", err);
      toast.error("No pudimos confirmar la inscripción. Intentá de nuevo.");
    }
  };

  const rechazarInscripcion = async (inscId) => {
    if (!motivoRechazo.trim()) return;
    const motivo = motivoRechazo.trim();
    const insc = inscripciones.find((i) => i.id === inscId);
    try {
      await actualizarInscripcion(torneoId, inscId, {
        status: "rechazada",
        motivoRechazo: motivo,
      });
      setInscripciones(
        inscripciones.map((i) =>
          i.id === inscId
            ? { ...i, status: "rechazada", motivoRechazo: motivo }
            : i,
        ),
      );
      setRechazandoId(null);
      setMotivoRechazo("");
      // Avisar a los jugadores vinculados con el motivo
      const torneoNombre = torneo?.nombre || "torneo";
      if (insc?.jugador1Uid) notificarInscripcionRechazada(insc.jugador1Uid, torneoNombre, torneoId, motivo);
      if (insc?.jugador2Uid) notificarInscripcionRechazada(insc.jugador2Uid, torneoNombre, torneoId, motivo);
      toast.success("Inscripción rechazada");
    } catch (err) {
      console.error("Error al rechazar inscripción:", err);
      toast.error("No pudimos rechazar la inscripción. Intentá de nuevo.");
    }
  };

  // Mover una pareja de cuadro cambiando su categoría ("" = sin categoría)
  const handleCambiarCategoria = async (p, valor) => {
    const categoria = valor || null;
    if (categoria === cuadroDePareja(p, torneo)) return;
    try {
      await actualizarPareja(torneoId, p.id, { categoria });
      const nuevas = parejas.map((x) => (x.id === p.id ? { ...x, categoria } : x));
      setParejas(nuevas);
      toast.success("Categoría actualizada");
      onParejasChange?.(nuevas);
    } catch (err) {
      console.error("Error al cambiar la categoría de la pareja:", err);
      toast.error("No pudimos cambiar la categoría. Intentá de nuevo.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando parejas">
        <div className="pd-skeleton h-24" />
        <div className="pd-skeleton h-40" />
        <div className="pd-skeleton h-64" />
      </div>
    );
  }

  const cuposDisponibles = torneo.maxParejas - parejas.length;

  // Clasificación por estado
  const esperandoCompanero = inscripciones.filter(
    (i) => i.status === "esperando_companero",
  );
  const pendientesAprobacion = inscripciones.filter(
    (i) => i.status === "pendiente_aprobacion",
  );
  const procesadas = inscripciones.filter(
    (i) => i.status === "confirmada" || i.status === "rechazada",
  );

  // ===== Cuadros =====
  // Un cuadro está "generado" cuando ya tiene grupos (o fixture) o un documento de bracket: fuera de la
  // inscripción no se mueven parejas desde ni hacia un cuadro generado (durante la inscripción, siempre)
  const cuadros = cuadrosDeTorneo(torneo);
  const generado = (cuadroId) =>
    grupos.some((g) => cuadroDeGrupo(g, torneo) === cuadroId) || !!cuadrosDocs[cuadroId];
  // Secciones de la lista cuando hay más de un cuadro: primero las parejas sin categoría válida, después un
  // bloque por cuadro; en la tabla son las pastillas del filtro
  const sinCuadro = parejasSinCuadro(parejas, torneo);
  const secciones = [
    ...(sinCuadro.length > 0 ? [{ id: "sin-cuadro", label: "Sin categoría", sinCuadro: true, parejas: sinCuadro }] : []),
    ...cuadros.map((c) => ({ id: c.id, label: c.label, sinCuadro: false, parejas: parejasDeCuadro(parejas, c.id, torneo) })),
  ];
  const itemsFiltro = [
    { value: "todas", label: "Todas", count: parejas.length },
    ...secciones.map((s) => ({ value: s.id, label: s.label, count: s.parejas.length })),
  ];
  const seccionActiva = secciones.find((s) => s.id === filtroCuadro);
  const filtroActivo = seccionActiva ? filtroCuadro : "todas";
  const parejasVisibles = cuadros.length > 1 && seccionActiva ? seccionActiva.parejas : parejas;

  const cancelarRechazo = () => {
    setRechazandoId(null);
    setMotivoRechazo("");
  };

  const renderPareja = (p, index) => {
    const linkJ1 = `${window.location.origin}/vincular/${torneoId}/${p.id}/1`;
    const linkJ2 = `${window.location.origin}/vincular/${torneoId}/${p.id}/2`;
    const msgJ1 = `¡Hola ${p.jugador1}! Estás inscripto en el torneo "${torneo.nombre}". Vinculá tu cuenta de Padely para recibir puntos y notificaciones: ${linkJ1}`;
    const msgJ2 = `¡Hola ${p.jugador2}! Estás inscripto en el torneo "${torneo.nombre}". Vinculá tu cuenta de Padely para recibir puntos y notificaciones: ${linkJ2}`;
    const wa1 = contactos[p.id]?.whatsapp1 || p.whatsapp1 || "";
    const wa2 = contactos[p.id]?.whatsapp2 || p.whatsapp2 || "";
    // Cambio de categoría: bloqueado fuera de la inscripción si el cuadro actual ya se generó; las parejas sin
    // cuadro siempre pueden moverse, y fuera de la inscripción nunca hacia un cuadro generado
    const cuadroActual = cuadroDePareja(p, torneo);
    const selectBloqueado = torneo.status !== "inscripcion" && cuadroActual !== null && generado(cuadroActual);
    const cuadroPareja = cuadros.find((c) => c.id === cuadroActual);
    const jugadores = [
      { nombre: p.jugador1, uid: p.jugador1Uid, link: linkJ1, mensaje: msgJ1, wa: wa1 },
      { nombre: p.jugador2, uid: p.jugador2Uid, link: linkJ2, mensaje: msgJ2, wa: wa2 },
    ];

    return (
      <tr key={p.id}>
        <td className="pos align-top">{index + 1}</td>
        <td className="align-top">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {nombreDePareja(p)}
            {cuadroActual === null && <Badge>Sin cuadro</Badge>}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {jugadores.map((j, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 body-sm pd-ink-2">
                <span>{j.nombre}</span>
                {j.uid ? <Badge tone="success">Vinculado</Badge> : <Badge tone="warning">Sin vincular</Badge>}
                {!j.uid && (
                  <span className="pd-btn-group">
                    <Button
                      size="sm"
                      iconOnly
                      aria-label={`Copiar link de vinculación de ${j.nombre}`}
                      title="Copiar link de vinculación"
                      icon={<Link className="pd-icon" size={20} aria-hidden="true" />}
                      onClick={() => { navigator.clipboard.writeText(j.link); toast.success("Link copiado"); }}
                    />
                    {j.wa && (
                      <a
                        href={`https://wa.me/${j.wa}?text=${encodeURIComponent(j.mensaje)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pd-btn pd-btn-sm pd-btn-icon"
                        aria-label={`Enviar link por WhatsApp a ${j.nombre}`}
                        title="Enviar por WhatsApp"
                      >
                        <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
                      </a>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </td>
        {categorias.length > 0 && (
          <td className="align-top">
            {categorias.length > 1 ? (
              // Cambiar categoría (mover de cuadro)
              <Field as="div" help={selectBloqueado ? "Ya se generó el cuadro" : undefined} className="min-w-48">
                <div className="flex items-center gap-2">
                  {cuadroPareja?.nivel && <MarcaCategoria cat={cuadroPareja.nivel} />}
                  <Select
                    id={`categoria-${p.id}`}
                    aria-label="Cambiar categoría"
                    value={cuadroActual ?? ""}
                    onChange={(e) => handleCambiarCategoria(p, e.target.value)}
                    disabled={selectBloqueado}
                    title={selectBloqueado ? "Ya se generó el cuadro" : undefined}
                    wrapperClassName="flex-1"
                  >
                    {cuadroActual === null && <option value="">Sin categoría</option>}
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id} disabled={torneo.status !== "inscripcion" && cat.id !== cuadroActual && generado(cat.id)}>
                        {cat.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Field>
            ) : (
              cuadroPareja && (
                <span className="inline-flex items-center gap-2">
                  {cuadroPareja.nivel && <MarcaCategoria cat={cuadroPareja.nivel} />}
                  {cuadroPareja.label}
                </span>
              )
            )}
          </td>
        )}
        <td className="num align-top">
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />}
            onClick={() => handleEliminarPareja(p.id)}
          >
            Eliminar
          </Button>
        </td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Contador */}
      <Card as="section">
        <Card.Row>
          <div>
            <Card.Title as="h2">Parejas inscriptas</Card.Title>
            <Card.Meta>
              {parejas.length} de {torneo.maxParejas} parejas
            </Card.Meta>
          </div>
          <p className={`flex items-baseline gap-1 ${cuposDisponibles > 0 ? "text-success" : "text-danger"}`}>
            {cuposDisponibles > 0 ? (
              <>
                <span className="numeral-lg pd-tnum">{cuposDisponibles}</span>
                <span className="body-sm">cupos</span>
              </>
            ) : (
              <span className="heading-md">Completo</span>
            )}
          </p>
        </Card.Row>
      </Card>

      {/* Pendientes de aprobación - PRIORIDAD */}
      {pendientesAprobacion.length > 0 && (
        <section className="pd-table-wrap">
          <div className="pd-table-head">
            <h3>
              Pendientes de aprobación <span className="pd-count font-medium pd-ink-3">{pendientesAprobacion.length}</span>
            </h3>
            <Badge tone="warning" dot>Pendiente</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Pareja</th>
                  <th className="hidden md:table-cell">Contacto</th>
                  <th>Estado</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientesAprobacion.map((insc) => (
                  <Fragment key={insc.id}>
                    <tr>
                      <td className="align-top">
                        <p className="font-semibold">
                          {insc.apellido1} / {insc.apellido2}
                        </p>
                        <p className="body-sm pd-ink-2">
                          {insc.nombre1} {insc.apellido1} — {insc.nombre2}{" "}
                          {insc.apellido2}
                        </p>
                      </td>
                      <td className="hidden md:table-cell align-top body-sm pd-ink-2">
                        {insc.email1 && <p>{insc.email1}</p>}
                        {insc.whatsapp1 && <p>WA: {insc.whatsapp1}</p>}
                      </td>
                      <td className="align-top">
                        <Badge tone="success">Pareja completa</Badge>
                      </td>
                      <td className="num align-top">
                        {rechazandoId !== insc.id && (
                          <span className="pd-btn-group justify-end">
                            <Button
                              size="sm"
                              icon={<Check className="pd-icon" size={20} aria-hidden="true" />}
                              onClick={() => confirmarInscripcion(insc)}
                            >
                              Confirmar inscripción
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<X className="pd-icon" size={20} aria-hidden="true" />}
                              onClick={() => setRechazandoId(insc.id)}
                            >
                              Rechazar
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                    {rechazandoId === insc.id && (
                      <tr>
                        <td colSpan={4}>
                          <div className="flex flex-col gap-3 md:flex-row md:items-end">
                            <Field label="Motivo del rechazo" className="flex-1">
                              <Input
                                type="text"
                                placeholder="Ej.: la categoría no corresponde"
                                value={motivoRechazo}
                                onChange={(e) => setMotivoRechazo(e.target.value)}
                              />
                            </Field>
                            <span className="pd-btn-group">
                              <Button size="sm" onClick={cancelarRechazo}>
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => rechazarInscripcion(insc.id)}
                                disabled={!motivoRechazo.trim()}
                              >
                                Confirmar rechazo
                              </Button>
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Esperando compañero */}
      {esperandoCompanero.length > 0 && (
        <section className="pd-table-wrap">
          <div className="pd-table-head">
            <h3>
              Esperando confirmación del compañero{" "}
              <span className="pd-count font-medium pd-ink-3">{esperandoCompanero.length}</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Pareja</th>
                  <th className="num">Estado</th>
                </tr>
              </thead>
              <tbody>
                {esperandoCompanero.map((insc) => (
                  <tr key={insc.id}>
                    <td>
                      <p className="font-medium">
                        {insc.apellido1} / {insc.apellido2}
                      </p>
                      <p className="body-sm pd-ink-2">
                        {insc.nombre1} {insc.apellido1} — esperando a {insc.nombre2}{" "}
                        {insc.apellido2}
                      </p>
                    </td>
                    <td className="num">
                      <Badge dot>Esperando</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Historial de solicitudes procesadas */}
      {procesadas.length > 0 && (
        <section className="pd-table-wrap">
          <div className="pd-table-head">
            <h3>
              Historial de solicitudes <span className="pd-count font-medium pd-ink-3">{procesadas.length}</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Pareja</th>
                  <th className="num">Estado</th>
                </tr>
              </thead>
              <tbody>
                {procesadas.map((insc) => (
                  <tr key={insc.id}>
                    <td>
                      <p className="font-medium">
                        {insc.apellido1} / {insc.apellido2}
                      </p>
                      {insc.status === "rechazada" && insc.motivoRechazo && (
                        <p className="body-sm pd-ink-2">Motivo: {insc.motivoRechazo}</p>
                      )}
                    </td>
                    <td className="num">
                      <Badge tone={inscripcionTone[insc.status]} dot>
                        {inscripcionLabel[insc.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Agregar pareja manual */}
      {cuposDisponibles > 0 && (
        <Card as="section">
          <Card.Title as="h2">Agregar pareja manualmente</Card.Title>
          <form onSubmit={handleAgregarPareja} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <p className="pd-eyebrow">Jugador 1</p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nombre">
                  <Input type="text" value={nombre1} onChange={(e) => setNombre1(e.target.value)} />
                </Field>
                <Field label="Apellido">
                  <Input type="text" value={apellido1} onChange={(e) => setApellido1(e.target.value)} required />
                </Field>
              </div>
              <Field label="WhatsApp" help="Con código de país y sin espacios, ej.: 5493851234567">
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={whatsapp1}
                  onChange={(e) => setWhatsapp1(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              <p className="pd-eyebrow">Jugador 2</p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nombre">
                  <Input type="text" value={nombre2} onChange={(e) => setNombre2(e.target.value)} />
                </Field>
                <Field label="Apellido">
                  <Input type="text" value={apellido2} onChange={(e) => setApellido2(e.target.value)} required />
                </Field>
              </div>
              <Field label="WhatsApp" help="Con código de país y sin espacios, ej.: 5493851234567">
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={whatsapp2}
                  onChange={(e) => setWhatsapp2(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>

            {categorias.length > 1 && (
              <Field label="Categoría">
                <Select value={categoriaManual} onChange={(e) => setCategoriaManual(e.target.value)} required>
                  <option value="">Elegí una categoría</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </Select>
              </Field>
            )}
            {categorias.length === 1 && (
              <p className="flex items-center gap-2 body-sm pd-ink-2">
                Categoría:
                <MarcaCategoria cat={categorias[0].nivel} />
                <span className="font-semibold">{categorias[0].label}</span>
              </p>
            )}

            {apellido1.trim() && apellido2.trim() && (
              <p className="body-sm pd-ink-2">
                Nombre de pareja: <span className="font-semibold">{apellido1.trim()} / {apellido2.trim()}</span>
              </p>
            )}

            <p className="flex gap-2 body-sm pd-ink-2">
              <Info className="pd-icon" size={20} aria-hidden="true" />
              <span>
                Agregá el WhatsApp de cada jugador para enviarles un link de vinculación. Así podrán usar la app,
                recibir puntos y participar de reclamos.
              </span>
            </p>

            <div>
              <Button
                type="submit"
                variant="primary"
                disabled={!apellido1.trim() || !apellido2.trim() || (categorias.length > 1 && !categoriaManual)}
                cargando={guardando ? "Agregando…" : ""}
              >
                Agregar pareja
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Lista de parejas confirmadas */}
      <section className="pd-table-wrap">
        <div className="pd-table-head">
          <h3>
            Lista de parejas confirmadas <span className="pd-count font-medium pd-ink-3">{parejas.length}</span>
          </h3>
        </div>
        {parejas.length > 0 && cuadros.length > 1 && (
          <div className="flex flex-col gap-2 px-4 pb-3">
            <Pills items={itemsFiltro} value={filtroActivo} onChange={setFiltroCuadro} ariaLabel="Filtrar parejas por cuadro" />
            {sinCuadro.length > 0 && (
              <p className="body-sm text-warning">
                Sin categoría {sinCuadro.length}: estas parejas no entran en ningún cuadro hasta que les asignes una
                categoría.
              </p>
            )}
          </div>
        )}
        {parejas.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <span className="pd-ball block! mx-auto mb-3" aria-hidden="true" />
            <p className="body-md pd-ink-2">Todavía no hay parejas inscriptas. Agregá la primera.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pareja</th>
                  {categorias.length > 0 && <th>Categoría</th>}
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>{parejasVisibles.map(renderPareja)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
