# Bot de reservas por WhatsApp

Cada club atiende reservas en **su propio número** de WhatsApp. El bot usa la WhatsApp Cloud API de Meta y está detrás de `configuracionPadely/flags.whatsappBot` (apagado por defecto; se prende en Super-admin → Planes → Funciones de la plataforma).

Esta versión (v1) se puede probar de punta a punta con el **número de prueba gratis de Meta**, antes de la verificación del negocio y de ser Tech Provider.

## Cómo funciona

```
Cliente ──WhatsApp──▶ Meta ──POST firmado──▶ waWebhook ──guarda 1 vez──▶ whatsappMensajes/{sha256(wamid)}
                                                                                 │ (trigger)
                                                                                 ▼
                         Graph API ◀── sender ◀── motor (estado en clubs/{c}/whatsappChats/{hash}) ── waProcesarMensaje
```

- **waWebhook** (`onRequest`):
  - GET verifica la suscripción (`hub.mode`, `hub.verify_token`, `hub.challenge`).
  - POST valida `X-Hub-Signature-256`: HMAC-SHA256 de `req.rawBody` con el app secret. Si la firma falla, responde 401.
  - Rutea por `metadata.phone_number_id` → `whatsappNumeros/{id}.clubId`. Ignora los números sin conexión y todo si el flag está apagado.
  - Guarda cada mensaje **una sola vez** por id (idempotencia ante los reintentos de Meta) y responde 200 enseguida.
  - Si Firestore no puede guardar, responde 500 para que Meta reintente; lo ya guardado no se repite.
- **waProcesarMensaje** (trigger sobre `whatsappMensajes`): corre la conversación (`functions/whatsapp/motor.js`). Los errores quedan en el log y en el documento (`estado: "error"`).
- Estados de entrega (sent/delivered/read): se ignoran.

### La conversación

1. Saludo: "¡Hola! Bienvenido a <club>…", con los comandos disponibles.
2. Día: botones Hoy / Mañana / Otro día. "Otro día" muestra una lista con los días que permite `diasAnticipacion` (7 por defecto).
3. Horario: lista con los turnos libres de la **grilla real**. Se calcula con `src/utils/disponibilidad.js`, el mismo criterio que la grilla pública y copiado a `functions/lib`. La lista muestra 8 horarios por página, "Ver más" y "Cambiar día" (máximo 10 filas).
4. Cancha, si hay más de una libre a esa hora.
5. Duración (1 h … `maxTurnosPorReserva`), si el club deja más de 1 h y las horas siguientes están libres.
6. Nombre, si no lo sabemos. Ofrece un botón con el nombre del perfil de WhatsApp.
7. Resumen: precio con `tarifas.js`, seña con `calcularSeña`, y los botones Confirmar / Cambiar / Cancelar.
8. Confirmar crea la reserva. Hay tres casos:
   - **Seña > 0 y el club tiene Mercado Pago**: la reserva queda `pendiente` con `waRetencionHasta` (20 min) y el bot manda el botón "Pagar la seña". El link sale del **mismo** helper que `mpCrearPago` (`crearPreferenciaMp`).
     - Cuando MP aprueba, `mpWebhook` → `aplicarPagoAprobado` pasa la reserva a `confirmada` (lo de siempre) y `waAvisarSeñaPagada` manda la confirmación por WhatsApp más el link "Sumar a Padely".
     - Si no se paga, `waLiberarReservas` (cada 10 min) cancela el turno, da por vencido el pago pendiente en la misma transacción y avisa por WhatsApp. Un pago que llega tarde sigue el camino de "pago tardío" que ya existe.
   - **Sin seña, o el club no tiene MP**: la reserva queda `confirmada` (o `pendiente` si el club confirma a mano, `reservaDirecta: false`). Si hay seña, se paga en el club.
   - Si otro jugador ganó el turno mientras tanto, el bot avisa y vuelve a mostrar los horarios libres.
9. Una conversación que pasa **30 min** sin actividad vuelve a empezar.

### Comandos

Se pueden escribir en cualquier momento:

