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
