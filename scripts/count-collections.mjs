// scripts/count-collections.mjs — READ-ONLY: prints how many docs each root collection has.
// users y organizers solo los lee su dueño: se entra con las tres cuentas de prueba y se cuenta lo propio.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, getDocs, getDoc, doc, collection, query, where } from "firebase/firestore";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
const auth = getAuth(app);
const PASSWORD = process.env.SEED_PASSWORD || "Padely2026!";
const CUENTAS = ["jugador@test.com", "club@test.com", "org@test.com"];

console.log(`Proyecto: ${env.VITE_FIREBASE_PROJECT_ID}`);
const usuarios = [];
const organizadores = [];
for (const email of CUENTAS) {
  const { user } = await signInWithEmailAndPassword(auth, email, PASSWORD);
  const propio = await getDoc(doc(db, "users", user.uid));
  if (propio.exists()) usuarios.push(propio.data().email || user.uid);
  const orgs = await getDocs(query(collection(db, "organizers"), where("ownerUid", "==", user.uid)));
  orgs.docs.forEach((d) => organizadores.push(d.data().nombre || d.id));
  await signOut(auth);
}
console.log(`${"users".padEnd(12)} ${String(usuarios.length).padStart(3)}   ${usuarios.join(", ")}   (solo los propios de las 3 cuentas)`);
console.log(`${"organizers".padEnd(12)} ${String(organizadores.length).padStart(3)}   ${organizadores.join(", ")}   (solo los de las 3 cuentas)`);
await signInWithEmailAndPassword(auth, "jugador@test.com", PASSWORD);
for (const name of ["clubs", "tournaments"]) {
  const snap = await getDocs(collection(db, name));
  const detalle = snap.docs.map((d) => d.data().nombre || d.id).join(", ");
  console.log(`${name.padEnd(12)} ${String(snap.size).padStart(3)}   ${detalle}`);
}
process.exit(0);