- **cancelar**:
  - En medio del armado, corta el armado.
  - Con una seña esperando pago, libera ese turno.
  - Si no hay nada en curso, lista las reservas próximas del teléfono hechas por el bot. Antes de confirmar avisa qué pasa con la seña según la política del club (`resolverSeñaCancelada`). La cancelación usa `canceladaPor: "jugador"`, así que `onReservaUpdated` aplica la política como en la web.
- **mis reservas**: las próximas de ese teléfono en ese club.
- **hablar con el club**: avisa al dueño y al staff con `gestionarReservas` (campana). El bot queda en pausa en ese chat por `clubs/{c}.whatsappBot.horasPausa` horas (12 por defecto).
- **Coexistencia**: si alguien del club escribe desde la app WhatsApp Business (webhook `smb_message_echoes`), el bot también se pausa en ese chat.

### Reglas del club que respeta

- Anticipación máxima: `diasAnticipacion`.
- Horarios: `horariosDisponibles` de cada cancha.
- Ocupado: turnos fijos y reservas vivas de cualquier tipo (jugador, club, torneo, clase).
- Hoy no se ofrecen la hora en curso ni las anteriores.
- `maxTurnosPorReserva`, `reservaDirecta`, `seña`, `politicaSeña` y club suspendido.
- Límite de frecuencia: el mismo de la web (`limites.js`, 5 reservas cada 10 min), guardado en el chat.
- Máximo **4 reservas próximas por teléfono**.
- Los descuentos del Pase **no** se aplican en v1: el invitado no tiene cuenta.

## Datos

| Dónde | Qué | Quién lee |
| --- | --- | --- |
| `clubs/{c}/privado/whatsapp` | `{ phoneNumberId, wabaId, tokenRef, estado, conectadoEn, conectadoPor, numeroVisible, nombreVerificado, metodo }`. `tokenRef` es el token **cifrado** (AES-256-GCM, clave derivada de `WA_TOKEN_KEY`) | Solo Functions |
| `whatsappNumeros/{phoneNumberId}` | Índice multi-club: `{ clubId, clubNombre, wabaId, estado, numeroVisible, conectadoEn }` | Super-admin (formulario) |
| `whatsappMensajes/{sha256(wamid)}` | Cada mensaje y eco una vez: `{ tipo, id, clubId, waId, texto, opcionId, estado, resultado }`. TTL en `expiraEn` (7 días) | Solo Functions |
| `clubs/{c}/whatsappChats/{hash}` | La conversación: `{ paso, datos, nombre, waId, pausadoHasta, limite, uidVinculado, actualizadoEn, expiraEn }`. `hash` = HMAC del teléfono con `WA_TOKEN_KEY` | Solo Functions |
| `clubs/{c}/reservas/{slotId}` | Como cualquier reserva, más `origen: "whatsapp"`, `waHash`, `telefonoMascara` ("+549 ••• 1234") y `waRetencionHasta`. Sin `jugadorUid` hasta que se vincula | Como hoy (todos con sesión) |
| `clubs/{c}/contactosReservas/{slotId}` | El teléfono entero (`+549…`) y `origen: "whatsapp"` | Quien gestiona reservas (como hoy) |

Las reglas (`firestore.rules`):

- Cierran `whatsappMensajes`, `whatsappChats` y `privado/whatsapp` a todos los clientes.
- Dejan leer `whatsappNumeros` solo al super-admin.
- Con `reservaBotIntacta()`, impiden que un cliente cree una reserva marcada `origen: "whatsapp"` / `waHash` o que cambie esa marca. Pisar un turno del bot cancelado sigue permitido.

Las reservas del bot aparecen en la grilla del club como cualquier otra: nombre del jugador, sin `jugadorUid`.

**Sumar a una cuenta**: la confirmación trae un link firmado: `/whatsapp/vincular?c=<club>&h=<hash>&v=<vence>&s=<firma>`, que vence a los 30 días.

