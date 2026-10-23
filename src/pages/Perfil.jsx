import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Calendar, Camera, Check, CircleDot, LogOut } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getUserData } from "../services/authService";
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { sendEmailVerification, deleteUser, signOut } from "firebase/auth";
import {
  getInscripcionesByJugador,
  getTorneosByOrganizer,
  getHistorialPartidos,
} from "../services/torneoService";
import { getClubByOwner } from "../services/canchaService";
import { uploadProfilePhoto } from "../services/storageService";
import { toast } from "../components/Toast";
import { confirmar } from "../components/ConfirmDialog";
import { formatFecha } from "../utils/formatDate";
import { Badge, Button, Card, Field, Input, RankMark, Select, StatTile } from "../components/ui";

// Grilla de datos de solo lectura: etiqueta en caption, valor en body-md ("—" si falta)
function datos(pares) {
  return (
    <dl className="grid grid-cols-2 gap-3">
      {pares.map(([etiqueta, valor, extra]) => (
        <div key={etiqueta}>
          <dt className="caption text-ink-3">{etiqueta}</dt>
          <dd className={extra ? `body-md ${extra}` : "body-md"}>{valor || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// "pendiente_aprobacion" → "Pendiente aprobacion" (solo presentación, sentence case)
function sentenceCase(s) {
  const texto = String(s || "").replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function Perfil() {
  const { user, setUser, refreshPerfil } = useAuthStore();
  const navigate = useNavigate();
  const fotoInput = useRef(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [verificandoEmail, setVerificandoEmail] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [rol, setRol] = useState("jugador");

  // Jugador
  const [inscripciones, setInscripciones] = useState([]);
  const [cargandoInscripciones, setCargandoInscripciones] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [perfilModificado, setPerfilModificado] = useState(false);
  const [mostrarInfoPuntos, setMostrarInfoPuntos] = useState(false);
  // La categoría (nivel) no se edita: la mueve el sistema de puntos
  const [editForm, setEditForm] = useState({
    nombre: "",
    telefono: "",
    ciudad: "",
    provincia: "",
    nacimiento: "",
    genero: "",
    manoHabil: "",
    posicionPreferida: "",
  });

  // Club
  const [club, setClub] = useState(null);

  // Organizador
  const [entidad, setEntidad] = useState(null);
  const [torneosOrg, setTorneosOrg] = useState([]);

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      let data = null;
      try {
        data = await getUserData(user.uid);
      } catch (err) {
        console.error("Error al cargar perfil:", err);
      }
      if (!data) {
        setLoading(false);
        return;
      }

      setUserData(data);
      if (data.fotoUrl) setFotoUrl(data.fotoUrl);
      const roles = data.role || ["jugador"];
      const rolActual = roles.includes("club")
        ? "club"
        : roles.includes("organizador")
          ? "organizador"
          : "jugador";
      setRol(rolActual);
      if (rolActual === "jugador") {
        setEditForm({
          nombre: data.nombre || "",
          telefono: data.telefono || "",
          ciudad: data.ciudad || "",
          provincia: data.provincia || "",
          nacimiento: data.nacimiento || "",
          genero: data.genero || "",
          manoHabil: data.manoHabil || "",
          posicionPreferida: data.posicionPreferida || "",
        });
      }
      // El perfil se muestra ya; el resto (club, entidad, inscripciones) se carga después
      setLoading(false);

      try {
        if (rolActual === "club") {
          const clubData = await getClubByOwner(user.uid);
          if (clubData) setClub(clubData);
        } else if (rolActual === "organizador") {
          const q = query(
            collection(db, "organizers"),
            where("ownerUid", "==", user.uid),
          );
          const snap = await getDocs(q);
          if (snap.docs.length > 0)
            setEntidad({ id: snap.docs[0].id, ...snap.docs[0].data() });
          const torneos = await getTorneosByOrganizer(user.uid);
          setTorneosOrg(torneos);
        } else {
          setCargandoInscripciones(true);
          const insc = await getInscripcionesByJugador(user.uid);
          setInscripciones(insc);
        }
      } catch (err) {
        console.error("Error al cargar datos del perfil:", err);
      }
      setCargandoInscripciones(false);
    };
    cargar();
  }, [user]);

  const handleGuardar = async () => {
    if (!user) return;
    setGuardando(true);
    try {
      await updateDoc(doc(db, "users", user.uid), editForm);
      setUserData({ ...userData, ...editForm });
      setEditando(false);
      setPerfilModificado(false);
      refreshPerfil();
      toast.success("Perfil guardado");
    } catch (err) {
      console.error("Error al guardar:", err);
      toast.error("No pudimos guardar tu perfil. Intentá de nuevo.");
    }
    setGuardando(false);
  };

  const setEditField = (field, value) => {
    setEditForm({ ...editForm, [field]: value });
    setPerfilModificado(true);
  };

  const handleVerificarEmail = async () => {
    if (!auth.currentUser) return;
    setVerificandoEmail(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setEmailEnviado(true);
    } catch (err) {
      console.error("Error:", err);
    }
    setVerificandoEmail(false);
  };

  const handleCerrarSesion = async () => {
    try {
      await signOut(auth);
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const handleEliminarCuenta = async () => {
    const ok = await confirmar({
      titulo: "Eliminar cuenta",
      mensaje: "¿Estás seguro? Esta acción es irreversible.",
      confirmText: "Continuar",
      danger: true,
    });
    if (!ok) return;
    const seguro = await confirmar({
      titulo: "Última confirmación",
      mensaje: "¿Realmente querés eliminar tu cuenta permanentemente?",
      confirmText: "Eliminar mi cuenta",
      danger: true,
    });
    if (!seguro) return;
    try {
      // users/{uid} y sus subcolecciones los borra la Cloud Function onUserDeleted
      await deleteUser(auth.currentUser);
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Error:", err);
      if (err.code === "auth/requires-recent-login") {
        toast.error("Necesitás cerrar sesión e iniciar sesión de nuevo antes de eliminar tu cuenta.");
      } else {
        toast.error("No pudimos eliminar tu cuenta. Intentá de nuevo.");
      }
    }
  };

  const handleSubirFoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("La imagen no puede superar los 5MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten archivos de imagen"); return; }
    setSubiendoFoto(true);
    try {
      const url = await uploadProfilePhoto(user.uid, file);
      await updateDoc(doc(db, "users", user.uid), { fotoUrl: url });
      setFotoUrl(url);
      refreshPerfil();
      toast.success("Foto actualizada");
    } catch (err) {
      console.error("Error subiendo foto:", err);
      toast.error("Error al subir la foto. Intentá de nuevo.");
    }
    setSubiendoFoto(false);
  };

  const verHistorial = async () => {
    setCargandoHistorial(true);
    setMostrarHistorial(true);
    try {
      const data = await getHistorialPartidos(user.uid);
      setHistorial(data);
    } catch (err) { console.error("Error cargando historial:", err); }
    setCargandoHistorial(false);
  };

  if (loading)
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4" aria-busy="true">
        <p className="sr-only">Cargando perfil…</p>
        <div className="pd-skeleton h-10 w-40" />
        <div className="pd-skeleton h-4 w-24 mb-2" />
        <div className="pd-skeleton h-20 rounded-lg!" />
        <div className="pd-skeleton h-48 rounded-lg!" />
        <div className="pd-skeleton h-48 rounded-lg!" />
      </div>
    );
  if (!userData)
    return (
      <Card className="max-w-2xl mx-auto text-center">
        <p className="body-md">No se encontró tu perfil</p>
      </Card>
    );

  const emailVerificado = auth.currentUser?.emailVerified || false;
  const inscPendientes = inscripciones.filter(
    (i) => i.status !== "confirmada" && i.status !== "rechazada",
  );
  const inscConfirmadas = inscripciones.filter(
    (i) => i.status === "confirmada",
  );
  const rolLabel =
    rol === "jugador" ? "Jugador" : rol === "club" ? "Administrador de club" : "Organizador de torneos";
  const perfilIncompleto = userData && (!userData.telefono || !userData.genero || !userData.nacimiento);
  const victorias = historial.filter((h) => h.gane).length;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <div>
          <h1 className="display-lg">Mi perfil</h1>
          <p className="body-sm text-ink-2">{rolLabel}</p>
        </div>
        <Button as="link" to="/mis-reservas" icon={<Calendar className="pd-icon" size={20} aria-hidden="true" />}>
          Mis reservas
        </Button>
      </header>

      {/* Verificación de email */}
      {!emailVerificado && (
        <Card>
          <div className="flex items-start gap-3 flex-wrap">
            <AlertTriangle className="pd-icon text-warning mt-0.5" size={20} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="heading-sm">Email no verificado</p>
              <p className="body-sm text-ink-2 mt-1">Verificá tu email para mayor seguridad</p>
            </div>
            {emailEnviado ? (
              <span className="body-sm font-semibold! text-success inline-flex items-center gap-1">
                <Check className="pd-icon" size={20} aria-hidden="true" />
                Email enviado
              </span>
            ) : (
              <Button size="sm" onClick={handleVerificarEmail} cargando={verificandoEmail ? "Enviando…" : ""}>
                Verificar email
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ========== PERFIL JUGADOR ========== */}
      {rol === "jugador" && (
        <>
          {perfilIncompleto && (
            <Card>
              <div className="flex items-start gap-3">
                <AlertTriangle className="pd-icon text-warning mt-0.5" size={20} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="heading-sm">Completá tu perfil</p>
                  <p className="body-sm text-ink-2 mt-1">
                    Necesitamos tus datos para inscribirte a torneos.
                    {!userData.telefono && " Falta: teléfono."}
                    {!userData.genero && " Falta: género."}
                    {!userData.nacimiento && " Falta: nacimiento."}
                  </p>
                  <Button size="sm" className="mt-3" onClick={() => setEditando(true)}>
                    Completar ahora
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Foto de perfil */}
          <div className="flex items-center gap-4">
            {fotoUrl ? (
              <img src={fotoUrl} alt="Foto de perfil" className="w-20 h-20 rounded-pill object-cover border border-line" />
            ) : (
              <div
                className="w-20 h-20 rounded-pill bg-surface-sunken border border-line grid place-items-center font-display font-extrabold text-[32px] text-ink"
                aria-hidden="true"
              >
                {(userData?.nombre || user?.email || "J").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <input
                ref={fotoInput}
                type="file"
                accept="image/*"
                onChange={handleSubirFoto}
                disabled={subiendoFoto}
                className="hidden"
                aria-label="Elegir foto de perfil"
              />
              <Button
                size="sm"
                icon={<Camera className="pd-icon" size={20} aria-hidden="true" />}
                cargando={subiendoFoto ? "Subiendo foto…" : ""}
                onClick={() => fotoInput.current?.click()}
              >
                Cambiar foto
              </Button>
              <p className="caption text-ink-3">Una imagen de hasta 5 MB</p>
            </div>
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatTile value={userData.puntos || 0} label="Puntos" />
            <StatTile value={userData.torneosJugados || 0} label="Torneos jugados" />
            <StatTile value={userData.torneosGanados || 0} label="Torneos ganados" />
          </div>

          {/* Datos personales */}
          <Card>
            <Card.Row>
              <Card.Title as="h2">Datos personales</Card.Title>
              {!editando ? (
                <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
                  Editar
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
              )}
            </Card.Row>
            <div className="mt-4">
              {!editando ? (
                datos([
                  ["Nombre", userData.nombre],
                  ["Email", userData.email],
                  ["Teléfono", userData.telefono],
                  ["Ciudad", userData.ciudad],
                  ["Provincia", userData.provincia],
                  ["Nacimiento", formatFecha(userData.nacimiento)],
                  ["Género", userData.genero, "capitalize"],
                ])
              ) : (
                <div className="flex flex-col gap-3">
                  <Field label="Nombre">
                    <Input type="text" value={editForm.nombre} onChange={(e) => setEditField("nombre", e.target.value)} />
                  </Field>
                  <Field label="Teléfono">
                    <Input
                      type="text"
                      inputMode="tel"
                      placeholder="Ej: 385 1234567"
                      value={editForm.telefono}
                      onChange={(e) => setEditField("telefono", e.target.value)}
                    />
                  </Field>
                  <Field label="Ciudad">
                    <Input
                      type="text"
                      placeholder="Ej: Santiago del Estero"
                      value={editForm.ciudad}
                      onChange={(e) => setEditField("ciudad", e.target.value)}
                    />
                  </Field>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Provincia">
                      <Input type="text" value={editForm.provincia} onChange={(e) => setEditField("provincia", e.target.value)} />
                    </Field>
                    <Field label="Nacimiento">
                      <Input type="date" value={editForm.nacimiento} onChange={(e) => setEditField("nacimiento", e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Género">
                    <Select wrapperClassName="block" value={editForm.genero} onChange={(e) => setEditField("genero", e.target.value)}>
                      <option value="">Seleccionar</option>
                      <option value="masculino">Masculino</option>
                      <option value="femenino">Femenino</option>
                      <option value="otro">Otro</option>
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          </Card>

          {/* Datos de juego */}
          <Card>
            <Card.Title as="h2">Datos de juego</Card.Title>

            {/* Categoría: solo lectura, la define el sistema de puntos */}
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <RankMark nivel={userData.nivel} size={40} />
              <div className="flex-1 min-w-0">
                <p className="pd-eyebrow">Categoría</p>
                <p className="heading-md">{userData.nivel || "Sin asignar"}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={mostrarInfoPuntos}
                onClick={() => setMostrarInfoPuntos(!mostrarInfoPuntos)}
              >
                {mostrarInfoPuntos ? "Cerrar" : "¿Cómo funciona?"}
              </Button>
            </div>
            <p className="body-sm text-ink-2 mt-2">Tu categoría cambia automáticamente con tus resultados</p>

            {mostrarInfoPuntos && (
              <div className="pd-card mt-3">
                <h3 className="heading-sm mb-3">Sistema de puntos y categorías</h3>
                <dl className="flex flex-col gap-2 body-sm text-ink-2">
                  <div>
                    <dt className="font-semibold text-ink">Puntos por partido</dt>
                    <dd>Ganar partido: +10 pts · Ganar set: +3 pts · Perder partido: +2 pts</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Bonus por torneo</dt>
                    <dd>Campeón: +50 pts · Subcampeón: +25 pts</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Multiplicador por categoría</dt>
                    <dd>Jugar en categoría superior: x1.5 o x2</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Ascenso automático</dt>
                    <dd>A) 150 pts + 2 victorias · B) 300 pts + 1 victoria · C) 500 pts (experiencia)</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Categorías</dt>
                    <dd>8va → 7ma → 6ta → 5ta → 4ta → 3era → 2da → 1era → Libre</dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="mt-4">
              {!editando ? (
                datos([
                  ["Mano hábil", userData.manoHabil, "capitalize"],
                  ["Posición", userData.posicionPreferida, "capitalize"],
                ])
              ) : (
                <div className="flex flex-col gap-3">
                  <Field label="Mano hábil">
                    <Select wrapperClassName="block" value={editForm.manoHabil} onChange={(e) => setEditField("manoHabil", e.target.value)}>
                      <option value="">Seleccionar</option>
                      <option value="derecha">Derecha</option>
                      <option value="izquierda">Izquierda</option>
                      <option value="ambidiestro">Ambidiestro</option>
                    </Select>
                  </Field>
                  <Field label="Posición preferida">
                    <Select
                      wrapperClassName="block"
                      value={editForm.posicionPreferida}
                      onChange={(e) => setEditField("posicionPreferida", e.target.value)}
                    >
                      <option value="">Seleccionar</option>
                      <option value="drive">Drive (derecha)</option>
                      <option value="reves">Revés (izquierda)</option>
                      <option value="ambas">Ambas</option>
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          </Card>

          {/* Inscripciones y torneos */}
          {cargandoInscripciones && (
            <div className="pd-skeleton h-16 rounded-lg!" aria-busy="true">
              <span className="sr-only">Cargando inscripciones…</span>
            </div>
          )}
          {inscPendientes.length > 0 && (
            <Card>
              <Card.Title as="h2">
                Inscripciones pendientes <span className="pd-count text-ink-3 font-semibold">{inscPendientes.length}</span>
              </Card.Title>
              <ul className="flex flex-col gap-2 mt-3">
                {inscPendientes.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 rounded-md px-4 py-3 bg-surface-sunken">
                    <p className="heading-sm truncate">{i.torneoNombre}</p>
                    <Badge dot tone="warning">
                      {sentenceCase(i.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {inscConfirmadas.length > 0 && (
            <Card>
              <Card.Title as="h2">
                Mis torneos <span className="pd-count text-ink-3 font-semibold">{inscConfirmadas.length}</span>
              </Card.Title>
              <ul className="flex flex-col gap-2 mt-3">
                {inscConfirmadas.map((i) => (
                  <li key={i.id}>
                    <Link
                      to={`/torneos/${i.torneoId}`}
                      className="flex items-center justify-between gap-3 rounded-md px-4 py-3 bg-surface-sunken hover:bg-surface-hover"
                    >
                      <p className="heading-sm truncate">{i.torneoNombre}</p>
                      <Badge dot tone="success">
                        Confirmada
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Historial de partidos */}
          <Card>
            <Card.Row>
              <Card.Title as="h2">Historial de partidos</Card.Title>
              {!mostrarHistorial && (
                <Button size="sm" onClick={verHistorial}>
                  Ver historial
                </Button>
              )}
            </Card.Row>

            {mostrarHistorial && cargandoHistorial && (
              <div className="flex flex-col gap-2 mt-4" aria-busy="true">
                <p className="sr-only">Cargando historial…</p>
                <div className="pd-skeleton h-10" />
                <div className="pd-skeleton h-10" />
                <div className="pd-skeleton h-10" />
              </div>
            )}

            {mostrarHistorial && !cargandoHistorial && historial.length === 0 && (
              <div className="text-center py-6">
                <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
                <p className="body-md">Todavía no tenés partidos registrados</p>
                <p className="body-sm text-ink-2 mt-1">Participá en un torneo para ver tu historial acá</p>
              </div>
            )}

            {mostrarHistorial && !cargandoHistorial && historial.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Badge tone="success">Victorias {victorias}</Badge>
                  <Badge tone="danger">Derrotas {historial.length - victorias}</Badge>
                  <Badge>Partidos {historial.length}</Badge>
                </div>
                <div className="pd-table-wrap mt-3">
                  <div className="overflow-x-auto">
                    <table className="pd-table">
                      <thead>
                        <tr>
                          <th>Torneo</th>
                          <th>Fase</th>
                          <th>Rival</th>
                          <th>Resultado</th>
                          <th className="num">Sets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.map((m, i) => (
                          <tr key={i}>
                            <td>{m.torneoNombre}</td>
                            <td>{m.fase}</td>
                            <td>{m.rival}</td>
                            <td>
                              <Badge tone={m.gane ? "success" : "danger"}>{m.gane ? "Victoria" : "Derrota"}</Badge>
                            </td>
                            <td className="num pd-tnum font-semibold whitespace-nowrap">
                              {m.resultado.sets.map((s) => `${s.g1}–${s.g2}`).join(" · ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* Barra de guardado: el único primary de la pantalla, flota sobre la navegación inferior */}
          {editando && perfilModificado && (
            <div className="fixed bottom-20 md:bottom-6 left-0 right-0 z-30 px-4">
              <div className="max-w-2xl mx-auto pd-card p-2! flex" style={{ boxShadow: "var(--shadow-overlay)" }}>
                <Button variant="primary" block onClick={handleGuardar} cargando={guardando ? "Guardando…" : ""}>
                  Guardar cambios
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== PERFIL CLUB ========== */}
      {rol === "club" && (
        <>
          <Card>
            <Card.Title as="h2">Datos del club</Card.Title>
            <div className="mt-4">
              {club ? (
                datos([
                  ["Nombre", club.nombre],
                  ["Dirección", club.direccion],
                  ["Ciudad", club.ciudad],
                  ["Provincia", club.provincia],
                  ["Teléfono", club.telefono],
                  ["Email", club.email],
                ])
              ) : (
                <p className="body-sm text-ink-2">No se encontraron datos del club</p>
              )}
            </div>
          </Card>

          {club && (
            <Card>
              <Card.Title as="h2">Redes sociales</Card.Title>
              <div className="mt-4">
                {datos([
                  ["Instagram", club.instagram],
                  ["Facebook", club.facebook],
                  ["WhatsApp", club.whatsapp],
                  ["Web", club.website],
                ])}
              </div>
            </Card>
          )}

          <Button as="link" to="/admin" block>
            Ir al panel de administración
          </Button>
        </>
      )}

      {/* ========== PERFIL ORGANIZADOR ========== */}
      {rol === "organizador" && (
        <>
          <Card>
            <Card.Title as="h2">Datos de la entidad</Card.Title>
            <div className="mt-4">
              {entidad ? (
                <div className="flex flex-col gap-3">
                  {datos([
                    ["Nombre", entidad.nombre],
                    ["Teléfono", entidad.telefono],
                    ["Email", entidad.email],
                    ["Ciudad", entidad.ciudad],
                    ["Provincia", entidad.provincia],
                  ])}
                  {entidad.bio && (
                    <div>
                      <p className="caption text-ink-3">Descripción</p>
                      <p className="body-md mt-1">{entidad.bio}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="body-sm text-ink-2">No se encontró la entidad</p>
              )}
            </div>
          </Card>

          {/* Estadísticas org */}
          <section aria-labelledby="torneos-org">
            <h2 id="torneos-org" className="heading-lg mb-3">Mis torneos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatTile value={torneosOrg.length} label="Total" />
              <StatTile
                value={torneosOrg.filter((t) => t.status === "inscripcion" || t.status === "en_curso").length}
                label="Activos"
              />
              <StatTile value={torneosOrg.filter((t) => t.status === "finalizado").length} label="Finalizados" />
            </div>
          </section>

          <Button as="link" to="/org" block>
            Ir al panel de organizador
          </Button>
        </>
      )}

      {/* Acciones de cuenta — todos los roles */}
      <Card className="mb-4">
        <Card.Title as="h2">Cuenta</Card.Title>
        <p className="body-sm text-ink-2 mt-1">{userData.email}</p>
        <label className="pd-check mt-4">
          <input
            type="checkbox"
            checked={userData.buscable !== false}
            onChange={async (e) => {
              const buscable = e.target.checked;
              try {
                await updateDoc(doc(db, "users", user.uid), { buscable });
                setUserData({ ...userData, buscable });
                toast.success(buscable ? "Te van a poder encontrar por tu nombre" : "Ya no aparecés en las búsquedas");
              } catch (err) {
                console.error("Error guardando la preferencia:", err);
                toast.error("No pudimos guardar el cambio.");
              }
            }}
          />
          Aparecer cuando otros jugadores me buscan
        </label>
        <p className="pd-help mt-1 mb-0">Para que te sumen a la cuenta de un turno por tu nombre (se muestra tu nombre, tu foto y tu ciudad; nunca el email ni el teléfono).</p>
        <div className="pd-btn-group mt-4">
          <Button variant="ghost" icon={<LogOut className="pd-icon" size={20} aria-hidden="true" />} onClick={handleCerrarSesion}>
            Cerrar sesión
          </Button>
          <Button variant="ghost" className="text-danger!" onClick={handleEliminarCuenta}>
            Eliminar cuenta
          </Button>
        </div>
      </Card>
    </div>
  );
}
