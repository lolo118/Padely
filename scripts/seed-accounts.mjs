// scripts/seed-accounts.mjs — creates or completes the seven test accounts. Run: npm run seed:accounts
// Password comes from SEED_PASSWORD (default "Padely2026!"). Never commit a password.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, getDocs, addDoc, collection, query, where, serverTimestamp, writeBatch, Timestamp,
} from "firebase/firestore";
import { INVITACION_DIAS, descuentoMaxDeRol, permisosDeRol } from "../src/utils/staff.js";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);
const PASSWORD = process.env.SEED_PASSWORD || "Padely2026!";

const cuentas = [
  { email: "jugador@test.com", tipo: "jugador", nombre: "Jugador Test",
    perfil: { telefono: "3851111111", ciudad: "Santiago del Estero", provincia: "Santiago del Estero", nacimiento: "1995-05-10", genero: "masculino", nivel: "7ma", manoHabil: "derecha", posicionPreferida: "reves" } },
  { email: "club@test.com", tipo: "club", nombre: "Club Test",
    entidad: { nombre: "Club Padely Central", direccion: "Av. Belgrano 500", ciudad: "Santiago del Estero", provincia: "Santiago del Estero", telefono: "3852222222", reservaDirecta: true, diasAnticipacion: 7 } },
  { email: "org@test.com", tipo: "organizador", nombre: "Organizador Test",
    entidad: { nombre: "Padely Torneos", telefono: "3853333333", whatsapp: "5493853333333", bio: "Organizador de torneos de prueba", ciudad: "Santiago del Estero", provincia: "Santiago del Estero" } },
  // Jugador que el club invita a su equipo (PROMPT 11): sin perfil de club, entra al panel por clubs/{c}/staff/{uid}
  { email: "encargado@test.com", tipo: "jugador", nombre: "Encargado Test" },
  // Super-admin de prueba (PROMPT 12): cuenta de jugador; superadmins/{uid} se crea a mano en la consola
  { email: "admin@test.com", tipo: "jugador", nombre: "Admin Test" },
  // Cajero del bar (P3-3): jugador que entra al club como staff "cajero" (ver más abajo: invitación + aceptación)
  { email: "cajero@test.com", tipo: "jugador", nombre: "Cajero Test", staffDe: { club: "club@test.com", rol: "cajero" } },
  // Barra (P3-6): solo la pantalla Barra (pedidos)
  { email: "barra@test.com", tipo: "jugador", nombre: "Barra Test", staffDe: { club: "club@test.com", rol: "barra" } },
];

async function ensureUser(email) {
  try { return (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user; }
  catch (e) {
    if (e.code !== "auth/email-already-in-use") throw e;
    return (await signInWithEmailAndPassword(auth, email, PASSWORD)).user;
  }
}

const uids = {};
for (const c of cuentas) {
  const user = await ensureUser(c.email);
  uids[c.email] = user.uid;
  // La fecha de alta se pone solo la primera vez (volver a correr el seed no la pisa)
  const userRef = doc(db, "users", user.uid);
  const existe = (await getDoc(userRef)).exists();
  await setDoc(userRef, { uid: user.uid, nombre: c.nombre, email: c.email, role: [c.tipo], ...(existe ? {} : { createdAt: new Date() }), ...(c.perfil || {}) }, { merge: true });
  if (c.tipo === "club") {
    const snap = await getDocs(query(collection(db, "clubs"), where("ownerUid", "==", user.uid)));
    if (snap.empty) await addDoc(collection(db, "clubs"), { ownerUid: user.uid, logo: "", createdAt: serverTimestamp(), ...c.entidad });
  }
  if (c.tipo === "organizador") {
    const snap = await getDocs(query(collection(db, "organizers"), where("ownerUid", "==", user.uid)));
    if (snap.empty) await addDoc(collection(db, "organizers"), { ownerUid: user.uid, email: c.email, logo: "", status: "activo", createdAt: serverTimestamp(), ...c.entidad });
  }
  console.log(`${c.tipo.padEnd(12)} ${c.email}  uid=${user.uid}`);
  await signOut(auth);
}

// Staff del club: las reglas solo dejan que el propio invitado cree su documento aceptando una invitación pendiente,
// así que el seed hace lo mismo que la app: el dueño crea la invitación y el invitado la acepta (idempotente).
for (const c of cuentas.filter((x) => x.staffDe)) {
  const dueño = await signInWithEmailAndPassword(auth, c.staffDe.club, PASSWORD);
  const clubSnap = await getDocs(query(collection(db, "clubs"), where("ownerUid", "==", dueño.user.uid)));
  if (clubSnap.empty) { console.log(`staff        ${c.email}: el club de ${c.staffDe.club} no existe, se omite`); await signOut(auth); continue; }
  const clubId = clubSnap.docs[0].id;
  const staffRef = doc(db, "clubs", clubId, "staff", uids[c.email]);
  if ((await getDoc(staffRef)).exists()) {
    console.log(`staff        ${c.email}: ya es ${c.staffDe.rol} de ${clubId}`);
    await signOut(auth);
    continue;
  }
  const invRef = await addDoc(collection(db, "clubs", clubId, "invitaciones"), {
    email: c.email, nombre: c.nombre, rol: c.staffDe.rol, permisos: permisosDeRol(c.staffDe.rol), descuentoMax: descuentoMaxDeRol(c.staffDe.rol),
    estado: "pendiente", creadoPor: dueño.user.uid, creadoEn: serverTimestamp(),
    vence: Timestamp.fromMillis(Date.now() + INVITACION_DIAS * 24 * 60 * 60 * 1000),
  });
  await signOut(auth);

  const invitado = await signInWithEmailAndPassword(auth, c.email, PASSWORD);
  const batch = writeBatch(db);
  batch.set(staffRef, {
    uid: invitado.user.uid, nombre: c.nombre, email: c.email, rol: c.staffDe.rol,
    permisos: permisosDeRol(c.staffDe.rol), descuentoMax: descuentoMaxDeRol(c.staffDe.rol), activo: true,
    invitacionId: invRef.id, invitadoPor: dueño.user.uid, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(),
  });
  batch.update(invRef, { estado: "aceptada", uid: invitado.user.uid, aceptadaEn: serverTimestamp() });
  await batch.commit();
  console.log(`staff        ${c.email}: ${c.staffDe.rol} de ${clubId} (descuento máx. ${descuentoMaxDeRol(c.staffDe.rol)} %)  uid=${invitado.user.uid}`);
  await signOut(auth);
}
process.exit(0);