- La página pide entrar o crear la cuenta y llama a `waVincularReservas`.
- Esa función pone el `jugadorUid` en las reservas próximas de ese teléfono en ese club y en sus contactos. También guarda `uidVinculado` en el chat, así las próximas reservas por WhatsApp nacen en la cuenta.
- No existe verificación de teléfono en Padely; por eso el link va firmado.

### Functions y secretos

| Function | Tipo | Secretos |
| --- | --- | --- |
| `waWebhook` | onRequest (URL para Meta) | `WA_APP_SECRET`, `WA_VERIFY_TOKEN` |
| `waProcesarMensaje` | onDocumentCreated `whatsappMensajes/{id}` | `WA_TOKEN_KEY`, `MP_CLIENT_SECRET` |
| `waConectarClub` | onCall (super-admin) | `WA_TOKEN_KEY` |
| `waDesconectarClub` | onCall (super-admin) | — |
| `waVincularReservas` | onCall (jugador con cuenta) | `WA_TOKEN_KEY` |
| `waLiberarReservas` | onSchedule, cada 10 min | `WA_TOKEN_KEY` |

Cambios en Functions que ya existían:

- `mpCrearPago` ahora llama a `crearPreferenciaMp`, el mismo código movido a un helper.
- `mpWebhook` → `aplicarPagoLeido` avisa por WhatsApp cuando se paga la seña de una reserva del bot.

**Secretos nuevos** (Secret Manager; cargarlos antes del deploy):

- `WA_APP_SECRET`: el *App secret* de la app de Meta (App settings → Basic).
- `WA_VERIFY_TOKEN`: un texto al azar que vos elegís. Es el mismo que se pone en la configuración del webhook en Meta.
- `WA_TOKEN_KEY`: un texto al azar largo (32+ caracteres). Cifra los tokens, arma el hash del teléfono y firma el link. **No se cambia después**: si cambia, los tokens guardados no se pueden descifrar (hay que reconectar los números), los chats empiezan de cero y los links viejos dejan de servir.

```
npx firebase functions:secrets:set WA_APP_SECRET --project padely-dev
npx firebase functions:secrets:set WA_VERIFY_TOKEN --project padely-dev
npx firebase functions:secrets:set WA_TOKEN_KEY --project padely-dev
```

La Graph API está fija en **v26.0** (`functions/whatsapp/graph.js`, `GRAPH_API_VERSION`). Salió el 2026-07-29 según https://developers.facebook.com/docs/graph-api/changelog/versions (consultado el 2026-11-11). El changelog menciona una v27.0 sin fecha ni notas; revisarla antes de subir la versión.

## Lo que tiene que hacer Sebastián en Meta (número de prueba)

1. **Portfolio comercial**: en https://business.facebook.com crear (o usar) el portfolio de Padely.
2. **App de desarrollador**: en https://developers.facebook.com/apps → Crear app → tipo *Business*, ligada al portfolio. Agregar el producto **WhatsApp**. Meta crea una cuenta de WhatsApp Business de prueba con un **número de prueba gratis**.
3. **Destinatarios de prueba**: en WhatsApp → *API Setup*, en "To", agregar tu celular y verificarlo con el código. El número de prueba solo puede escribir a destinatarios verificados. Guías de terceros hablan de hasta 5; Meta no lo dice en la página actual.
4. Anotar el **Phone number ID** y el **WhatsApp Business Account ID** (los dos están en API Setup).
5. **Token**:
   - *Temporal*: el que muestra API Setup. Dura ~24 h; sirve para una prueba rápida.
   - *Permanente (recomendado)*:
     1. Business settings → Users → **System users** → Agregar (Admin).
     2. *Assign assets*: la app (Full control) y la cuenta de WhatsApp.
     3. *Generate token*: elegir la app y la expiración más larga que ofrezca (sin vencimiento, si aparece la opción).
     4. Permisos: `business_management`, `whatsapp_business_management` y `whatsapp_business_messaging`.

     Ver https://developers.facebook.com/docs/whatsapp/access-tokens
