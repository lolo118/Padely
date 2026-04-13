import { useState } from "react";
import { db } from "../../lib/firebase";
import { doc, setDoc, addDoc, collection, getDocs, serverTimestamp, query, where } from "firebase/firestore";

const ORG_UID = "SHZbMOsOL4PwSwWckha3RGURD4N2";
const CLUB_UID = "twXUn2xG4nc0uN4d2spCsHCjRc82";
const PLAYER_UID = "EDRondF5ZBSwKdhRiiw6hte39EP2";

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function pastDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const today = futureDate(0);

export default function SeedData() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);

  const addLog = (msg) => setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);

  const seedClubs = async () => {
    addLog("Creando clubes de prueba...");

    const club2Ref = doc(db, "clubs", "club_test_2");
    await setDoc(club2Ref, {
      ownerUid: CLUB_UID,
      nombre: "Padel Zone SDE",
      ciudad: "Santiago del Estero",
      provincia: "Santiago del Estero",
      direccion: "Av. Rivadavia 456",
      telefono: "3854567890",
      email: "padelzone@test.com",
      instagram: "padelzonesde",
      facebook: "padelzonesde",
      whatsapp: "543854567890",
      reservaDirecta: false,
      diasAnticipacion: 14,
      createdAt: serverTimestamp(),
    });
    addLog("Club 'Padel Zone SDE' creado");

    const canchas2 = [
      { nombre: "Cancha A", superficie: "Sintético", techada: true, precioBase: 18000 },
      { nombre: "Cancha B", superficie: "Sintético", techada: false, precioBase: 14000 },
      { nombre: "Cancha C", superficie: "Cemento", techada: false, precioBase: 12000 },
    ];
    for (const cancha of canchas2) {
      const horarios = {};
      for (let h = 8; h <= 22; h++) {
        const hora = `${h.toString().padStart(2, "0")}:00`;
        horarios[hora] = h >= 18 ? cancha.precioBase * 1.2 : cancha.precioBase;
      }
      await addDoc(collection(db, "clubs", "club_test_2", "canchas"), {
        ...cancha, horarios, horariosDisponibles: Object.keys(horarios).sort(), createdAt: serverTimestamp(),
      });
    }
    addLog("3 canchas creadas para Padel Zone");

    const club3Ref = doc(db, "clubs", "club_test_3");
    await setDoc(club3Ref, {
      ownerUid: "fake_owner_3",
      nombre: "Arena Padel Club",
      ciudad: "Santiago del Estero",
      provincia: "Santiago del Estero",
      direccion: "Calle Tucumán 789",
      telefono: "3857891234",
      email: "arenapadel@test.com",
      instagram: "arenapadel",
      reservaDirecta: true,
      diasAnticipacion: 7,
      createdAt: serverTimestamp(),
    });
    addLog("Club 'Arena Padel Club' creado");

    const canchas3 = [
      { nombre: "Cancha 1", superficie: "Césped", techada: true, precioBase: 20000 },
      { nombre: "Cancha 2", superficie: "Césped", techada: true, precioBase: 20000 },
    ];
    for (const cancha of canchas3) {
      const horarios = {};
      for (let h = 9; h <= 23; h++) {
        horarios[`${h.toString().padStart(2, "0")}:00`] = cancha.precioBase;
      }
      await addDoc(collection(db, "clubs", "club_test_3", "canchas"), {
        ...cancha, horarios, horariosDisponibles: Object.keys(horarios).sort(), createdAt: serverTimestamp(),
      });
    }
    addLog("2 canchas creadas para Arena Padel");

    const club4Ref = doc(db, "clubs", "club_test_4");
    await setDoc(club4Ref, {
      ownerUid: "fake_owner_4",
      nombre: "Smash Padel Tucumán",
      ciudad: "San Miguel de Tucumán",
      provincia: "Tucumán",
      direccion: "Av. Aconquija 1500",
      telefono: "3811234567",
      reservaDirecta: true,
      diasAnticipacion: 7,
      createdAt: serverTimestamp(),
    });
    const horarios4 = {};
    for (let h = 10; h <= 21; h++) {
      horarios4[`${h.toString().padStart(2, "0")}:00`] = 15000;
    }
    await addDoc(collection(db, "clubs", "club_test_4", "canchas"), {
      nombre: "Court 1", superficie: "Sintético", techada: false, precioBase: 15000,
      horarios: horarios4, horariosDisponibles: Object.keys(horarios4).sort(), createdAt: serverTimestamp(),
    });
    addLog("Club 'Smash Padel Tucumán' creado (otra ciudad)");
  };

  const seedReservations = async () => {
    addLog("Creando reservas de prueba...");

    const clubsSnap = await getDocs(query(collection(db, "clubs"), where("ownerUid", "==", CLUB_UID)));
    if (clubsSnap.empty) { addLog("ERROR: No se encontró el club principal"); return; }
    const mainClub = { id: clubsSnap.docs[0].id, ...clubsSnap.docs[0].data() };
    const canchasSnap = await getDocs(collection(db, "clubs", mainClub.id, "canchas"));
    const canchas = canchasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (canchas.length === 0) { addLog("ERROR: No hay canchas en el club"); return; }

    const reservas = [
      { canchaId: canchas[0].id, canchaName: canchas[0].nombre, fecha: futureDate(1), hora: "18:00", precio: 15000, jugadorUid: PLAYER_UID, nombreJugador: "Jugador Test", email: "jugador@test.com", telefono: "3851111111", status: "confirmada" },
      { canchaId: canchas[0].id, canchaName: canchas[0].nombre, fecha: futureDate(3), hora: "20:00", precio: 15000, jugadorUid: PLAYER_UID, nombreJugador: "Jugador Test", email: "jugador@test.com", telefono: "3851111111", status: "pendiente" },
      { canchaId: canchas[0].id, canchaName: canchas[0].nombre, fecha: today, hora: "09:00", precio: 15000, jugadorUid: null, nombreJugador: "Carlos Gómez", email: "", telefono: "3852222222", status: "confirmada" },
      { canchaId: canchas[0].id, canchaName: canchas[0].nombre, fecha: today, hora: "10:00", precio: 15000, jugadorUid: null, nombreJugador: "María López", email: "", telefono: "3853333333", status: "confirmada" },
      { canchaId: canchas[0].id, canchaName: canchas[0].nombre, fecha: today, hora: "18:00", precio: 15000, jugadorUid: null, nombreJugador: "Pedro Sánchez", email: "", telefono: "3854444444", status: "pendiente" },
      { canchaId: canchas[0].id, canchaName: canchas[0].nombre, fecha: futureDate(1), hora: "10:00", precio: 15000, jugadorUid: null, nombreJugador: "Ana Martínez", email: "", telefono: "3855555555", status: "confirmada" },
      { canchaId: canchas[0].id, canchaName: canchas[0].nombre, fecha: pastDate(3), hora: "19:00", precio: 15000, jugadorUid: PLAYER_UID, nombreJugador: "Jugador Test", email: "jugador@test.com", telefono: "3851111111", status: "confirmada" },
    ];

    for (const r of reservas) {
      await addDoc(collection(db, "clubs", mainClub.id, "reservas"), { ...r, createdAt: serverTimestamp() });
    }
    addLog(`${reservas.length} reservas creadas en ${mainClub.nombre}`);

    const reviews = [
      { uid: PLAYER_UID, nombre: "Jugador Test", estrellas: 5, comentario: "Excelentes canchas, muy bien mantenidas.", fecha: pastDate(2) },
      { uid: "fake_user_1", nombre: "Roberto Díaz", estrellas: 4, comentario: "Buena onda, un poco caro pero vale la pena.", fecha: pastDate(5) },
      { uid: "fake_user_2", nombre: "Luciana Torres", estrellas: 5, comentario: "El mejor club de la zona, lo recomiendo.", fecha: pastDate(10) },
    ];
    for (const rev of reviews) {
      await addDoc(collection(db, "clubs", mainClub.id, "reviews"), rev);
    }
    addLog("3 reviews creadas");
  };

  const seedTournaments = async () => {
    addLog("Creando torneos de prueba...");

    // T1: Inscripción (normal)
    const t1Ref = await addDoc(collection(db, "tournaments"), {
      nombre: "Copa Apertura 2026", formato: "normal",
      categoriaGenero: ["masculino"], categoriasConfig: { masculino: ["7ma", "6ta"] },
      maxParejas: 16, inscripcion: 5000,
      inscripcionIncluye: "1 tubo de pelotas\nRemera del torneo\nHidratación",
      parejasQueAvanzan: 2,
      sede: "Club Padely Central", direccionSede: "Av. Belgrano 500",
      ciudad: "Santiago del Estero", provincia: "Santiago del Estero",
      fechaInicio: futureDate(14), fechaFin: futureDate(16),
      descripcion: "El torneo más importante de la temporada. Inscribite y competí contra los mejores.",
      sets: 3, gamesPorSet: 6, superTiebreak: true,
      inscripcionAbierta: true, habilitarReclamos: true, plazoReclamosMinutos: 30,
      reglamento: "15 minutos de tolerancia\nPareja que no sea de la categoría será eliminada\nSe juega con pelotas nuevas",
      premios: "🥇 1er puesto: $50.000 + 2 paletas\n🥈 2do puesto: $25.000\n🥉 3er puesto: Kit de pelotas",
      instagramOrganizador: "copapadel2026", whatsappOrganizador: "543851234567",
      administradores: [{ nombre: "Juan Organizador", whatsapp: "543851234567" }],
      organizerId: ORG_UID, status: "inscripcion", createdAt: serverTimestamp(),
    });
    addLog("Torneo 'Copa Apertura 2026' creado (inscripción)");

    const parejasT1 = [
      { j1: "Martín García", j2: "Lucas Fernández", np: "García / Fernández" },
      { j1: "Diego Rodríguez", j2: "Tomás López", np: "Rodríguez / López" },
      { j1: "Nicolás Martínez", j2: "Santiago Pérez", np: "Martínez / Pérez" },
    ];
    for (const p of parejasT1) {
      await addDoc(collection(db, "tournaments", t1Ref.id, "pairs"), {
        jugador1: p.j1, jugador2: p.j2, nombrePareja: p.np,
        jugador1Uid: null, jugador2Uid: null, createdAt: serverTimestamp(),
      });
    }
    addLog("3 parejas agregadas a Copa Apertura");

    // T2: En curso (mini)
    const t2Ref = await addDoc(collection(db, "tournaments"), {
      nombre: "Mini Torneo Express", formato: "mini",
      categoriaGenero: ["masculino", "femenino"], categoriasConfig: { masculino: ["8va", "7ma"], femenino: ["8va"] },
      maxParejas: 8, inscripcion: 3000, inscripcionIncluye: "Hidratación", parejasQueAvanzan: 2,
      sede: "Padel Zone SDE", direccionSede: "Av. Rivadavia 456",
      ciudad: "Santiago del Estero", provincia: "Santiago del Estero",
      fechaInicio: pastDate(2), fechaFin: futureDate(1),
      sets: 1, gamesPorSet: 4, superTiebreak: false,
      inscripcionAbierta: false, habilitarReclamos: true, plazoReclamosMinutos: 15,
      premios: "🥇 $20.000\n🥈 $10.000",
      administradores: [{ nombre: "Admin Express", whatsapp: "543859999999" }],
      organizerId: ORG_UID, status: "en_curso", createdAt: serverTimestamp(),
    });
    addLog("Torneo 'Mini Torneo Express' creado (en_curso)");

    const nombresT2 = [["Andrés Ruiz", "Pablo Moreno"], ["Federico Acosta", "Gonzalo Castro"], ["Matías Romero", "Emiliano Díaz"], ["Jugador Test", "Compañero Test"]];
    const parejasT2Ids = [];
    for (let i = 0; i < nombresT2.length; i++) {
      const ref = await addDoc(collection(db, "tournaments", t2Ref.id, "pairs"), {
        jugador1: nombresT2[i][0], jugador2: nombresT2[i][1],
        nombrePareja: `${nombresT2[i][0].split(" ").pop()} / ${nombresT2[i][1].split(" ").pop()}`,
        jugador1Uid: i === 3 ? PLAYER_UID : null, jugador2Uid: null, createdAt: serverTimestamp(),
      });
      parejasT2Ids.push({ id: ref.id, jugador1: nombresT2[i][0], jugador2: nombresT2[i][1],
        nombrePareja: `${nombresT2[i][0].split(" ").pop()} / ${nombresT2[i][1].split(" ").pop()}`,
        jugador1Uid: i === 3 ? PLAYER_UID : null, jugador2Uid: null });
    }
    addLog("4 parejas agregadas (incluyendo Jugador Test)");

    await addDoc(collection(db, "tournaments", t2Ref.id, "groups"), {
      nombre: "Grupo A", parejas: [parejasT2Ids[0], parejasT2Ids[1]],
      partidos: [{ pareja1: parejasT2Ids[0], pareja2: parejasT2Ids[1], resultado: { sets: [{ g1: 4, g2: 2 }] }, hora: "18:00", cancha: "1" }],
    });
    await addDoc(collection(db, "tournaments", t2Ref.id, "groups"), {
      nombre: "Grupo B", parejas: [parejasT2Ids[2], parejasT2Ids[3]],
      partidos: [{ pareja1: parejasT2Ids[2], pareja2: parejasT2Ids[3], resultado: { sets: [{ g1: 3, g2: 4 }] }, hora: "19:00", cancha: "2" }],
    });
    addLog("2 grupos con resultados creados");

    // T3: Liga en curso
    const t3Ref = await addDoc(collection(db, "tournaments"), {
      nombre: "Liga Verano 2026", formato: "liga",
      categoriaGenero: ["mixto"], categoriasConfig: { mixto: ["8va", "7ma", "6ta"] },
      maxParejas: 6, inscripcion: 8000, inscripcionIncluye: "Remera + pelota por fecha",
      sede: "Arena Padel Club", direccionSede: "Calle Tucumán 789",
      ciudad: "Santiago del Estero", provincia: "Santiago del Estero",
      fechaInicio: pastDate(7), fechaFin: futureDate(21),
      sets: 2, gamesPorSet: 6, superTiebreak: true,
      inscripcionAbierta: false, habilitarReclamos: false,
      premios: "🥇 Trofeo + $30.000\n🥈 $15.000",
      administradores: [{ nombre: "Liga Admin", whatsapp: "543851111111" }],
      organizerId: ORG_UID, status: "en_curso", createdAt: serverTimestamp(),
    });
    addLog("Torneo 'Liga Verano 2026' creado (liga, en_curso)");

    const nombresLiga = [["Ana Gutiérrez", "Carlos Vega"], ["Laura Medina", "Ramiro Sosa"], ["Valentina Ruiz", "Jugador Test"], ["Camila Ortiz", "Facundo Paz"]];
    const parejasLigaIds = [];
    for (let i = 0; i < nombresLiga.length; i++) {
      const ref = await addDoc(collection(db, "tournaments", t3Ref.id, "pairs"), {
        jugador1: nombresLiga[i][0], jugador2: nombresLiga[i][1],
        nombrePareja: `${nombresLiga[i][0].split(" ").pop()} / ${nombresLiga[i][1].split(" ").pop()}`,
        jugador1Uid: null, jugador2Uid: i === 2 ? PLAYER_UID : null, createdAt: serverTimestamp(),
      });
      parejasLigaIds.push({ id: ref.id, jugador1: nombresLiga[i][0], jugador2: nombresLiga[i][1],
        nombrePareja: `${nombresLiga[i][0].split(" ").pop()} / ${nombresLiga[i][1].split(" ").pop()}`,
        jugador1Uid: null, jugador2Uid: i === 2 ? PLAYER_UID : null });
    }

    await addDoc(collection(db, "tournaments", t3Ref.id, "groups"), {
      nombre: "Liga", parejas: parejasLigaIds,
      partidos: [
        { pareja1: parejasLigaIds[0], pareja2: parejasLigaIds[3], resultado: { sets: [{ g1: 6, g2: 3 }, { g1: 6, g2: 4 }] }, hora: "18:00", cancha: "1", fecha: 1 },
        { pareja1: parejasLigaIds[1], pareja2: parejasLigaIds[2], resultado: { sets: [{ g1: 4, g2: 6 }, { g1: 6, g2: 3 }, { g1: 6, g2: 6, tb1: 7, tb2: 5 }] }, hora: "19:00", cancha: "2", fecha: 1 },
        { pareja1: parejasLigaIds[0], pareja2: parejasLigaIds[2], resultado: { sets: [{ g1: 6, g2: 2 }, { g1: 6, g2: 1 }] }, hora: "18:00", cancha: "1", fecha: 2 },
        { pareja1: parejasLigaIds[1], pareja2: parejasLigaIds[3], resultado: null, hora: "", cancha: "", fecha: 2 },
        { pareja1: parejasLigaIds[0], pareja2: parejasLigaIds[1], resultado: null, hora: "", cancha: "", fecha: 3 },
        { pareja1: parejasLigaIds[2], pareja2: parejasLigaIds[3], resultado: null, hora: "", cancha: "", fecha: 3 },
      ],
    });
    addLog("Liga fixture creado con resultados parciales");

    // T4: Finalizado
    await addDoc(collection(db, "tournaments"), {
      nombre: "Torneo Clausura 2025", formato: "mini",
      categoriaGenero: ["masculino"], categoriasConfig: { masculino: ["8va"] },
      maxParejas: 4, inscripcion: 2000,
      sede: "Padel Zone SDE", ciudad: "Santiago del Estero", provincia: "Santiago del Estero",
      fechaInicio: pastDate(30), fechaFin: pastDate(28),
      sets: 1, gamesPorSet: 6,
      administradores: [{ nombre: "Admin Clausura", whatsapp: "543850000000" }],
      organizerId: ORG_UID, status: "finalizado", createdAt: serverTimestamp(),
    });
    addLog("Torneo 'Clausura 2025' creado (finalizado)");
  };

  const seedAll = async () => {
    setRunning(true);
    setLog([]);
    try {
      await seedClubs();
      await seedReservations();
      await seedTournaments();
      addLog("✅ ¡Datos de prueba creados exitosamente!");
    } catch (err) {
      addLog(`❌ ERROR: ${err.message}`);
      console.error(err);
    }
    setRunning(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Seed Data (Temporal)</h1>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        Crea datos de prueba: 3 clubes adicionales con canchas, reservas, reviews, y 4 torneos en distintos estados.
      </p>

      <div className="themed-card rounded-2xl p-5 border mb-4">
        <div className="flex flex-col gap-3">
          <button onClick={seedAll} disabled={running}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}>
            {running ? "Creando datos..." : "Crear todos los datos de prueba"}
          </button>
          <div className="flex gap-2">
            <button onClick={() => { setRunning(true); seedClubs().then(() => setRunning(false)).catch(() => setRunning(false)); }}
              disabled={running} className="flex-1 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50"
              style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}>
              Solo Clubes
            </button>
            <button onClick={() => { setRunning(true); seedReservations().then(() => setRunning(false)).catch(() => setRunning(false)); }}
              disabled={running} className="flex-1 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50"
              style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}>
              Solo Reservas
            </button>
            <button onClick={() => { setRunning(true); seedTournaments().then(() => setRunning(false)).catch(() => setRunning(false)); }}
              disabled={running} className="flex-1 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50"
              style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}>
              Solo Torneos
            </button>
          </div>
        </div>
      </div>

      {log.length > 0 && (
        <div className="themed-card rounded-2xl p-5 border">
          <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Log</h2>
          <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
            {log.map((l, i) => (
              <p key={i} className="text-xs font-mono" style={{ color: l.includes("ERROR") ? "#ef4444" : l.includes("✅") ? "#22c55e" : "var(--text-muted)" }}>
                {l}
              </p>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs mt-4 text-center" style={{ color: "var(--text-muted)" }}>
        ⚠️ Eliminá esta página después de crear los datos de prueba
      </p>
    </div>
  );
}
