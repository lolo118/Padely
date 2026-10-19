import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../../components/Toast";
import { Alert, Badge, Button, Card, Field, Input, Pills } from "../../components/ui";
import {
  buscarUsuarioPorEmail,
  cambiarRolUsuario,
  getUsuariosPagina,
  getVinculosDeUsuario,
} from "../../services/superadminService";
import { ubicacionCorta } from "../../utils/format";

const TAMAÑO_PAGINA = 25;

const ROLES = [
  { value: "jugador", label: "Jugador" },
  { value: "club", label: "Club" },
  { value: "organizador", label: "Organizador" },
];

// createdAt (Timestamp de Firestore, Date, número o string ISO) -> "DD/MM/YY"; "—" sin fecha válida
const fechaAlta = (valor) => {
  if (!valor) return "—";
  const d = typeof valor.toDate === "function" ? valor.toDate() : valor instanceof Date ? valor : new Date(valor);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const rolesDe = (u) => {
  const r = Array.isArray(u?.role) ? u.role.filter(Boolean) : u?.role ? [u.role] : [];
  return r.length ? r : ["jugador"];
};

const rolInicial = (u) => {
  const primero = rolesDe(u)[0];
  return ROLES.some((r) => r.value === primero) ? primero : "jugador";
};

const badgesRol = (u) => (
  <span className="pd-badge-group">
    {rolesDe(u).map((r) => (
      <Badge key={r}>{r}</Badge>
    ))}
  </span>
);

// Badges de vínculos; nada mientras cargan o si no hay ninguno
const badgesVinculos = (v) => {
  if (!v) return null;
  const items = [];
  if (v.clubes?.length) items.push(<Badge key="club" tone="court">Dueño de club</Badge>);
  if (v.organizadores?.length) items.push(<Badge key="org" tone="court">Organizador</Badge>);
  (v.staff || []).forEach((s) => {
    items.push(
      <Badge key={`staff-${s.clubId}`} className="pd-badge-wrap">
        {`Staff en ${s.clubNombre || "un club"}${s.activo ? "" : " · inactivo"}`}
      </Badge>,
    );
  });
  return items.length ? <span className="pd-badge-group">{items}</span> : null;
};

// Diálogo de cambio de rol (pd-dialog). Escape y el fondo cierran; el foco entra al abrir y vuelve al cerrar.
function DialogoRol({ usuario, onCerrar, onGuardado }) {
  const [rol, setRol] = useState(() => rolInicial(usuario));
  const [guardando, setGuardando] = useState(false);
  const dialogoRef = useRef(null);
  const inicial = rolInicial(usuario);
  const quien = usuario.nombre || usuario.email || "esta cuenta";

  useEffect(() => {
    const previo = document.activeElement;
    const seleccionada = dialogoRef.current?.querySelector('.pd-pill[aria-selected="true"]');
    (seleccionada || dialogoRef.current)?.focus();
    return () => {
      if (previo && typeof previo.focus === "function") previo.focus();
    };
  }, []);

  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key === "Escape" && !guardando) onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [guardando, onCerrar]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await cambiarRolUsuario(usuario.uid, rol);
      toast.success("Rol actualizado");
      onGuardado(usuario.uid, rol);
    } catch (err) {
      console.error("Error cambiando el rol:", err);
      toast.error("No se pudo cambiar el rol");
      setGuardando(false);
    }
  };

  return (
    <div
      className="pd-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div
        ref={dialogoRef}
        className="pd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cambiar-rol-titulo"
        aria-describedby="cambiar-rol-ayuda"
        tabIndex={-1}
      >
        <h2 className="pd-dialog-title break-words" id="cambiar-rol-titulo">
          Cambiar el rol de {quien}
        </h2>
        <div className="flex flex-col gap-3">
          <Pills items={ROLES} value={rol} onChange={setRol} ariaLabel="Rol de la cuenta" />
          <p className="pd-help" id="cambiar-rol-ayuda">
            Cambiar el rol no crea ni borra el club o la entidad: usalo para corregir cuentas mal registradas.
          </p>
        </div>
        <div className="pd-dialog-actions">
          <Button onClick={onCerrar} disabled={guardando}>
            Volver
          </Button>
          <Button variant="primary" onClick={guardar} disabled={rol === inicial} cargando={guardando ? "Guardando…" : ""}>
            Guardar rol
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Usuarios() {
  // Lista paginada (vista por defecto)
  const [usuarios, setUsuarios] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState(false);

  // Búsqueda por email: resultados === null es la lista paginada
  const [email, setEmail] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState(null);

  // Vínculos por uid, pedidos de a una fila cuando la fila ya se dibujó
  const [vinculos, setVinculos] = useState({});
  const pedidos = useRef(new Set());

  const [editando, setEditando] = useState(null);

  // Primera página; Reintentar suma un intento y la vuelve a pedir
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    getUsuariosPagina(null, TAMAÑO_PAGINA)
      .then((pagina) => {
        if (!vigente) return;
        setUsuarios(pagina.usuarios);
        setCursor(pagina.cursor);
        setHayMas(pagina.hayMas);
        setError(false);
        setCargando(false);
      })
      .catch((err) => {
        console.error("Error cargando usuarios:", err);
        if (!vigente) return;
        setError(true);
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [intento]);

  const visibles = resultados ?? usuarios;

  useEffect(() => {
    visibles.forEach((u) => {
      if (pedidos.current.has(u.uid)) return;
      pedidos.current.add(u.uid);
      getVinculosDeUsuario(u.uid)
        .then((v) => setVinculos((prev) => ({ ...prev, [u.uid]: v })))
        .catch((err) => {
          console.error("Error cargando vínculos:", err);
          setVinculos((prev) => ({ ...prev, [u.uid]: { clubes: [], organizadores: [], staff: [] } }));
        });
    });
  }, [visibles]);

  const reintentar = () => {
    setCargando(true);
    setError(false);
    setIntento((n) => n + 1);
  };

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const pagina = await getUsuariosPagina(cursor, TAMAÑO_PAGINA);
      setUsuarios((prev) => {
        const vistos = new Set(prev.map((u) => u.id));
        return [...prev, ...pagina.usuarios.filter((u) => !vistos.has(u.id))];
      });
      setCursor(pagina.cursor);
      setHayMas(pagina.hayMas);
    } catch (err) {
      console.error("Error cargando más usuarios:", err);
      toast.error("No se pudieron cargar más usuarios");
    } finally {
      setCargandoMas(false);
    }
  };

  const buscar = async (e) => {
    e.preventDefault();
    const valor = email.trim();
    if (!valor) {
      setResultados(null);
      return;
    }
    setBuscando(true);
    try {
      setResultados(await buscarUsuarioPorEmail(valor));
    } catch (err) {
      console.error("Error buscando por email:", err);
      toast.error("No se pudo buscar la cuenta");
    } finally {
      setBuscando(false);
    }
  };

  const verTodos = () => {
    setResultados(null);
    setEmail("");
  };

  const cerrarDialogo = useCallback(() => setEditando(null), []);

  const alGuardarRol = useCallback((uid, rol) => {
    const actualizar = (lista) => lista.map((u) => (u.uid === uid ? { ...u, role: [rol] } : u));
    setUsuarios(actualizar);
    setResultados((prev) => (prev ? actualizar(prev) : prev));
    setEditando(null);
  }, []);

  const botonRol = (u) => (
    <Button variant="ghost" size="sm" onClick={() => setEditando(u)}>
      Cambiar rol
    </Button>
  );

  const tabla = (lista) => (
    <div className="pd-table-wrap hidden md:block">
      <div className="overflow-x-auto">
        <table className="pd-table">
          <thead>
            <tr>
              <th scope="col">Cuenta</th>
              <th scope="col">Rol</th>
              <th scope="col">Ciudad</th>
              <th scope="col" className="num">
                Alta
              </th>
              <th scope="col">Vínculos</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="block font-semibold">{u.nombre || "Sin nombre"}</span>
                  <span className="block body-sm text-ink-2 break-all">{u.email || "—"}</span>
                </td>
                <td>{badgesRol(u)}</td>
                <td>{ubicacionCorta(u) || "—"}</td>
                <td className="num">{fechaAlta(u.createdAt)}</td>
                <td>{badgesVinculos(vinculos[u.uid])}</td>
                <td className="text-right">{botonRol(u)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const tarjetas = (lista) => (
    <ul className="flex flex-col gap-4 md:hidden">
      {lista.map((u) => (
        <li key={u.id}>
          <Card>
            <Card.Row className="items-start!">
              <div className="min-w-0">
                <h3 className="heading-sm m-0 break-words">{u.nombre || "Sin nombre"}</h3>
                <Card.Meta className="break-all">{u.email || "—"}</Card.Meta>
              </div>
              <span className="body-sm text-ink-3 pd-tnum shrink-0">{fechaAlta(u.createdAt)}</span>
            </Card.Row>
            <div className="mt-3 flex flex-col gap-2">
              {badgesRol(u)}
              {badgesVinculos(vinculos[u.uid])}
              {ubicacionCorta(u) && <p className="body-sm text-ink-2">{ubicacionCorta(u)}</p>}
            </div>
            <Card.Foot>{botonRol(u)}</Card.Foot>
          </Card>
        </li>
      ))}
    </ul>
  );

  const lista = (items) => (
    <>
      {tabla(items)}
      {tarjetas(items)}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="heading-lg">Usuarios</h1>
        <p className="pd-help mt-1">Para borrar una cuenta hace falta la consola de Firebase.</p>
      </header>

      <form onSubmit={buscar} className="flex flex-col gap-3 md:flex-row md:items-end" role="search">
        <Field label="Buscar por email" className="md:w-96">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@ejemplo.com"
            autoComplete="off"
          />
        </Field>
        <div className="pd-btn-group">
          <Button type="submit" cargando={buscando ? "Buscando…" : ""}>
            Buscar
          </Button>
          {resultados !== null && (
            <Button variant="ghost" onClick={verTodos}>
              Ver todos
            </Button>
          )}
        </div>
      </form>

      {resultados !== null ? (
        <section className="flex flex-col gap-4" aria-label="Resultados de la búsqueda">
          {resultados.length === 0 ? (
            <p className="body-md text-ink-2">No hay ninguna cuenta con ese email.</p>
          ) : (
            lista(resultados)
          )}
        </section>
      ) : cargando ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando usuarios">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="pd-skeleton h-16 rounded-md!" aria-hidden="true" />
          ))}
        </div>
      ) : error ? (
        <Alert tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>No pudimos cargar los usuarios.</span>
            <Button size="sm" onClick={reintentar}>
              Reintentar
            </Button>
          </div>
        </Alert>
      ) : usuarios.length === 0 ? (
        <p className="body-md text-ink-2">Todavía no hay cuentas con fecha de alta.</p>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Usuarios por fecha de alta">
          {lista(usuarios)}
          {hayMas && (
            <div>
              <Button onClick={cargarMas} cargando={cargandoMas ? "Cargando…" : ""}>
                Cargar más
              </Button>
            </div>
          )}
          <p className="pd-help">Las cuentas sin fecha de alta no aparecen en esta lista: buscalas por email.</p>
        </section>
      )}

      {editando && <DialogoRol key={editando.uid} usuario={editando} onCerrar={cerrarDialogo} onGuardado={alGuardarRol} />}
    </div>
  );
}