6. **App secret → Secret Manager**: App settings → Basic → App secret → `WA_APP_SECRET`. Elegir un verify token → `WA_VERIFY_TOKEN`, y `WA_TOKEN_KEY`. Ver los comandos de arriba.
7. **Deploy** de reglas, índices (TTL de `whatsappMensajes`) y functions, con un script `.phase3-logs\NN-whatsapp-deploy.cmd` que verifique que existan los tres secretos.
8. **Webhook**: en WhatsApp → *Configuration* → Webhook → Edit:
   - Callback URL: la URL de `waWebhook`. Sale en el log del deploy, algo como `https://wawebhook-xxxxx-uc.a.run.app`.
   - Verify token: el valor de `WA_VERIFY_TOKEN`.
   - Meta hace el GET de verificación; tiene que quedar en verde.
9. **Campos del webhook**: suscribirse a **`messages`**. Para coexistencia (más adelante) también a **`smb_message_echoes`**, `smb_app_state_sync` y `history`.
10. **Conectar el número a un club**: en Padely, Super-admin → Planes → **WhatsApp de los clubes**. Elegir el club, pegar Phone number ID, WABA ID y el token → *Conectar número*.
    - `waConectarClub` valida el token contra Meta (`GET /{phone-number-id}`) y suscribe la app a la WABA (`POST /{waba-id}/subscribed_apps`).
    - Después guarda el token cifrado y crea el índice.
11. **Prender el flag**: Super-admin → Planes → Funciones de la plataforma → *Bot de reservas por WhatsApp*.
12. **Probar**: desde tu celular (destinatario verificado), escribí "hola" al número de prueba.
    - Para la seña con MP, el club tiene que tener Mercado Pago conectado (cuentas de prueba de MP) y una seña configurada.
    - El link de MP se abre mejor en una ventana de incógnito (ver handoff).

Sin Meta se puede probar todo con el simulador:

```
node functions/sync-utils.mjs
node functions/whatsapp/simular.js
```

Usa un club y una grilla en memoria. Los comandos son `/pagar`, `/eco`, `/mas 31`, `/reservas`, `/estado` y `/salir`.

## Para otros clubes: verificación, Tech Provider y Embedded Signup

El número de prueba solo escribe a destinatarios verificados. Para que cada club conecte **su** número:

1. **Verificación del negocio** de Padely en el portfolio (Security Center).
2. **Tech Provider**: https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers (consultado el 2026-11-11).
   - App Review con **Advanced Access** a `whatsapp_business_messaging` y `whatsapp_business_management`.
   - Dos videos: uno con un mensaje enviado desde la app y recibido en WhatsApp, y otro creando una plantilla.
3. **Embedded Signup**: el botón "Conectar WhatsApp" para el dueño del club, en Configuración. Abre Facebook Login for Business con el `config_id` de Embedded Signup. El `code` que vuelve se canjea por un token de *Business Integration System User*.
   - **El enganche ya está**: en `functions/index.js`, sección "BOT DE RESERVAS POR WHATSAPP", el comentario FUTURO.
   - Una callable nueva (`waCanjearCodigo`) canjea el código y llama a `guardarConexionWa({ clubId, phoneNumberId, wabaId, token, por })`, la misma que usa hoy el formulario del super-admin. El webhook, el índice y el motor no cambian.

## Coexistencia (app WhatsApp Business + Cloud API en el mismo número)

Fuente: https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users (consultado el **2026-11-11**).

- **Requisitos**:
  - App WhatsApp Business **2.24.17** o más nueva.
  - Ser **Solution Partner o Tech Provider**.
  - Webhooks andando.
  - Embedded Signup con *session logging*. Guías de terceros dicen que se usa `featureType: whatsapp_business_app_onboarding`; no lo confirmé en la página de Meta.
- **Límites**:
  - 20 mensajes por segundo fijos.
  - Los grupos no se sincronizan.
  - No se pueden crear listas de difusión nuevas.
  - Lo que se manda desde la app sigue gratis; lo que manda la API se cobra.
