// scripts/seed-accounts.mjs — creates or completes the five test accounts. Run: npm run seed:accounts
// Password comes from SEED_PASSWORD (default "Padely2026!"). Never commit a password.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDocs, addDoc, collection, query, where, serverTimestamp } from "firebase/firestore";

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
];

async function ensureUser(email) {
  try { return (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user; }
  catch (e) {
    if (e.code !== "auth/email-already-in-use") throw e;
    return (await signInWithEmailAndPassword(auth, email, PASSWORD)).user;
  }
}

for (const c of cuentas) {
  const user = await ensureUser(c.email);
  await setDoc(doc(db, "users", user.uid), { uid: user.uid, nombre: c.nombre, email: c.email, role: [c.tipo], createdAt: new Date(), ...(c.perfil || {}) }, { merge: true });
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
process.exit(0);
