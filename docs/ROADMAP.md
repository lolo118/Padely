# Padely — roadmap

Lo que viene, en orden aproximado. Cada ítem se arma como un prompt P3-NN (o fase 4) cuando Sebastián lo pide.
Lo ya hecho está en `PADELY_HANDOFF.md` y en el historial de git.

## Próximo

### Factura electrónica con ARCA (CAE) — **gratis, no PRO**
Decidido 2026-11-11: va en **todos los planes (FREE incluido)**, como en los sistemas de gestión para bares, que la
traen sin costo. Cada club la **prende o la apaga** desde su panel (Configuración → Facturación).

- **Modelo:** cada club factura con **su CUIT**. Delega en ARCA el servicio "Facturación electrónica" (wsfe) al CUIT
  de Padely ("Administrador de Relaciones de Clave Fiscal"); Padely firma con **un solo certificado** para todos.
  Alternativa para quien prefiera: el club sube su propio certificado.
- **Servicios de ARCA** (gratis): WSAA (login con certificado X.509 → ticket de ~12 h) y WSFEv1
  (`FECAESolicitar` → CAE + vencimiento; `FECompUltimoAutorizado` para la numeración). Homologación para probar.
- **Qué se factura:** cada venta (ya es una por cobro, y la cuenta compartida ya genera una por persona → una
  factura por parte). En FREE: lo que FREE cobra (reservas, seña online). En PRO: también bar, cuentas y mesas.
  Al prenderla, el club elige automático (cada venta) o a pedido (botón "Facturar" en la venta / el ticket).
- **Tipo de comprobante** según la condición frente al IVA del club: Monotributo → C; Responsable Inscripto → B a
  consumidor final, A a empresas (con CUIT del cliente). Datos del comprador obligatorios arriba del monto que fije
  ARCA (configurable, ARCA lo actualiza).
- **En el comprobante:** CAE y vencimiento, QR de ARCA, "IVA contenido" en la B (Régimen de Transparencia Fiscal al
  Consumidor). Anular una venta facturada = **Nota de Crédito** (no se borra).
- **Técnico:** Function con WSAA + WSFEv1 (SOAP + firma CMS en Node), certificado y clave en Secret Manager, cola con
  reintentos (ARCA se cae), numeración correlativa por punto de venta (transacción), contingencia CAEA para cortes
  largos, alícuotas de IVA por producto / por cancha (21 % por defecto, el contador del club confirma), PDF / ticket
  con QR, listado de comprobantes y exportación en Reportes. Bonus: la misma pieza factura los planes PRO de Padely.
- **Trámites de Padely (una vez):** CUIT propio (monotributo para arrancar, SAS más adelante), Clave Fiscal nivel 3,
  certificados de homologación y producción ("Administración de Certificados Digitales"), asociarlos a wsfe.
- **Trámites de cada club (~15 min, con guía paso a paso en el panel):** Clave Fiscal nivel 3; punto de venta nuevo
  "Factura electrónica – Web Services"; delegar wsfe al CUIT de Padely; cargar en Padely condición frente al IVA,
  punto de venta, razón social, domicilio, IIBB e inicio de actividades.
- **Fuera de alcance:** Ingresos Brutos (provincial, lo sigue liquidando el club); controlador fiscal (no hace falta
  con factura electrónica).
- **Estimación:** ~1,5–2 semanas de desarrollo + homologación, y unos días de prueba real con un club.
- **Riesgo / a confirmar con un contador:** alícuotas, umbral de identificación del comprador, si algún club
  necesita Convenio Multilateral.

### Planes (P3-9) — revisar y mejorar
Sebastián (2026-11-10): "dejémoslo para después, hay que cambiarlo y mejorarlo". Sin cambios hasta definir el nuevo
esquema.

## Follow-ups de P3-17 (mesas, fichaje, mini torneo)
- **QR por mesa** para pedir desde la mesa (rama nueva de `pedidos` sin reserva, página pública, `aceptarPedido` con
  la cuenta de la mesa, barrido de pedidos colgados).
- Mesas: anular una venta puede reabrir una cuenta de mesa sobre una mesa ya ocupada (la grilla muestra "+1 cuenta");
  renombrar una mesa no renombra las cuentas abiertas.
- Fichaje: control de turnos manuales superpuestos; límite de PIN por IP además de por sesión de la PC.
- Mini torneo: limpiar `editores/*` al borrar; validar en el servidor los nombres escritos a mano (hoy no).
- Correr `npm run test:rules` (hace falta instalar Java) para los tests de reglas de P3-17.

## Follow-ups de Profes (flags.profes)
- **Mercado Pago del profe**: hoy el pago online de una clase existe solo cuando cobra el club (con su MP conectado).
  Que el profe conecte su propia cuenta (OAuth como clubes y organizadores, `profes/{uid}/privado/mercadopago`, webhook
  `?profe=`) queda para después.
- Super-admin: pantalla con los avisos de `reportesProfes` (hoy llegan como notificación al dueño del club y al
  super-admin) y con `comisionesClases` (hoy se ven en la consola).
- Cuenta eliminada: las clases futuras donde la persona es alumna no se cancelan solas (el perfil de profe sí se borra).
- Dar de baja a un profe no cancela sus clases futuras en el club (se cancelan a mano desde Profes → Clases).
- Clases de 90 min bloquean 2 horas de cancha (la grilla es por hora); slots de media hora si algún club lo pide.
- Elogios: moderación de comentarios (hoy cualquiera de 200 letras se publica tal cual).
- Correr `npm run test:rules` para los tests de reglas de profes.
