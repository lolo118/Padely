// scripts/list-orphans.mjs — lists Firestore data left behind by deleted/junk accounts. READ-ONLY: it never deletes.
// Run: node scripts/list-orphans.mjs <uid> [<uid> ...] [--extra <path> ...] [--reservas-club "<club name>" --fecha YYYY-MM-DD]
// Signs in as jugador@test.com (password from SEED_PASSWORD, default "Padely2026!") because the rules require a signed-in user.
import { readFileSync, writeFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, getDocs, collection, collectionGroup, query, where } from "firebase/firestore";

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

// ---- args ----
const args = process.argv.slice(2);
const uids = [], extras = [];
let reservasClub = null, fecha = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--extra") extras.push(args[++i]);
  else if (args[i] === "--reservas-club") reservasClub = args[++i];
  else if (args[i] === "--fecha") fecha = args[++i];
  else uids.push(args[i]);
}
if (uids.length === 0) { console.error("usage: node scripts/list-orphans.mjs <uid> [...]"); process.exit(1); }

await signInWithEmailAndPassword(getAuth(app), "jugador@test.com", process.env.SEED_PASSWORD || "Padely2026!");

const out = [];           // lines for the report
const toDelete = [];      // { path, why }
const references = [];    // data in KEPT docs that mentions an old uid (not deleted, only reported)
const log = (s = "") => { out.push(s); console.log(s); };
const chunks = (arr, n = 30) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
const whereIn = async (col, field) => {
  const res = [];
  for (const c of chunks(uids)) for (const d of (await getDocs(query(col, where(field, "in", c)))).docs) res.push(d);
  return res;
};
const subCounts = async (ref, names) => {
  const parts = [];
  for (const n of names) { const s = await getDocs(collection(ref, n)); if (s.size) parts.push(`${s.size} ${n}`); }
  return parts.length ? ` (+ ${parts.join(", ")})` : "";
};

log(`Proyecto: ${env.VITE_FIREBASE_PROJECT_ID}  —  ${uids.length} UIDs viejos`);
log("");

// 1) users/{uid}
log("USERS");
for (const uid of uids) {
  const s = await getDoc(doc(db, "users", uid));
  if (s.exists()) { const d = s.data(); toDelete.push({ path: `users/${uid}`, why: `${d.email || "?"} · ${d.nombre || "?"} · role=${JSON.stringify(d.role || null)} (+ notifications)` }); log(`  users/${uid}  ${d.email || "?"} · ${d.nombre || "?"} · role=${JSON.stringify(d.role || null)}`); }
  else log(`  users/${uid}  (sin doc)`);
}

// 2) clubs / organizers / tournaments owned by old uids
log(""); log("CLUBS (ownerUid viejo)");
const clubsOld = await whereIn(collection(db, "clubs"), "ownerUid");
for (const d of clubsOld) { const sub = await subCounts(d.ref, ["canchas", "turnosFijos", "reservas", "reviews"]); toDelete.push({ path: `clubs/${d.id}`, why: `${d.data().nombre || "?"}${sub}` }); log(`  clubs/${d.id}  ${d.data().nombre || "?"}${sub}`); }
if (!clubsOld.length) log("  (ninguno)");

log(""); log("ORGANIZERS (ownerUid viejo)");
const orgsOld = await whereIn(collection(db, "organizers"), "ownerUid");
for (const d of orgsOld) { toDelete.push({ path: `organizers/${d.id}`, why: d.data().nombre || "?" }); log(`  organizers/${d.id}  ${d.data().nombre || "?"}`); }
if (!orgsOld.length) log("  (ninguno)");

log(""); log("TOURNAMENTS (organizerId viejo)");
const tOld = await whereIn(collection(db, "tournaments"), "organizerId");
const tOldIds = new Set(tOld.map((d) => d.id));
for (const d of tOld) { const sub = await subCounts(d.ref, ["pairs", "groups", "inscripciones", "reclamos"]); toDelete.push({ path: `tournaments/${d.id}`, why: `${d.data().nombre || "?"} · ${d.data().status || "?"}${sub}` }); log(`  tournaments/${d.id}  ${d.data().nombre || "?"} · ${d.data().status || "?"}${sub}`); }
if (!tOld.length) log("  (ninguno)");