- **Argentina (+54)**: **no lo pude confirmar con una frase explícita de Meta.**
  - La página actual ya no tiene la lista de países no soportados y no menciona Argentina.
  - Copias de marzo de 2026 de esa página (de terceros) listaban como no soportados solo Nigeria y Sudáfrica.
  - Proveedores dicen que desde abril de 2026 es global.
  - Lectura más probable: +54 está soportado. Hay que verificarlo al hacer el primer onboarding real.
- El bot ya escucha `smb_message_echoes` y se pausa en el chat cuando alguien del club responde desde la app. Payload según Meta: `value.message_echoes[]` con `from` (el negocio), `to` (el cliente), `id`, `timestamp`, `type`, `text`.

## Costos (Argentina)

Fuentes, consultadas el 2026-11-11:

- https://developers.facebook.com/docs/whatsapp/pricing
- https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing
- La planilla oficial "Tarifas en USD", vigente desde el 2026-10-01. Está enlazada desde *Rate cards* en esa misma página.

**Verificalo contra la rate card oficial de Meta antes de presupuestar**: cambia seguido, y sitios de terceros publican valores viejos (por ejemplo 0,0711 / 0,0299).

- Se cobra **por mensaje entregado**, según la categoría y el país del destinatario.
- **Desde el 2026-10-01**:
  - Los mensajes de servicio (respuestas libres dentro de la ventana de 24 h, como los de este bot) se cobran, con **1.000 gratis por mes y por número**.
  - Las plantillas utility dentro de la ventana también se cobran (antes eran gratis).
  - Hace falta un medio de pago cargado en la cuenta de WhatsApp.
- Rate card, fila Argentina (USD por mensaje):

| Categoría | USD |
| --- | --- |
| Marketing | 0,0618 |
| Utility | 0,026 |
| Authentication | 0,026 |
| Service (después de los 1.000 gratis) | 0,026 |

- Una reserva típica por el bot son unos 6 a 8 mensajes de servicio. Un club chico entra en los 1.000 gratis.
- Con coexistencia, lo que el club manda desde la app sigue gratis.

## Plantillas a pedir más adelante (v1 no las usa)

En v1 el bot solo responde **dentro de la ventana de 24 h** que abre el mensaje del cliente: mensajes libres e interactivos, sin plantillas. Para avisar fuera de la ventana hay que pedir plantillas *utility* en el WhatsApp Manager del club (o vía API una vez que seamos Tech Provider):

1. **Confirmación fuera de la ventana** (`reserva_confirmada`): "Tu reserva en {{club}} quedó confirmada: {{cancha}} · {{día}} {{hora}}. Seña pagada: $ {{monto}}." Con un botón URL "Sumar a Padely".
   - Sirve para cuando la seña se paga más de 24 h después del último mensaje del cliente, o cuando el club confirma a mano una reserva pendiente. Hoy `notificarSeñaPagada` devuelve "fuera de la ventana" y solo queda el log.
2. **Recordatorio 2 h antes** (`recordatorio_turno`): "Te esperamos hoy a las {{hora}} en {{club}} ({{cancha}}). Si no podés venir, respondé *cancelar*."
   - Necesita un barrido programado nuevo.
3. Opcional: **reserva cancelada por el club** (`reserva_cancelada_club`) y **turno liberado por seña sin pagar** fuera de la ventana.

## Pendientes conocidos (v1)

- Mensajes del mismo chat que llegan casi juntos (dos toques rápidos) se procesan en paralelo: el último gana el estado del chat. Si molesta, agregar un lock por chat (transacción sobre `whatsappChats`).
- `ClubPublico.jsx` todavía calcula la grilla con su propio código. `src/utils/disponibilidad.js` tiene el mismo criterio (testeado). Mover la página a usar el util quedó para cuando termine el trabajo en paralelo sobre esa página (Profes).
- Cuando el club confirma a mano una reserva pendiente del bot (`reservaDirecta: false`), hoy no se avisa por WhatsApp. Agregarlo en `onReservaUpdated` (dentro de la ventana) o con la plantilla de confirmación.
- Crédito de seña para un invitado sin cuenta: `procesarSeñaCancelada` lo marca `sinCuenta` y avisa al dueño para resolverlo a mano. El bot le dice al cliente que el club se va a comunicar.
