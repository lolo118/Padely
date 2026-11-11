// tests/rules/firestore.rules.test.mjs — reglas de Firestore contra el emulador (P3-13).
// Correr: npm run test:rules (necesita Java para el emulador de Firestore; ver tests/rules/README.md).
// Cubre el modelo de dueños: club dueño vs staff, planes, cuentas, contactos y privados, super-admin, organizadores
// suspendidos, consumos de cuentas con pagos y los contadores de límites.
import { after, before, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch } from "firebase/firestore";

const PROYECTO = "demo-padely";
const CLUB = "clubLegacy";
const CLUB_FREE = "clubFree";
let env;

// Contexto autenticado: email verificado y proveedor de contraseña (como una cuenta real)
const como = (uid, extra = {}) => env.authenticatedContext(uid, { email: `${uid}@test.com`, email_verified: true, firebase: { sign_in_provider: "password" }, ...extra }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

async function sembrar() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ahora = Timestamp.now();
    await setDoc(doc(db, "clubs", CLUB), { nombre: "Club Legacy", ownerUid: "dueno", reservaDirecta: true });
    await setDoc(doc(db, "clubs", CLUB_FREE), { nombre: "Club Free", ownerUid: "duenoFree", reservaDirecta: true, plan: { tipo: "free", inicio: ahora, vence: null, historial: [] } });
    await setDoc(doc(db, "clubs", CLUB, "staff", "cajero"), { uid: "cajero", activo: true, rol: "cajero", permisos: ["vender", "cobrarTurnos", "abrirCaja"], descuentoMax: 0 });
    await setDoc(doc(db, "clubs", CLUB, "staff", "encargado"), { uid: "encargado", activo: true, rol: "encargado", permisos: ["vender", "cobrarTurnos", "anularVenta", "configurarClub", "abrirCaja"], descuentoMax: 100 });
    await setDoc(doc(db, "clubs", CLUB_FREE, "staff", "cajeroFree"), { uid: "cajeroFree", activo: true, rol: "cajero", permisos: ["vender", "cobrarTurnos", "abrirCaja"], descuentoMax: 0 });
    await setDoc(doc(db, "clubs", CLUB, "privado", "datos"), { cbu: "000", alias: "club.alias" });
    await setDoc(doc(db, "clubs", CLUB, "privado", "mercadopago"), { accessToken: "x" });
    await setDoc(doc(db, "clubs", CLUB, "reservas", "r1"), { jugadorUid: "jugador", status: "confirmada", fecha: "2026-10-27", grupoId: "r1" });
    await setDoc(doc(db, "clubs", CLUB, "contactosReservas", "r1"), { jugadorUid: "jugador", telefono: "385" });
    await setDoc(doc(db, "clubs", CLUB, "cuentas", "r1"), { estado: "abierta", jugadorUid: "jugador", participantesUids: ["jugador"], items: [{ lineaId: "a" }, { lineaId: "b" }], pagos: [{ ventaNumero: "D1-1", total: 100 }] });
    await setDoc(doc(db, "clubs", CLUB, "cuentas", "r2"), { estado: "abierta", jugadorUid: "otro", participantesUids: ["otro"], items: [{ lineaId: "a" }], pagos: [] });
    // Mesas: una mesa libre, una ocupada por una cuenta de mesa, y staff de la barra / de productos
    await setDoc(doc(db, "clubs", CLUB, "staff", "barra"), { uid: "barra", activo: true, rol: "barra", permisos: ["pedidos"], descuentoMax: 0 });
    await setDoc(doc(db, "clubs", CLUB, "staff", "repositor"), { uid: "repositor", activo: true, rol: "encargado", permisos: ["editarProductos"], descuentoMax: 0 });
    await setDoc(doc(db, "clubs", CLUB, "reservas", "r3"), { jugadorUid: "jugador", status: "confirmada", fecha: "2026-11-10", grupoId: "r3" });
    await setDoc(doc(db, "clubs", CLUB, "mesas", "m1"), { nombre: "Mesa 1", zona: "Salón", capacidad: 4, orden: 1, activa: true, cuentaAbiertaId: null });
    await setDoc(doc(db, "clubs", CLUB, "mesas", "m2"), { nombre: "Mesa 2", zona: null, capacidad: null, orden: 2, activa: true, cuentaAbiertaId: "mesa_abierta" });
    await setDoc(doc(db, "clubs", CLUB, "cuentas", "mesa_abierta"), { tipo: "mesa", estado: "abierta", reservaGrupoId: null, mesaId: "m2", mesaNombre: "Mesa 2", jugadorUid: null, participantesUids: [], cancha: { precioTotal: 0, seña: 0, señaPagada: false, cobrar: false }, items: [], pagos: [], ventas: [] });
    await setDoc(doc(db, "superadmins", "sa"), { creado: ahora });
    await setDoc(doc(db, "users", "org"), { uid: "org", role: ["organizador"] });
    await setDoc(doc(db, "organizers", "ent1"), { ownerUid: "org", suspendido: true });
    await setDoc(doc(db, "organizadoresPorUid", "org"), { orgId: "ent1" });
    await setDoc(doc(db, "tournaments", "t1"), { nombre: "T", organizerId: "org", club: null });
    await setDoc(doc(db, "users", "org2"), { uid: "org2", role: ["organizador"] });
    await setDoc(doc(db, "tournaments", "t2"), { nombre: "T2", organizerId: "org2", club: null });
  });
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROYECTO, firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await sembrar();
});
after(async () => {
  await env?.cleanup();
});

