import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getEstadoPlataforma, guardarEstadoPlataforma } from "../../services/estadoService";
import { toast } from "../../components/Toast";
import { Button, Card, Field, Pills, Textarea } from "../../components/ui";

// Super-admin → Resumen (P3-12): el aviso de estado que ven todos (banner en cada pantalla y /estado)
export default function EstadoForm() {
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    let vivo = true;
    getEstadoPlataforma({ fresco: true }).then((e) => vivo && setForm({ activo: !!e.activo, mensaje: e.mensaje || "" }));
    return () => {
      vivo = false;
    };
  }, []);
  if (!form) return <div className="pd-skeleton h-32 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  const guardar = async (e) => {
    e.preventDefault();
    if (form.activo && !form.mensaje.trim()) {
      toast.error("Escribí el mensaje del aviso.");
      return;
    }
    setGuardando(true);
    try {
      await guardarEstadoPlataforma({ activo: form.activo, mensaje: form.mensaje.trim() });
      toast.success(form.activo ? "Aviso publicado" : "Aviso apagado");
    } catch (err) {
      console.error("Error guardando el estado:", err);
      toast.error("No pudimos guardar el aviso.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Card as="form" onSubmit={guardar} noValidate>
      <Card.Title as="h2">Aviso de estado</Card.Title>
      <Card.Meta className="mt-1!">
        Un problema o un mantenimiento: lo ven todos arriba de cada pantalla y en{" "}
        <Link to="/estado" className="underline">
          /estado
        </Link>
        .
      </Card.Meta>
      <div className="mt-4 grid gap-4">
        <Field label="Aviso">
          <Pills
            items={[
              { value: false, label: "Apagado" },
              { value: true, label: "Publicado" },
            ]}
            value={form.activo}
            onChange={(v) => setForm({ ...form, activo: v })}
            ariaLabel="Aviso de estado"
          />
        </Field>
        <Field label="Mensaje" help="Hasta 280 caracteres. Ej.: Los pagos con Mercado Pago andan lentos; las reservas siguen funcionando.">
          <Textarea value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} maxLength={280} rows={2} />
        </Field>
      </div>
      <div className="mt-4">
        <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
          Guardar aviso
        </Button>
      </div>
    </Card>
  );
}
