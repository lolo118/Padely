import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Dialogo from "../Dialogo";
import { toast } from "../Toast";
import { Alert, Button, Field, Input, Select } from "../ui";
import { getDisponibilidad, guardarDisponibilidad } from "../../services/profesService";
import { DIAS_SEMANA, normalizarDisponibilidad } from "../../utils/profes";
import { getTodayLocal } from "../../utils/formatDate";

// Lunes primero; los valores son los índices de Date (0 = domingo)
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const HORAS_DESDE = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
const HORAS_HASTA = [...HORAS_DESDE.slice(1), "24:00"];

function SelectHora({ value, onChange, opciones, label }) {
  return (
    <Select value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label={label} className="pd-tnum">
      {opciones.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </Select>
  );
}

// Horarios del profe en un club: franjas por día de la semana y excepciones (día libre, horas libres o extra).
// Las clases empiezan en punto; una clase de 90 min ocupa dos horas de cancha.
export default function DisponibilidadEditor({ uid, clubId, clubNombre, onCerrar }) {
  const [semanal, setSemanal] = useState(null);
  const [excepciones, setExcepciones] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    getDisponibilidad(uid, clubId)
      .then((d) => {
        if (!vivo) return;
        const s = {};
        for (let i = 0; i < 7; i++) s[i] = Array.isArray(d?.semanal?.[i]) ? d.semanal[i] : [];
        setSemanal(s);
        setExcepciones(Array.isArray(d?.excepciones) ? d.excepciones.filter((e) => e.fecha >= getTodayLocal()) : []);
      })
      .catch(() => vivo && setSemanal({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }));
    return () => {
      vivo = false;
    };
  }, [uid, clubId]);

  const cambiarRango = (dia, i, campo, valor) => setSemanal((s) => ({ ...s, [dia]: s[dia].map((r, j) => (j === i ? { ...r, [campo]: valor } : r)) }));
  const sumarRango = (dia) => setSemanal((s) => ({ ...s, [dia]: [...s[dia], { desde: "18:00", hasta: "21:00" }] }));
  const sacarRango = (dia, i) => setSemanal((s) => ({ ...s, [dia]: s[dia].filter((_, j) => j !== i) }));
  const cambiarExc = (i, campo, valor) => setExcepciones((l) => l.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)));

  const guardar = async () => {
    setError("");
    const n = normalizarDisponibilidad({ semanal, excepciones: excepciones.map((e) => (e.tipo === "libre" && e.todoElDia ? { fecha: e.fecha, tipo: "libre" } : e)) });
    if (n.error) return setError(n.error);
    setGuardando(true);
    try {
      await guardarDisponibilidad(uid, clubId, n);
      toast.success("Horarios guardados");
      onCerrar();
    } catch (err) {
      console.error("Error guardando horarios:", err);
      setError("No pudimos guardar los horarios.");
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo={`Horarios en ${clubNombre || "el club"}`}
      descripcion="Cuándo das clases en este club. Los alumnos ven solo los horarios en que además hay cancha libre (si tus clases ocupan cancha)."
      ancho="lg"
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar horarios
          </Button>
        </>
      }
    >
      {semanal === null ? (
        <div className="pd-skeleton h-60 rounded-lg mt-4" aria-busy="true" aria-label="Cargando" />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <ul className="m-0 p-0 list-none flex flex-col divide-y divide-line">
            {ORDEN_DIAS.map((dia) => (
              <li key={dia} className="py-2 flex flex-wrap items-start gap-3">
                <span className="font-semibold w-24 pt-2">{DIAS_SEMANA[dia]}</span>
                <div className="flex flex-col gap-2 flex-1 min-w-[220px]">
                  {semanal[dia].length === 0 && <span className="body-sm text-ink-3 pt-2">No das clases</span>}
                  {semanal[dia].map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <SelectHora value={r.desde} onChange={(v) => cambiarRango(dia, i, "desde", v)} opciones={HORAS_DESDE} label={`${DIAS_SEMANA[dia]}, desde`} />
                      <span aria-hidden="true">–</span>
                      <SelectHora value={r.hasta} onChange={(v) => cambiarRango(dia, i, "hasta", v)} opciones={HORAS_HASTA} label={`${DIAS_SEMANA[dia]}, hasta`} />
                      <Button size="sm" variant="ghost" iconOnly aria-label="Sacar franja" icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />} onClick={() => sacarRango(dia, i)} />
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="ghost" icon={<Plus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => sumarRango(dia)}>
                  Franja
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <h3 className="heading-sm m-0">Excepciones</h3>
            <p className="body-sm text-ink-3 mt-1 mb-2">Un día libre (vacaciones, torneo) u horas extra un día puntual.</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {excepciones.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Input type="date" value={e.fecha} min={getTodayLocal()} onChange={(ev) => cambiarExc(i, "fecha", ev.target.value)} aria-label="Fecha" className="w-auto!" />
                  <Select value={e.tipo === "libre" ? (e.desde || e.todoElDia === false ? "libreHoras" : "libre") : "extra"} onChange={(ev) => {
                    const v = ev.target.value;
                    if (v === "libre") setExcepciones((l) => l.map((x, j) => (j === i ? { fecha: x.fecha, tipo: "libre", desde: null, hasta: null, todoElDia: true } : x)));
                    else setExcepciones((l) => l.map((x, j) => (j === i ? { fecha: x.fecha, tipo: v === "extra" ? "extra" : "libre", desde: x.desde || "09:00", hasta: x.hasta || "12:00", todoElDia: false } : x)));
                  }} aria-label="Tipo">
                    <option value="libre">Día libre</option>
                    <option value="libreHoras">Horas libres</option>
                    <option value="extra">Horas extra</option>
                  </Select>
                  {(e.tipo === "extra" || e.desde) && (
                    <>
                      <SelectHora value={e.desde} onChange={(v) => cambiarExc(i, "desde", v)} opciones={HORAS_DESDE} label="Desde" />
                      <span aria-hidden="true">–</span>
                      <SelectHora value={e.hasta} onChange={(v) => cambiarExc(i, "hasta", v)} opciones={HORAS_HASTA} label="Hasta" />
                    </>
                  )}
                  <Button size="sm" variant="ghost" iconOnly aria-label="Sacar excepción" icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setExcepciones((l) => l.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ul>
            <Field as="div" className="mt-2">
              <Button size="sm" icon={<Plus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setExcepciones((l) => [...l, { fecha: getTodayLocal(), tipo: "libre", desde: null, hasta: null, todoElDia: true }])}>
                Sumar excepción
              </Button>
            </Field>
          </div>
        </div>
      )}
    </Dialogo>
  );
}