describe("privacidad", () => {
  test("un jugador lee su cuenta pero no la de otro", async () => {
    await assertSucceeds(getDoc(doc(como("jugador"), "clubs", CLUB, "cuentas", "r1")));
    await assertFails(getDoc(doc(como("jugador"), "clubs", CLUB, "cuentas", "r2")));
  });
  test("contactos de reservas: solo quien gestiona reservas", async () => {
    await assertSucceeds(getDoc(doc(como("dueno"), "clubs", CLUB, "contactosReservas", "r1")));
    await assertFails(getDoc(doc(como("jugador"), "clubs", CLUB, "contactosReservas", "r1")));
    await assertFails(getDoc(doc(como("cajero"), "clubs", CLUB, "contactosReservas", "r1")));
  });
  test("privado/datos: quien configura; privado/mercadopago: nadie", async () => {
    await assertSucceeds(getDoc(doc(como("encargado"), "clubs", CLUB, "privado", "datos")));
    await assertFails(getDoc(doc(como("cajero"), "clubs", CLUB, "privado", "datos")));
    await assertFails(getDoc(doc(como("dueno"), "clubs", CLUB, "privado", "mercadopago")));
  });
  test("superadmins: nadie lo escribe; cada uno lee el suyo", async () => {
    await assertFails(setDoc(doc(como("jugador"), "superadmins", "jugador"), { x: 1 }));
    await assertSucceeds(getDoc(doc(como("sa"), "superadmins", "sa")));
    await assertFails(getDoc(doc(como("jugador"), "superadmins", "sa")));
  });
});

describe("club: dueño, staff y plan", () => {
  test("el club no escribe su plan ni su mercadoPago; el super-admin solo el plan", async () => {
    await assertFails(updateDoc(doc(como("dueno"), "clubs", CLUB), { plan: { tipo: "pro" } }));
    await assertFails(updateDoc(doc(como("encargado"), "clubs", CLUB), { "mercadoPago.comisionPadelyPct": 0 }));
    await assertSucceeds(updateDoc(doc(como("dueno"), "clubs", CLUB), { nombre: "Otro nombre" }));
    await assertSucceeds(updateDoc(doc(como("sa"), "clubs", CLUB), { plan: { tipo: "free" } }));
    await assertFails(updateDoc(doc(como("sa"), "clubs", CLUB), { nombre: "x" }));
  });
  test("un club nuevo no trae plan", async () => {
    await assertFails(setDoc(doc(como("nuevo"), "clubs", "c9"), { ownerUid: "nuevo", nombre: "N", plan: { tipo: "pro" } }));
    await assertSucceeds(setDoc(doc(como("nuevo"), "clubs", "c9"), { ownerUid: "nuevo", nombre: "N" }));
  });
  const cajaNueva = (uid) => ({ estado: "abierta", abiertaPor: uid, fondoInicial: 0, totales: { efectivo: 0, transferencia: 0, tarjeta: 0, qr: 0, movimientos: 0 } });
  test("plan: el club legacy abre caja; el club FREE no", async () => {
    await assertSucceeds(setDoc(doc(como("cajero"), "clubs", CLUB, "cajas", "k1"), cajaNueva("cajero")));
    await assertFails(setDoc(doc(como("cajeroFree"), "clubs", CLUB_FREE, "cajas", "k1"), cajaNueva("cajeroFree")));
    await assertFails(setDoc(doc(como("duenoFree"), "clubs", CLUB_FREE, "cajas", "k2"), cajaNueva("duenoFree")));
  });
  test("plan: un club FREE no crea productos ni invita staff", async () => {
    await assertFails(setDoc(doc(como("duenoFree"), "clubs", CLUB_FREE, "productos", "p1"), { nombre: "Agua", stock: 0 }));
    await assertSucceeds(setDoc(doc(como("dueno"), "clubs", CLUB, "productos", "p1"), { nombre: "Agua", stock: 0 }));
    await assertFails(setDoc(doc(como("duenoFree"), "clubs", CLUB_FREE, "invitaciones", "i1"), { estado: "pendiente", rol: "cajero", email: "x@test.com" }));
  });
});

describe("cuenta con pagos", () => {
  test("el cajero suma consumos pero no saca; el encargado (anularVenta) sí", async () => {
    const ref = (db) => doc(db, "clubs", CLUB, "cuentas", "r1");
    await assertSucceeds(updateDoc(ref(como("cajero")), { items: [{ lineaId: "a" }, { lineaId: "b" }, { lineaId: "c" }] }));
    await assertFails(updateDoc(ref(como("cajero")), { items: [{ lineaId: "a" }] }));
    await assertSucceeds(updateDoc(ref(como("encargado")), { items: [{ lineaId: "a" }] }));
  });
  test("sin pagos, el cajero puede sacar consumos", async () => {
    await assertSucceeds(updateDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "r2"), { items: [] }));
  });
});

describe("organizadores suspendidos", () => {
  test("la entidad suspendida no edita ni crea torneos; otra sí", async () => {
    await assertFails(updateDoc(doc(como("org"), "tournaments", "t1"), { nombre: "Cambio" }));
    await assertFails(setDoc(doc(como("org"), "tournaments", "t3"), { nombre: "Nuevo", organizerId: "org", club: null }));
    await assertSucceeds(updateDoc(doc(como("org2"), "tournaments", "t2"), { nombre: "Cambio" }));
  });
  test("organizadoresPorUid y users.organizerId no los escribe el usuario", async () => {
    await assertFails(setDoc(doc(como("org"), "organizadoresPorUid", "org"), { orgId: "otra" }));
    await assertFails(updateDoc(doc(como("org"), "users", "org"), { organizerId: "otra" }));
  });
});

