// scripts/migrar-datos-privados.mjs — saca los datos privados de los documentos de lectura pública.
//
// Qué hace, para cada cuenta con la que entra (por defecto org@test.com y club@test.com, contraseña SEED_PASSWORD):
//   - Torneos que esa cuenta organiza: mueve whatsapp1/whatsapp2/email1/email2 de cada pareja a
//     tournaments/{tid}/contactos/{pairId} (solo organizador) y los borra de pairs; reescribe groups y el
//     bracketJson con la proyección pública de cada pareja (nombres, uids, categoría).
//   - Torneos que esa cuenta organiza: mueve email1/email2/whatsapp1/whatsapp2 de cada inscripción a
//     tournaments/{tid}/contactosInscripciones/{inscId} (solo organizador) y los borra de inscripciones.
//   - Clubes de esa cuenta: mueve cbu/alias/titularCuenta/cuit/razonSocial/usuarios a clubs/{clubId}/privado/datos
//     (solo dueño) y los borra del documento del club; mueve email/telefono de cada reserva a
//     clubs/{clubId}/contactosReservas/{reservaId} y el telefono de cada turno fijo a clubs/{clubId}/privado/turnosFijos
//     (solo dueño) y los borra de reservas y turnosFijos, que leen todos los jugadores con sesión.
// Correr DESPUÉS de desplegar firestore.rules (necesita las reglas de contactos/, contactosInscripciones/,
// contactosReservas/ y privado/). Los torneos y clubes de otras cuentas se listan al final para migrarlos con su dueño.
// Nota: reescribir groups/bracket dispara las Cloud Functions de puntos; los marcadores evitan otorgar dos veces,
// salvo en torneos con resultados cargados ANTES de desplegar las Functions (se avisan en el resumen).
//
// Uso: node scripts/migrar-datos-privados.mjs            (MIGRAR_CUENTAS="a@x.com,b@y.com" para otras cuentas)
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const CUENTAS = (process.env.MIGRAR_CUENTAS || "org@test.com,club@test.com").split(",").map((s) => s.trim()).filter(Boolean);
const PASSWORD = process.env.SEED_PASSWORD || "Padely2026!";

const CAMPOS_CONTACTO = ["whatsapp1", "whatsapp2", "email1", "email2"];
const CAMPOS_CLUB_PRIVADOS = ["cbu", "alias", "titularCuenta", "cuit", "razonSocial", "usuarios"];
const CAMPOS_CONTACTO_RESERVA = ["email", "telefono"];
const CAMPOS_PAREJA_PUBLICA = ["id", "nombrePareja", "jugador1", "jugador2", "jugador1Uid", "jugador2Uid", "categoria", "grupo", "posGrupo"];

const tieneAlguno = (obj, campos) => !!obj && typeof obj === "object" && campos.some((k) => obj[k] !== undefined);
const parejaPublica = (p) => {
  if (!p || typeof p !== "object") return null;
  const out = {};
  CAMPOS_PAREJA_PUBLICA.forEach((k) => {
    if (p[k] !== undefined) out[k] = p[k];
  });
  return out;
};
const partidoPublico = (m) => (m && typeof m === "object" ? { ...m, pareja1: parejaPublica(m.pareja1), pareja2: parejaPublica(m.pareja2) } : m ?? null);
// Una pareja "sucia" es la que tiene cualquier clave fuera de la proyección pública
const parejaSucia = (p) => !!p && typeof p === "object" && Object.keys(p).some((k) => !CAMPOS_PAREJA_PUBLICA.includes(k));

const resumen = { parejas: 0, grupos: 0, brackets: 0, inscripciones: 0, clubes: 0, reservas: 0, turnosFijos: 0, torneosConResultados: [], ajenos: { torneos: [], clubes: [] } };

