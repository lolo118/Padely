import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { collection, query, where, getDocs, collectionGroup, getDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { actualizarReserva } from "../services/canchaService";

const statusBadge = {
  confirmada: "bg-green-100 text-green-700",
  pendiente: "bg-yellow-100 text-yellow-700",
  cancelada: "bg-red-100 text-red-500",
};

const statusLabel = {
  confirmada: "Confirmada",
  pendiente: "Pendiente",
  cancelada: "Cancelada",
};

export default function MisReservas() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);

  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const q = query(collectionGroup(db, "reservas"), where("jugadorUid", "==", user.uid));
        const snap = await getDocs(q);
        const datos = [];

        for (const d of snap.docs) {
          const data = d.data();
          const clubRef = d.ref.parent.parent;
          const clubId = clubRef.id;
          let clubNombre = "";
          try {
            const clubSnap = await getDoc(clubRef);
            if (clubSnap.exists()) {
              clubNombre = clubSnap.data().nombre || clubSnap.data().name || "";
            }
          } catch {}
          datos.push({ id: d.id, clubId, clubNombre, ...data });
        }

        // Separar y ordenar
        const proximas = datos
          .filter((r) => r.fecha >= hoyStr && r.status !== "cancelada")
          .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

        const anteriores = datos
          .filter((r) => r.fecha < hoyStr || r.status === "cancelada")
          .sort((a, b) => (b.fecha + (b.hora || "")).localeCompare(a.fecha + (a.hora || "")));

        setReservas([...proximas, ...anteriores]);
      } catch (err) {
        console.error("Error al cargar reservas:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  const cancelarReserva = async (reserva) => {
    if (!window.confirm("¿Cancelar esta reserva?")) return;
    try {
      await actualizarReserva(reserva.clubId, reserva.id, { status: "cancelada" });
      setReservas(reservas.map((r) => r.id === reserva.id ? { ...r, status: "cancelada" } : r));
    } catch (err) {
      console.error("Error al cancelar:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const proximas = reservas.filter((r) => r.fecha >= hoyStr && r.status !== "cancelada");
  const anteriores = reservas.filter((r) => r.fecha < hoyStr || r.status === "cancelada");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Mis reservas</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Tus reservas de canchas</p>
      </div>

      {reservas.length === 0 ? (
        <div className="themed-card rounded-2xl p-8 border text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>No tenés reservas</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Cuando reserves una cancha, aparecerá acá</p>
          <button
            onClick={() => navigate("/hub")}
            className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold text-white transition"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Ver canchas disponibles
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Próximas */}
          {proximas.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
                Próximas ({proximas.length})
              </h2>
              <div className="flex flex-col gap-3">
                {proximas.map((r) => (
                  <div key={r.id} className="themed-card rounded-2xl p-4 border">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{r.clubNombre || "Club"}</p>
                        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {r.canchaName || r.cancha} · {r.fecha} · {r.hora}
                        </p>
                      </div>
                      <div className="text-right">
                        {r.precio != null && (
                          <p className="font-bold text-sm" style={{ color: "var(--accent)" }}>${r.precio}</p>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${statusBadge[r.status] || statusBadge.pendiente}`}>
                          {statusLabel[r.status] || "Pendiente"}
                        </span>
                      </div>
                    </div>
                    {r.status !== "cancelada" && (
                      <button
                        onClick={() => cancelarReserva(r)}
                        className="text-xs font-semibold text-red-400 hover:text-red-600 transition mt-2"
                      >
                        Cancelar reserva
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anteriores */}
          {anteriores.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
                Anteriores ({anteriores.length})
              </h2>
              <div className="flex flex-col gap-3">
                {anteriores.map((r) => (
                  <div key={r.id} className="themed-card rounded-2xl p-4 border" style={{ opacity: 0.7 }}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{r.clubNombre || "Club"}</p>
                        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {r.canchaName || r.cancha} · {r.fecha} · {r.hora}
                        </p>
                      </div>
                      <div className="text-right">
                        {r.precio != null && (
                          <p className="font-bold text-sm" style={{ color: "var(--accent)" }}>${r.precio}</p>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${statusBadge[r.status] || statusBadge.pendiente}`}>
                          {statusLabel[r.status] || "Pendiente"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