describe("límites de frecuencia", () => {
  const reservaJugador = (uid, id) => ({ jugadorUid: uid, status: "confirmada", fecha: "2026-11-01", hora: "10:00", canchaId: "c1", grupoId: id });
  test("la reserva de un jugador exige el contador en el mismo batch", async () => {
    const db = como("jugador");
    await assertFails(setDoc(doc(db, "clubs", CLUB, "reservas", "nueva1"), reservaJugador("jugador", "nueva1")));
    const b = writeBatch(db);
    b.set(doc(db, "users", "jugador", "limites", "reservas"), { ventanaInicio: serverTimestamp(), cuenta: 1, actualizadoEn: serverTimestamp() });
    b.set(doc(db, "clubs", CLUB, "reservas", "nueva2"), reservaJugador("jugador", "nueva2"));
    await assertSucceeds(b.commit());
  });
  test("el jugador no crea una reserva con la seña ya pagada (P3-15)", async () => {
    const db = como("jugador");
    const b = writeBatch(db);
    b.set(doc(db, "users", "jugador", "limites", "reservas"), { ventanaInicio: serverTimestamp(), cuenta: 1, actualizadoEn: serverTimestamp() });
    b.set(doc(db, "clubs", CLUB, "reservas", "nueva3"), { ...reservaJugador("jugador", "nueva3"), seña: 999999, señaPagada: true });
    await assertFails(b.commit());
  });
  test("el contador no pasa de 5 en la ventana ni se borra", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users", "jugador", "limites", "reservas"), { ventanaInicio: Timestamp.now(), cuenta: 5, actualizadoEn: Timestamp.now() }));
    const db = como("jugador");
    const actual = await getDoc(doc(db, "users", "jugador", "limites", "reservas"));
    await assertFails(setDoc(doc(db, "users", "jugador", "limites", "reservas"), { ventanaInicio: actual.data().ventanaInicio, cuenta: 6, actualizadoEn: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "users", "jugador", "limites", "reservas"), { ventanaInicio: serverTimestamp(), cuenta: 1, actualizadoEn: serverTimestamp() }), "ventana nueva antes de que venza");
    await assertFails(deleteDoc(doc(db, "users", "jugador", "limites", "reservas")));
  });
  test("el club que reserva a mano no necesita contador", async () => {
    await assertSucceeds(setDoc(doc(como("dueno"), "clubs", CLUB, "reservas", "manual1"), { ...reservaJugador(null, "manual1"), nombreJugador: "Pérez" }));
  });
});

describe("estado de la plataforma", () => {
  test("configuracionPadely/estado se lee sin sesión; la facturación no; escribe el super-admin", async () => {
    await assertSucceeds(getDoc(doc(anonimo(), "configuracionPadely", "estado")));
    await assertFails(getDoc(doc(anonimo(), "configuracionPadely", "facturacion")));
    await assertFails(setDoc(doc(como("dueno"), "configuracionPadely", "estado"), { activo: true, mensaje: "x" }));
    await assertSucceeds(setDoc(doc(como("sa"), "configuracionPadely", "estado"), { activo: true, mensaje: "x" }));
  });
});

describe("privacidad P3-14", () => {
  test("ticket público: con id aleatorio se lee; con número de ticket no", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "clubs", CLUB, "ticketsPublicos", "D1-000018"), { numero: "D1-000018" });
      await setDoc(doc(ctx.firestore(), "clubs", CLUB, "ticketsPublicos", "k3m9x2p7q4r8t6w5"), { numero: "D1-000019" });
    });
    await assertFails(getDoc(doc(anonimo(), "clubs", CLUB, "ticketsPublicos", "D1-000018")));
    await assertSucceeds(getDoc(doc(anonimo(), "clubs", CLUB, "ticketsPublicos", "k3m9x2p7q4r8t6w5")));
  });
  test("privado/plan y privado/mpCuenta: quien configura y el super-admin; mpCuenta no la escribe nadie", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "clubs", CLUB, "privado", "plan"), { historial: [] });
      await setDoc(doc(ctx.firestore(), "clubs", CLUB, "privado", "mpCuenta"), { nickname: "TESTUSER" });
    });
    await assertSucceeds(getDoc(doc(como("encargado"), "clubs", CLUB, "privado", "plan")));
    await assertSucceeds(getDoc(doc(como("sa"), "clubs", CLUB, "privado", "mpCuenta")));
    await assertFails(getDoc(doc(como("cajero"), "clubs", CLUB, "privado", "plan")));
    await assertFails(getDoc(doc(como("jugador"), "clubs", CLUB, "privado", "mpCuenta")));
    await assertFails(setDoc(doc(como("dueno"), "clubs", CLUB, "privado", "plan"), { historial: [] }));
    await assertSucceeds(setDoc(doc(como("sa"), "clubs", CLUB, "privado", "plan"), { historial: [] }));
    await assertFails(setDoc(doc(como("dueno"), "clubs", CLUB, "privado", "mpCuenta"), { nickname: "x" }));
  });
});

describe("inscripciones online P3-14", () => {
  test("una inscripción no nace pagada; los pagos de inscripción no los escribe nadie", async () => {
    const db = como("jugador");
    await assertFails(setDoc(doc(db, "tournaments", "t2", "inscripciones", "i1"), { jugador1Uid: "jugador", status: "esperando_companero", pago: { estado: "pagado" } }));
    await assertFails(setDoc(doc(db, "tournaments", "t2", "pagosInscripcion", "p1"), { estado: "aprobado" }));
    await assertFails(updateDoc(doc(como("org2"), "organizers", "ent1"), { "mercadoPago.conectado": true }));
  });
});

describe("partidos abiertos P3-15", () => {
  test("el índice público se lee sin sesión y no lo escribe nadie; flags se lee sin sesión", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "partidosAbiertos", "r1"), { clubId: CLUB, libres: 1 }));
    await assertSucceeds(getDoc(doc(anonimo(), "partidosAbiertos", "r1")));
    await assertFails(setDoc(doc(como("jugador"), "partidosAbiertos", "r2"), { clubId: CLUB, libres: 3 }));
    await assertSucceeds(getDoc(doc(anonimo(), "configuracionPadely", "flags")));
  });
});