// 3) extras requested explicitly
log(""); log("EXTRAS pedidos");
for (const p of extras) {
  const s = await getDoc(doc(db, ...p.split("/")));
  if (!s.exists()) { log(`  ${p}  (NO EXISTE)`); continue; }
  const d = s.data(); const sub = p.startsWith("tournaments/") ? await subCounts(s.ref, ["pairs", "groups", "inscripciones", "reclamos"]) : "";
  toDelete.push({ path: p, why: `${d.nombre || d.email || "?"} · ${d.status || ""}${sub}` }); log(`  ${p}  ${d.nombre || "?"} · ${d.status || ""}${sub}`);
  if (p.startsWith("tournaments/")) tOldIds.add(p.split("/")[1]);
}
if (reservasClub && fecha) {
  const clubs = (await getDocs(query(collection(db, "clubs"), where("nombre", "==", reservasClub)))).docs;
  for (const c of clubs) {
    const rs = (await getDocs(query(collection(c.ref, "reservas"), where("fecha", "==", fecha)))).docs
      .sort((a, b) => (a.data().hora || "").localeCompare(b.data().hora || ""));
    log(`  Reservas de "${reservasClub}" (clubs/${c.id}) el ${fecha}: ${rs.length}`);
    for (const r of rs) { const d = r.data(); const p = `clubs/${c.id}/reservas/${r.id}`; toDelete.push({ path: p, why: `${d.hora} · ${d.nombreJugador || d.jugadorUid || "?"} · ${d.status}` }); log(`    ${p}  ${d.hora} · ${d.nombreJugador || "?"} · ${d.status}`); }
  }
}

// 4) references to old uids inside KEPT data (reported, not deleted)
log(""); log("REFERENCIAS a UIDs viejos en datos que se conservan (no se borran, solo aviso)");
const reservasOld = await whereIn(collectionGroup(db, "reservas"), "jugadorUid");
for (const d of reservasOld) { const p = d.ref.path; if (toDelete.some((t) => p === t.path || p.startsWith(t.path + "/"))) continue; const x = d.data(); references.push({ path: p, why: `reserva ${x.fecha} ${x.hora} · ${x.status}` }); log(`  ${p}  reserva ${x.fecha} ${x.hora} · ${x.status}`); }
const allT = (await getDocs(collection(db, "tournaments"))).docs.filter((d) => !tOldIds.has(d.id));
for (const t of allT) {
  for (const sub of ["pairs", "inscripciones"]) {
    const docs = (await getDocs(collection(t.ref, sub))).docs.filter((d) => uids.includes(d.data().jugador1Uid) || uids.includes(d.data().jugador2Uid));
    for (const d of docs) { const p = d.ref.path; references.push({ path: p, why: `${t.data().nombre} · ${sub} ${d.data().nombrePareja || d.data().apellido1 || ""}` }); log(`  ${p}  ${t.data().nombre} · ${sub} ${d.data().nombrePareja || ""}`); }
  }
}
const reviewsOld = await whereIn(collectionGroup(db, "reviews"), "uid").catch(() => []);
for (const d of reviewsOld) { references.push({ path: d.ref.path, why: "review" }); log(`  ${d.ref.path}  review`); }
if (!references.length) log("  (ninguna)");

// 5) summary + totals
log(""); log(`TOTAL a borrar: ${toDelete.length} paths (recursivo: incluye subcolecciones)`);
toDelete.forEach((t, i) => log(`  ${String(i + 1).padStart(2)}. ${t.path}`));
const tot = async (c) => (await getDocs(collection(db, c))).size;
log(""); log(`Totales actuales: clubs=${await tot("clubs")} tournaments=${await tot("tournaments")} organizers=${await tot("organizers")} users=${await tot("users")}`);
log("(No se borró nada: este script solo lista.)");
writeFileSync(".phase0-logs/orphans.txt", out.join("\n") + "\n");
writeFileSync(".phase0-logs/orphans-paths.txt", toDelete.map((t) => t.path).join("\n") + "\n");
process.exit(0);