async function migrarTorneo(t) {
  const tid = t.id;
  // Parejas: contactos a contactos/{pairId}, y fuera de pairs
  const pairsSnap = await getDocs(collection(db, "tournaments", tid, "pairs"));
  for (const p of pairsSnap.docs) {
    const data = p.data();
    if (!tieneAlguno(data, CAMPOS_CONTACTO)) continue;
    const contactos = {};
    const borrar = {};
    CAMPOS_CONTACTO.forEach((k) => {
      if (data[k] !== undefined) {
        if (data[k]) contactos[k] = data[k];
        borrar[k] = deleteField();
      }
    });
    if (Object.keys(contactos).length) {
      await setDoc(doc(db, "tournaments", tid, "contactos", p.id), { ...contactos, migradoEn: serverTimestamp() }, { merge: true });
    }
    await updateDoc(p.ref, borrar);
    resumen.parejas++;
  }
  // Grupos: proyección pública en parejas[] y partidos[].pareja1/2
  const groupsSnap = await getDocs(collection(db, "tournaments", tid, "groups"));
  let conResultados = false;
  for (const g of groupsSnap.docs) {
    const data = g.data();
    const parejas = Array.isArray(data.parejas) ? data.parejas : [];
    const partidos = Array.isArray(data.partidos) ? data.partidos : [];
    if (partidos.some((m) => m && m.resultado)) conResultados = true;
    const sucio = parejas.some(parejaSucia) || partidos.some((m) => m && (parejaSucia(m.pareja1) || parejaSucia(m.pareja2)));
    if (!sucio) continue;
    await updateDoc(g.ref, { parejas: parejas.map(parejaPublica), partidos: partidos.map(partidoPublico) });
    resumen.grupos++;
  }
  // Bracket
  if (typeof t.bracketJson === "string" && t.bracketJson) {
    try {
      const bracket = JSON.parse(t.bracketJson);
      const rondas = Array.isArray(bracket?.rondas) ? bracket.rondas : [];
      const sucio = rondas.some((r) => Array.isArray(r) && r.some((m) => m && (parejaSucia(m.pareja1) || parejaSucia(m.pareja2))));
      if (rondas.some((r) => Array.isArray(r) && r.some((m) => m && m.resultado))) conResultados = true;
      if (sucio) {
        const limpias = rondas.map((r) => (Array.isArray(r) ? r.map(partidoPublico) : r));
        await updateDoc(doc(db, "tournaments", tid), { bracketJson: JSON.stringify({ ...bracket, rondas: limpias }) });
        resumen.brackets++;
      }
    } catch (err) {
      console.error(`  bracketJson inválido en ${tid}:`, err.message);
    }
  }
  if (conResultados) resumen.torneosConResultados.push(`${t.nombre || "(sin nombre)"} [${tid}]`);
  // Inscripciones: contactos a contactosInscripciones/{inscId}, y fuera de inscripciones
  const inscSnap = await getDocs(collection(db, "tournaments", tid, "inscripciones"));
  for (const i of inscSnap.docs) {
    const data = i.data();
    if (!tieneAlguno(data, CAMPOS_CONTACTO)) continue;
    const contactos = {};
    const borrar = {};
    CAMPOS_CONTACTO.forEach((k) => {
      if (data[k] !== undefined) {
        if (data[k]) contactos[k] = data[k];
        borrar[k] = deleteField();
      }
    });
    await setDoc(
      doc(db, "tournaments", tid, "contactosInscripciones", i.id),
      { ...contactos, jugador1Uid: data.jugador1Uid || null, migradoEn: serverTimestamp() },
      { merge: true },
    );
    await updateDoc(i.ref, borrar);
    resumen.inscripciones++;
  }
}

// Reservas del club: email/telefono a contactosReservas/{reservaId}, y fuera de reservas
async function migrarReservasClub(clubId) {
  const snap = await getDocs(collection(db, "clubs", clubId, "reservas"));
  for (const r of snap.docs) {
    const data = r.data();
    if (!tieneAlguno(data, CAMPOS_CONTACTO_RESERVA)) continue;
    const contacto = {};
    const borrar = {};
    CAMPOS_CONTACTO_RESERVA.forEach((k) => {
      if (data[k] !== undefined) {
        contacto[k] = data[k] || "";
        borrar[k] = deleteField();
      }
    });
    if (data.jugadorUid || contacto.email || contacto.telefono) {
      await setDoc(
        doc(db, "clubs", clubId, "contactosReservas", r.id),
        {
          jugadorUid: data.jugadorUid || null,
          nombreJugador: data.nombreJugador || "",
          canchaId: data.canchaId || "",
          fecha: data.fecha || "",
          hora: data.hora || "",
          email: contacto.email || "",
          telefono: contacto.telefono || "",
          migradoEn: serverTimestamp(),
        },
        { merge: true },
      );
    }
    await updateDoc(r.ref, borrar);
    resumen.reservas++;
  }
}