describe("Pase Club (P3-16)", () => {
  const pase = { precio: 15000, meses: 1, visible: true, umbrales: { plata: 150, oro: 400 }, beneficios: { bronce: { descuentoBarPct: 5 }, plata: {}, oro: {} } };
  test("el Pase: lectura pública; solo planesSocio/pase y solo quien configura (PRO)", async () => {
    await assertSucceeds(setDoc(doc(como("encargado"), "clubs", CLUB, "planesSocio", "pase"), pase));
    await assertFails(setDoc(doc(como("encargado"), "clubs", CLUB, "planesSocio", "otro"), pase));
    await assertFails(setDoc(doc(como("cajero"), "clubs", CLUB, "planesSocio", "pase"), pase));
    await assertFails(setDoc(doc(como("duenoFree"), "clubs", CLUB_FREE, "planesSocio", "pase"), pase));
    await assertSucceeds(getDoc(doc(anonimo(), "clubs", CLUB, "planesSocio", "pase")));
  });
  test("socios: nadie los crea desde el cliente; el jugador solo se postula al equipo", async () => {
    await assertFails(setDoc(doc(como("jugador"), "clubs", CLUB, "socios", "jugador"), { uid: "jugador", estado: "activa" }));
    await assertFails(setDoc(doc(como("dueno"), "clubs", CLUB, "socios", "jugador"), { uid: "jugador", estado: "activa" }));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "clubs", CLUB, "socios", "jugador"), { uid: "jugador", estado: "activa", puntos: 10, nivel: "bronce", token: "abc", beneficios: { descuentoBarPct: 5 } }));
    const db = como("jugador");
    await assertFails(updateDoc(doc(db, "clubs", CLUB, "socios", "jugador"), { puntos: 999 }));
    await assertFails(updateDoc(doc(db, "clubs", CLUB, "socios", "jugador"), { "beneficios.descuentoBarPct": 100 }));
    await assertSucceeds(updateDoc(doc(db, "clubs", CLUB, "socios", "jugador"), { equipo: { quiere: true, categoria: "6ta", posicion: "drive", seleccionado: false } }));
    await assertFails(updateDoc(doc(db, "clubs", CLUB, "socios", "jugador"), { equipo: { quiere: true, categoria: "6ta", posicion: "drive", seleccionado: true } }));
    await assertSucceeds(updateDoc(doc(como("dueno"), "clubs", CLUB, "socios", "jugador"), { equipo: { quiere: true, categoria: "6ta", posicion: "drive", seleccionado: true } }));
    await assertFails(updateDoc(doc(como("dueno"), "clubs", CLUB, "socios", "jugador"), { estado: "cancelada" }));
    await assertSucceeds(getDoc(doc(como("cajero"), "clubs", CLUB, "socios", "jugador")));
    await assertFails(getDoc(doc(como("otro"), "clubs", CLUB, "socios", "jugador")));
    await assertSucceeds(getDoc(doc(anonimo(), "sociosPublicos", "abc")));
    await assertFails(getDoc(doc(como("dueno"), "comisionesPase", "p1")));
  });
});

describe("fichaje de empleados", () => {
  test("empleados, fichajes y auditoría: los lee quien gestiona el equipo; no los escribe ningún cliente", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "clubs", CLUB, "staff", "gestor"), { uid: "gestor", activo: true, rol: "encargado", permisos: ["gestionarStaff"], descuentoMax: 0 });
      await setDoc(doc(db, "clubs", CLUB, "empleados", "e1"), { nombre: "Juan", activo: true, staffUid: null, tienePin: true });
      await setDoc(doc(db, "clubs", CLUB, "fichajes", "f1"), { empleadoId: "e1", nombre: "Juan", entrada: Timestamp.now(), salida: null, origen: "pin" });
      await setDoc(doc(db, "clubs", CLUB, "fichajesAuditoria", "a1"), { fichajeId: "f1", accion: "editar", nota: "x" });
      await setDoc(doc(db, "clubs", CLUB, "privado", "fichaje"), { salt: "s", claveQr: "k", pines: { e1: "hash" } });
      await setDoc(doc(db, "clubs", CLUB, "fichajeIntentos", "cajero"), { fallos: [1] });
    });
    const ids = { empleados: "e1", fichajes: "f1", fichajesAuditoria: "a1" };
    for (const [col, id] of Object.entries(ids)) {
      await assertSucceeds(getDoc(doc(como("dueno"), "clubs", CLUB, col, id)));
      await assertSucceeds(getDoc(doc(como("gestor"), "clubs", CLUB, col, id)));
      await assertSucceeds(getDoc(doc(como("sa"), "clubs", CLUB, col, id)));
      await assertFails(getDoc(doc(como("cajero"), "clubs", CLUB, col, id)));
      await assertFails(getDoc(doc(como("jugador"), "clubs", CLUB, col, id)));
      await assertFails(setDoc(doc(como("dueno"), "clubs", CLUB, col, "nuevo"), { nombre: "x" }));
      await assertFails(deleteDoc(doc(como("dueno"), "clubs", CLUB, col, id)));
    }
    await assertFails(updateDoc(doc(como("dueno"), "clubs", CLUB, "fichajes", "f1"), { salida: Timestamp.now() }));
    // El hash de los PINs y los PINs equivocados: nadie, ni el dueño
    await assertFails(getDoc(doc(como("dueno"), "clubs", CLUB, "privado", "fichaje")));
    await assertFails(getDoc(doc(como("encargado"), "clubs", CLUB, "privado", "fichaje")));
    await assertFails(setDoc(doc(como("dueno"), "clubs", CLUB, "privado", "fichaje"), { salt: "mio" }));
    await assertFails(getDoc(doc(como("cajero"), "clubs", CLUB, "fichajeIntentos", "cajero")));
    await assertFails(deleteDoc(doc(como("cajero"), "clubs", CLUB, "fichajeIntentos", "cajero")));
  });
});

