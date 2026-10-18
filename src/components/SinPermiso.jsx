import Alert from "./ui/Alert";

// Una sección del panel del club abierta sin el permiso necesario: aviso en lugar del contenido
export default function SinPermiso({ children }) {
  return (
    <Alert tone="warning">
      <strong>No tenés permiso para esta sección.</strong> {children || "Pedile al dueño del club que te lo habilite."}
    </Alert>
  );
}