// Turnos fijos del club: telefono a privado/turnosFijos ({ [turnoId]: { telefono } }), y fuera de turnosFijos
async function migrarTurnosFijosClub(clubId) {
  const snap = await getDocs(collection(db, "clubs", clubId, "turnosFijos"));
  const telefonos = {};
  for (const t of snap.docs) {
    const data = t.data();
    if (data.telefono === undefined) continue;
    telefonos[t.id] = { telefono: data.telefono || "" };
    resumen.turnosFijos++;
  }
  if (!Object.keys(telefonos).length) return;
  await setDoc(doc(db, "clubs", clubId, "privado", "turnosFijos"), { ...telefonos, migradoEn: serverTimestamp() }, { merge: true });
  for (const id of Object.keys(telefonos)) {
    await updateDoc(doc(db, "clubs", clubId, "turnosFijos", id), { telefono: deleteField() });
  }
}

async function migrarClub(c) {
  await migrarReservasClub(c.id);
  await migrarTurnosFijosClub(c.id);
  const data = c.data();
  if (!tieneAlguno(data, CAMPOS_CLUB_PRIVADOS)) return;
  const privados = {};
  const borrar = {};
  CAMPOS_CLUB_PRIVADOS.forEach((k) => {
    if (data[k] !== undefined) {
      privados[k] = data[k];
      borrar[k] = deleteField();
    }
  });
  await setDoc(doc(db, "clubs", c.id, "privado", "datos"), { ...privados, migradoEn: serverTimestamp() }, { merge: true });
  await updateDoc(c.ref, borrar);
  resumen.clubes++;
}

for (const email of CUENTAS) {
  let uid;
  try {
    uid = (await signInWithEmailAndPassword(auth, email, PASSWORD)).user.uid;
  } catch (err) {
    console.error(`No se pudo entrar como ${email}: ${err.code || err.message}`);
    continue;
  }
  console.log(`\n== ${email} (${uid}) ==`);
  const torneos = await getDocs(collection(db, "tournaments"));
  for (const t of torneos.docs) {
    const data = { id: t.id, ...t.data() };
    if (data.organizerId !== uid) {
      if (!resumen.ajenos.torneos.some((x) => x.id === t.id)) resumen.ajenos.torneos.push({ id: t.id, nombre: data.nombre || "", organizerId: data.organizerId || "" });
      continue;
    }
    console.log(`  torneo "${data.nombre || t.id}"`);
    await migrarTorneo(data);
  }
  const clubes = await getDocs(collection(db, "clubs"));
  for (const c of clubes.docs) {
    const data = c.data();
    if (data.ownerUid !== uid) {
      if (!resumen.ajenos.clubes.some((x) => x.id === c.id)) resumen.ajenos.clubes.push({ id: c.id, nombre: data.nombre || "", ownerUid: data.ownerUid || "" });
      continue;
    }
    console.log(`  club "${data.nombre || c.id}"`);
    await migrarClub(c);
  }
  await signOut(auth);
}

// Lo "ajeno" de una cuenta puede ser propio de otra: quedan solo los que ninguna cuenta pudo migrar
const migrables = new Set();
for (const email of CUENTAS) {
  try {
    const u = (await signInWithEmailAndPassword(auth, email, PASSWORD)).user.uid;
    migrables.add(u);
    await signOut(auth);
  } catch {
    // ya se informó arriba
  }
}
resumen.ajenos.torneos = resumen.ajenos.torneos.filter((t) => !migrables.has(t.organizerId));
resumen.ajenos.clubes = resumen.ajenos.clubes.filter((c) => !migrables.has(c.ownerUid));

console.log("\n=== Resumen ===");
console.log(`Parejas migradas: ${resumen.parejas} · Grupos reescritos: ${resumen.grupos} · Brackets reescritos: ${resumen.brackets} · Inscripciones migradas: ${resumen.inscripciones}`);
console.log(`Clubes migrados: ${resumen.clubes} · Reservas migradas: ${resumen.reservas} · Turnos fijos migrados: ${resumen.turnosFijos}`);
if (resumen.torneosConResultados.length) {
  console.log("Torneos con resultados cargados (si son anteriores al deploy de las Functions, los puntos pudieron otorgarse de nuevo):");
  resumen.torneosConResultados.forEach((t) => console.log(`  - ${t}`));
}
if (resumen.ajenos.torneos.length) {
  console.log("Torneos de OTRAS cuentas (no migrados; entrá con su dueño o borralos):");
  resumen.ajenos.torneos.forEach((t) => console.log(`  - ${t.nombre || "(sin nombre)"} [${t.id}] organizerId=${t.organizerId}`));
}
if (resumen.ajenos.clubes.length) {
  console.log("Clubes de OTRAS cuentas (no migrados):");
  resumen.ajenos.clubes.forEach((c) => console.log(`  - ${c.nombre || "(sin nombre)"} [${c.id}] ownerUid=${c.ownerUid}`));
}
process.exit(0);