describe("Mesas", () => {
  const cuentaMesa = (uid, extra = {}) => ({
    tipo: "mesa",
    estado: "abierta",
    reservaGrupoId: null,
    mesaId: "m1",
    mesaNombre: "Mesa 1",
    canchaId: null,
    jugadorUid: null,
    participantes: [{ id: "titular", uid: null, nombre: "Mesa 1", tipo: "titular" }],
    participantesUids: [],
    cancha: { precioTotal: 0, seña: 0, señaPagada: false, cobrar: false },
    items: [],
    pagos: [],
    ventas: [],
    abiertaPor: uid,
    cerradaEn: null,
    ...extra,
  });
  test("configura quien edita productos; el cajero no; nadie nace con candado", async () => {
    await assertSucceeds(setDoc(doc(como("repositor"), "clubs", CLUB, "mesas", "m9"), { nombre: "Mesa 9", zona: "Patio", capacidad: 6, orden: 9, activa: true, cuentaAbiertaId: null }));
    await assertFails(setDoc(doc(como("cajero"), "clubs", CLUB, "mesas", "m8"), { nombre: "Mesa 8", cuentaAbiertaId: null }));
    await assertFails(setDoc(doc(como("repositor"), "clubs", CLUB, "mesas", "m7"), { nombre: "Mesa 7", cuentaAbiertaId: "mesa_x" }));
    await assertFails(setDoc(doc(como("duenoFree"), "clubs", CLUB_FREE, "mesas", "m1"), { nombre: "Mesa 1", cuentaAbiertaId: null }));
    await assertSucceeds(updateDoc(doc(como("repositor"), "clubs", CLUB, "mesas", "m1"), { nombre: "Ventana" }));
    await assertFails(updateDoc(doc(como("repositor"), "clubs", CLUB, "mesas", "m1"), { cuentaAbiertaId: "mesa_x" }));
    await assertFails(updateDoc(doc(como("cajero"), "clubs", CLUB, "mesas", "m1"), { nombre: "Otra" }));
    await assertSucceeds(updateDoc(doc(como("cajero"), "clubs", CLUB, "mesas", "m1"), { cuentaAbiertaId: "mesa_x" }));
    await assertFails(deleteDoc(doc(como("cajero"), "clubs", CLUB, "mesas", "m1")));
    await assertSucceeds(deleteDoc(doc(como("repositor"), "clubs", CLUB, "mesas", "m1")));
  });
  test("las mesas las lee el staff del bar y de la caja, no un jugador", async () => {
    await assertSucceeds(getDoc(doc(como("cajero"), "clubs", CLUB, "mesas", "m1")));
    await assertSucceeds(getDoc(doc(como("barra"), "clubs", CLUB, "mesas", "m1")));
    await assertFails(getDoc(doc(como("jugador"), "clubs", CLUB, "mesas", "m1")));
  });
  test("cuenta de mesa: la abre quien cobra o vende, sin reserva ni cancha ni jugador, en una mesa que existe", async () => {
    await assertSucceeds(setDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "mesa_n1"), cuentaMesa("cajero")));
    await assertFails(setDoc(doc(como("barra"), "clubs", CLUB, "cuentas", "mesa_n2"), cuentaMesa("barra")));
    await assertFails(setDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "mesa_n3"), cuentaMesa("cajero", { mesaId: "noExiste" })));
    await assertFails(setDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "mesa_n4"), cuentaMesa("cajero", { cancha: { precioTotal: 5000, seña: 0, señaPagada: false, cobrar: true } })));
    await assertFails(setDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "mesa_n5"), cuentaMesa("cajero", { jugadorUid: "jugador", participantesUids: ["jugador"] })));
    await assertFails(setDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "otraCosa"), cuentaMesa("cajero")));
    await assertFails(setDoc(doc(como("cajeroFree"), "clubs", CLUB_FREE, "cuentas", "mesa_n6"), cuentaMesa("cajeroFree")));
    // Una cuenta del turno (reserva r3 confirmada) no puede nacer con tipo "mesa"; como turno, sí (y con mesa)
    await assertFails(setDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "r3"), cuentaMesa("cajero", { reservaGrupoId: "r3" })));
    await assertSucceeds(setDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "r3"), cuentaMesa("cajero", { tipo: "turno", reservaGrupoId: "r3", jugadorUid: "jugador", participantesUids: ["jugador"] })));
  });
  test("mover de mesa: quien cobra cambia mesaId; una cuenta de mesa no queda sin mesa ni toca la cancha", async () => {
    const ref = (db) => doc(db, "clubs", CLUB, "cuentas", "mesa_abierta");
    await assertSucceeds(updateDoc(ref(como("cajero")), { mesaId: "m1", mesaNombre: "Mesa 1", mesaZona: "Salón" }));
    await assertFails(updateDoc(ref(como("cajero")), { mesaId: null, mesaNombre: null }));
    await assertFails(updateDoc(ref(como("cajero")), { cancha: { precioTotal: 9000, seña: 0, señaPagada: false, cobrar: true } }));
    await assertFails(updateDoc(ref(como("barra")), { mesaId: "m1" }));
    // La cuenta del turno r2 puede ir a una mesa y salir de ella
    await assertSucceeds(updateDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "r2"), { mesaId: "m1", mesaNombre: "Mesa 1", mesaZona: null }));
    await assertSucceeds(updateDoc(doc(como("cajero"), "clubs", CLUB, "cuentas", "r2"), { mesaId: null, mesaNombre: null, mesaZona: null }));
  });
  test("una cuenta de mesa anulada no se reabre; se cierra cobrándola o se anula como cualquier cuenta", async () => {
    const ref = (db) => doc(db, "clubs", CLUB, "cuentas", "mesa_abierta");
    await assertSucceeds(updateDoc(ref(como("encargado")), { estado: "anulada", cerradaPor: "encargado", cerradaEn: serverTimestamp(), anulacion: { por: "encargado", motivo: "se fueron" } }));
    await assertFails(updateDoc(ref(como("cajero")), { estado: "abierta", abiertaPor: "cajero", ventas: [], cerradaEn: null, items: [] }));
  });
});

describe("mini torneo de un turno", () => {
  const FUTURA = "2099-01-01";
  const sesionAnonima = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
  const jugadoresMini = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `j${i}`, nombre: `J${i}` }));
  const mini = (creadorUid, extra = {}) => ({
    clubId: CLUB, clubNombre: "Club Legacy", canchaNombre: "Cancha 1", fecha: FUTURA, horaInicio: "20:00", horaFin: "21:30", reservaGrupoId: "rm1",
    creadorUid, creadorNombre: "Jugador", editoresUids: [], edicionAbierta: false, nombre: "Mini", modo: "auto", formato: "americanoParejas",
    partidoA: { tipo: "games", valor: 4 }, canchas: 1, jugadores: jugadoresMini, parejas: [], grupos: [], partidos: [], descansos: [], llave: null,
    rondas: 3, estimacionMin: 80, minutosTurno: 90, motivo: "", estado: "en_curso", ...extra,
  });
  const ref = (db, id = "m1") => doc(db, "clubs", CLUB, "miniTorneos", id);
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "clubs", CLUB, "reservas", "rm1"), { jugadorUid: "jugador", status: "confirmada", fecha: FUTURA, grupoId: "rm1" });
      await setDoc(doc(db, "clubs", CLUB, "cuentas", "rm1"), { estado: "abierta", jugadorUid: "jugador", participantesUids: ["jugador", "amigo"], items: [], pagos: [] });
      await setDoc(doc(db, "clubs", CLUB, "reservas", "rmCancelada"), { jugadorUid: "jugador", status: "cancelada", fecha: FUTURA, grupoId: "rmCancelada" });
      await setDoc(doc(db, "clubs", CLUB, "reservas", "rmPasada"), { jugadorUid: "jugador", status: "confirmada", fecha: "2020-01-01", grupoId: "rmPasada" });
      await setDoc(ref(db), mini("jugador", { editoresUids: ["amigo"] }));
      await setDoc(doc(db, "clubs", CLUB, "miniTorneos", "m1", "privado", "edicion"), { clave: "clave-secreta-de-prueba" });
    });
  });

  test("lo crea quien reservó o un participante de la cuenta; nadie más", async () => {
    await assertSucceeds(setDoc(ref(como("jugador"), "m2"), mini("jugador")));
    await assertSucceeds(setDoc(ref(como("amigo"), "m3"), mini("amigo")));
    await assertFails(setDoc(ref(como("otro"), "m4"), mini("otro")));
    await assertFails(setDoc(ref(como("otro"), "m5"), mini("jugador")));
    await assertFails(setDoc(ref(sesionAnonima("anon"), "m6"), mini("anon")));
  });
  test("parejas fijas: número par desde 6 jugadores, formatos nuevos y 3° puesto; el americano rotativo ya no se crea", async () => {
    await assertFails(setDoc(ref(como("jugador"), "n1"), mini("jugador", { jugadores: jugadoresMini.slice(0, 4) })));
    await assertFails(setDoc(ref(como("jugador"), "n2"), mini("jugador", { jugadores: jugadoresMini.slice(0, 5) })));
    await assertFails(setDoc(ref(como("jugador"), "n3"), mini("jugador", { formato: "americano" })));
    await assertFails(setDoc(ref(como("jugador"), "n4"), mini("jugador", { formato: "mexicano" })));
    await assertFails(setDoc(ref(como("jugador"), "n5"), mini("jugador", { formato: "eliminacion", tercerPuesto: "si" })));
    for (const formato of ["americanoParejas", "roundRobin", "grupos", "eliminacion", "rey"]) {
      await assertSucceeds(setDoc(ref(como("jugador"), `f-${formato}`), mini("jugador", { formato })));
    }
    await assertSucceeds(setDoc(ref(como("jugador"), "n6"), mini("jugador", { formato: "eliminacion", tercerPuesto: true })));
  });
  test("los mini torneos viejos (americano rotativo de 4) se siguen cargando", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(ref(ctx.firestore(), "viejo"), mini("jugador", { formato: "americano", jugadores: jugadoresMini.slice(0, 4), editoresUids: ["amigo"] }));
    });
    await assertSucceeds(updateDoc(ref(como("amigo"), "viejo"), { partidos: [{ id: "a1-1", resultado: { sets: [{ g1: 4, g2: 2 }] } }], estado: "en_curso" }));
    await assertSucceeds(updateDoc(ref(como("jugador"), "viejo"), { nombre: "Renombrado" }));
  });
  test("solo reservas confirmadas y vigentes, 6 a 16 jugadores, sin campos de más", async () => {
    await assertFails(setDoc(ref(como("jugador"), "m2"), mini("jugador", { reservaGrupoId: "rmCancelada" })));
    await assertFails(setDoc(ref(como("jugador"), "m3"), mini("jugador", { reservaGrupoId: "rmPasada", fecha: "2020-01-01" })));
    await assertFails(setDoc(ref(como("jugador"), "m4"), mini("jugador", { fecha: "2099-01-02" })));
    await assertFails(setDoc(ref(como("jugador"), "m5"), mini("jugador", { jugadores: jugadoresMini.slice(0, 3) })));
    await assertFails(setDoc(ref(como("jugador"), "m8"), mini("jugador", { jugadores: [...jugadoresMini, ...jugadoresMini, ...jugadoresMini] })));
    await assertFails(setDoc(ref(como("jugador"), "m6"), mini("jugador", { email: "x@test.com" })));
    await assertFails(setDoc(ref(como("jugador"), "m7"), mini("jugador", { estado: "finalizado" })));
  });
  test("lectura pública (el link de WhatsApp), sin sesión", async () => {
    await assertSucceeds(getDoc(ref(anonimo())));
  });
  test("el creador edita todo menos el dueño y la reserva; editoresUids solo resultados; otro nada", async () => {
    await assertSucceeds(updateDoc(ref(como("jugador")), { nombre: "Otro nombre", edicionAbierta: true }));
    await assertFails(updateDoc(ref(como("jugador")), { creadorUid: "otro" }));
    await assertFails(updateDoc(ref(como("jugador")), { reservaGrupoId: "rmPasada" }));
    await assertSucceeds(updateDoc(ref(como("amigo")), { partidos: [{ id: "a1-1", resultado: { sets: [{ g1: 4, g2: 2 }] } }], estado: "en_curso" }));
    await assertFails(updateDoc(ref(como("amigo")), { nombre: "Cambio" }));
    await assertFails(updateDoc(ref(como("otro")), { partidos: [] }));
    await assertFails(deleteDoc(ref(como("amigo"))));
    await assertSucceeds(deleteDoc(ref(como("jugador"))));
  });
  test("link de carga: con la carga abierta y la clave correcta, cualquiera (aun anónimo) carga resultados", async () => {
    const editor = (uid, db) => doc(db, "clubs", CLUB, "miniTorneos", "m1", "editores", uid);
    // Carga cerrada: la clave no alcanza
    await assertFails(setDoc(editor("anon", sesionAnonima("anon")), { clave: "clave-secreta-de-prueba" }));
    await assertSucceeds(updateDoc(ref(como("jugador")), { edicionAbierta: true }));
    await assertFails(setDoc(editor("anon", sesionAnonima("anon")), { clave: "otra" }));
    await assertFails(setDoc(editor("otro", sesionAnonima("anon")), { clave: "clave-secreta-de-prueba" }));
    await assertFails(updateDoc(ref(sesionAnonima("anon")), { partidos: [] }));
    await assertSucceeds(setDoc(editor("anon", sesionAnonima("anon")), { clave: "clave-secreta-de-prueba" }));
    await assertSucceeds(updateDoc(ref(sesionAnonima("anon")), { partidos: [], estado: "en_curso" }));
    await assertFails(updateDoc(ref(sesionAnonima("anon")), { edicionAbierta: false }));
    // Cerrar la carga deja afuera a quienes entraron con el link
    await assertSucceeds(updateDoc(ref(como("jugador")), { edicionAbierta: false }));
    await assertFails(updateDoc(ref(sesionAnonima("anon")), { partidos: [] }));
  });
  test("la clave de carga la lee solo quien lo creó", async () => {
    const clave = (db) => doc(db, "clubs", CLUB, "miniTorneos", "m1", "privado", "edicion");
    await assertSucceeds(getDoc(clave(como("jugador"))));
    await assertFails(getDoc(clave(como("amigo"))));
    await assertFails(getDoc(clave(anonimo())));
  });
});

// ----- Profes (flags.profes) -----
describe("profes", () => {
  const perfil = (uid, extra = {}) => ({ uid, nombre: "Caro Profe", bio: "Clases para todos", clases: [{ tipo: "individual", activa: true, precio: 15000, duracion: 60, capacidad: 1 }], mostrarWhatsapp: false, whatsapp: "", activo: true, ...extra });
  const vinculo = (uid, extra = {}) => ({ uid, nombre: "Caro Profe", estado: "pendiente", origen: "profe", cobra: "profe", bloqueaCancha: true, canchas: [], tarifas: {}, ...extra });
  const sembrarProfes = () =>
    env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "profes", "profe"), { ...perfil("profe"), clubIds: [CLUB], clubes: { [CLUB]: { estado: "activo" } }, elogios: { total: 1, tags: { divertido: 1 } } });
      await setDoc(doc(db, "profes", "profe2"), perfil("profe2"));
      await setDoc(doc(db, "clubs", CLUB, "profes", "profe"), vinculo("profe", { estado: "activo" }));
      await setDoc(doc(db, "clubs", CLUB, "profes", "invitada"), vinculo("invitada", { estado: "invitado", origen: "club" }));
      await setDoc(doc(db, "profes", "invitada"), perfil("invitada"));
      await setDoc(doc(db, "clases", "profe_2026-11-16_1800"), { profeUid: "profe", clubId: CLUB, fecha: "2026-11-16", alumnosUids: ["jugador"], uidsHistorial: ["jugador", "seFue"], estado: "confirmada" });
      await setDoc(doc(db, "profesOcupacion", "profe_2026-11-16_1800"), { profeUid: "profe", claseId: "profe_2026-11-16_1800", fecha: "2026-11-16", hora: "18:00" });
      await setDoc(doc(db, "reportesProfes", "x_jugador"), { clubId: CLUB, uid: "jugador", texto: "algo pasó" });
      await setDoc(doc(db, "clubs", CLUB, "reservas", "c1_2026-11-16_1800"), { canchaId: "c1", fecha: "2026-11-16", hora: "18:00", status: "confirmada", tipo: "clase", claseId: "profe_2026-11-16_1800", jugadorUid: null });
    });
  beforeEach(sembrarProfes);

  test("perfil: público; lo crea y edita solo el propio profe con cuenta real, sin tocar lo de las Functions", async () => {
    await assertSucceeds(getDoc(doc(anonimo(), "profes", "profe")));
    await assertSucceeds(setDoc(doc(como("nuevo"), "profes", "nuevo"), perfil("nuevo")));
    await assertFails(setDoc(doc(como("otro"), "profes", "nuevo2"), perfil("nuevo2")));
    await assertFails(setDoc(doc(como("nuevo3"), "profes", "nuevo3"), { ...perfil("nuevo3"), elogios: { total: 99 } }));
    await assertFails(setDoc(doc(como("nuevo4"), "profes", "nuevo4"), { ...perfil("nuevo4"), clubIds: [CLUB] }));
    const anon = env.authenticatedContext("anon", { firebase: { sign_in_provider: "anonymous" } }).firestore();
    await assertFails(setDoc(doc(anon, "profes", "anon"), perfil("anon")));
    await assertSucceeds(updateDoc(doc(como("profe"), "profes", "profe"), { bio: "Nueva bio" }));
    await assertFails(updateDoc(doc(como("profe"), "profes", "profe"), { "elogios.total": 50 }));
    await assertFails(updateDoc(doc(como("profe"), "profes", "profe"), { clubIds: ["otroClub"] }));
    await assertFails(updateDoc(doc(como("jugador"), "profes", "profe"), { bio: "hackeo" }));
    await assertFails(deleteDoc(doc(como("profe"), "profes", "profe")));
  });
  test("perfil: el WhatsApp solo se guarda si el profe eligió mostrarlo", async () => {
    await assertFails(updateDoc(doc(como("profe"), "profes", "profe"), { whatsapp: "5493854123456" }));
    await assertSucceeds(updateDoc(doc(como("profe"), "profes", "profe"), { mostrarWhatsapp: true, whatsapp: "5493854123456" }));
  });
  test("disponibilidad pública; la escribe solo el profe. Elogios públicos, nadie los escribe", async () => {
    await assertSucceeds(getDoc(doc(anonimo(), "profes", "profe", "disponibilidad", CLUB)));
    await assertSucceeds(setDoc(doc(como("profe"), "profes", "profe", "disponibilidad", CLUB), { semanal: {}, excepciones: [] }));
    await assertFails(setDoc(doc(como("jugador"), "profes", "profe", "disponibilidad", CLUB), { semanal: {} }));
    await assertSucceeds(getDoc(doc(anonimo(), "profes", "profe", "elogios", "e1")));
    await assertFails(setDoc(doc(como("jugador"), "profes", "profe", "elogios", "e1"), { tags: ["divertido"] }));
    await assertFails(setDoc(doc(como("profe"), "profes", "profe", "elogios", "e1"), { tags: ["divertido"] }));
  });
  test("vínculo: el profe pide sumarse (pendiente, cobra el profe); no se aprueba solo", async () => {
    await assertSucceeds(setDoc(doc(como("profe2"), "clubs", CLUB, "profes", "profe2"), vinculo("profe2")));
    await assertFails(setDoc(doc(como("sinPerfil"), "clubs", CLUB, "profes", "sinPerfil"), vinculo("sinPerfil")));
    await assertFails(setDoc(doc(como("profe2"), "clubs", CLUB_FREE, "profes", "profe2"), vinculo("profe2", { estado: "activo" })));
    await assertFails(setDoc(doc(como("profe2"), "clubs", CLUB_FREE, "profes", "profe2"), vinculo("profe2", { cobra: "club" })));
    await assertFails(setDoc(doc(como("jugador"), "clubs", CLUB, "profes", "profe2"), vinculo("profe2")));
    await assertSucceeds(getDoc(doc(anonimo(), "clubs", CLUB, "profes", "profe")));
  });
  test("vínculo: el club (configurarClub) aprueba y configura; el cajero no; el profe acepta la invitación o se da de baja", async () => {
    await assertSucceeds(updateDoc(doc(como("dueno"), "clubs", CLUB, "profes", "profe"), { cobra: "club", bloqueaCancha: false, tarifas: { individual: 20000 } }));
    await assertSucceeds(updateDoc(doc(como("encargado"), "clubs", CLUB, "profes", "profe"), { estado: "baja" }));
    await assertFails(updateDoc(doc(como("cajero"), "clubs", CLUB, "profes", "invitada"), { estado: "activo" }));
    await assertFails(updateDoc(doc(como("dueno"), "clubs", CLUB, "profes", "invitada"), { estado: "jefe" }));
    await assertFails(updateDoc(doc(como("profe"), "clubs", CLUB, "profes", "invitada"), { estado: "activo" }));
    await assertSucceeds(updateDoc(doc(como("invitada"), "clubs", CLUB, "profes", "invitada"), { estado: "activo" }));
    await assertFails(updateDoc(doc(como("invitada"), "clubs", CLUB, "profes", "invitada"), { cobra: "club" }));
    await assertSucceeds(updateDoc(doc(como("invitada"), "clubs", CLUB, "profes", "invitada"), { estado: "baja" }));
  });
  test("clases: las leen el profe, sus alumnos (también los que cancelaron), el club y el super-admin; nadie las escribe", async () => {
    const clase = (db) => doc(db, "clases", "profe_2026-11-16_1800");
    await assertSucceeds(getDoc(clase(como("profe"))));
    await assertSucceeds(getDoc(clase(como("jugador"))));
    await assertSucceeds(getDoc(clase(como("seFue"))));
    await assertSucceeds(getDoc(clase(como("encargado"))));
    await assertSucceeds(getDoc(clase(como("sa"))));
    await assertFails(getDoc(clase(como("otro"))));
    await assertFails(getDoc(clase(como("cajero"))));
    await assertFails(getDoc(clase(anonimo())));
    await assertFails(updateDoc(clase(como("profe")), { estado: "dada" }));
    await assertFails(setDoc(doc(como("jugador"), "clases", "nueva"), { profeUid: "profe", alumnosUids: ["jugador"] }));
  });
  test("ocupación del profe pública y solo de las Functions; reportes y comisiones privados", async () => {
    await assertSucceeds(getDoc(doc(anonimo(), "profesOcupacion", "profe_2026-11-16_1800")));
    await assertFails(setDoc(doc(como("profe"), "profesOcupacion", "profe_2026-11-16_1900"), { profeUid: "profe" }));
    await assertSucceeds(getDoc(doc(como("dueno"), "reportesProfes", "x_jugador")));
    await assertSucceeds(getDoc(doc(como("sa"), "reportesProfes", "x_jugador")));
    await assertFails(getDoc(doc(como("profe"), "reportesProfes", "x_jugador")));
    await assertFails(getDoc(doc(como("encargado"), "reportesProfes", "x_jugador")));
    await assertFails(setDoc(doc(como("jugador"), "reportesProfes", "y_jugador"), { clubId: CLUB }));
    await assertFails(getDoc(doc(como("dueno"), "comisionesClases", "p1")));
  });
  test("la reserva de cancha de una clase (tipo clase) es de las Functions: ni el club ni un jugador la tocan", async () => {
    const slot = (db) => doc(db, "clubs", CLUB, "reservas", "c1_2026-11-16_1800");
    await assertFails(updateDoc(slot(como("dueno")), { status: "cancelada" }));
    await assertFails(deleteDoc(slot(como("dueno"))));
    await assertFails(setDoc(doc(como("dueno"), "clubs", CLUB, "reservas", "c1_2026-11-16_1900"), { canchaId: "c1", fecha: "2026-11-16", hora: "19:00", status: "confirmada", tipo: "clase", jugadorUid: null }));
    await assertSucceeds(getDoc(slot(como("jugador"))));
  });
});
