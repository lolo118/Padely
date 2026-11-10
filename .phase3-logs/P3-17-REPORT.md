# P3-17 — Mis reservas, mesas, fichaje y mini torneo

Rama `claude/project-thread-mcb9wp` (sobre dev 09eaf0d). Nada deployado.

| Ítem | Commit | Qué |
| --- | --- | --- |
| 0 | — | La pestaña "Pase" no desapareció: en vivo está (Canchas · Torneos · Info · Pase · Reviews). La captura era del 28/10, antes del Pase. |
| 1 | 0b78707 | "Reservas" en la barra del jugador (escritorio) y botón "Mis reservas" en la página del club. En el teléfono la barra inferior sigue con 4. |
| 2 | 34f3049 (merge 4dad11a) | Mesas: grilla libre/ocupada, cuentas de mesa sin turno, mesa en una cuenta del turno, cambiar de mesa, configuración. |
| 3 | bfc0a5c | Fichaje: empleados con PIN (sin cuenta de Padely), teclado en la caja, QR rotativo para el celular del staff, vista Fichajes, CSV, cierre "sin salida" a las 04:00. |
| 4 | ee2ade6 (merge ada82eb) | Mini torneo en un turno: americano o parejas fijas (round robin, grupos + final, eliminación), automático o manual, link público. Detrás de `flags.miniTorneo` (apagado). |

Chequeos en la rama final: tests de utils 159/159, tests de functions 40/40, `npm run build` OK, reglas compilan (`--dry-run`).
**No corridos:** los tests de reglas con el emulador (falta Java) y las pruebas en el navegador con sesión.

## Deploy (cuando Sebastián lo apruebe)
1. `git push origin claude/project-thread-mcb9wp:dev` → Netlify publica el frontend solo.
2. Enseguida: `.phase3-logs\26-p3-17-deploy.cmd` → reglas de Firestore + functions
   `onCuentaUpdated, cerrarCuentasVencidas, sumarJugador, mpCrearPago` (cambiadas, mesas) y
   `guardarEmpleado, fichar, fichajeQrToken, ficharConQr, editarFichaje, fichajesSinSalida` (nuevas, fichaje).
   Sin secretos nuevos ni índices nuevos. Tras el deploy, probar las callables nuevas: un 403 = falta el invoker público (docs/LANZAMIENTO.md).
3. Mini torneo: Super-admin → Planes → "Mini torneo en el turno" para prenderlo.

## Prueba en vivo
**Navegación**
- [ ] Escritorio: la barra dice Inicio · Canchas · Reservas · Torneos · Perfil. En /club/… aparece "Mis reservas" al lado del nombre.

**Mesas** (como dueño, Bar → Mesas)
- [ ] Configurar mesas → "Agregar varias" 1–6 zona Salón + "Patio 1" zona Patio. La grilla muestra 7 libres y el filtro de zona.
- [ ] Tocar Mesa 3 → "A nombre de: Gómez" → abre la cuenta (tarjeta "Mesa", sin cancha). Agregar 2 productos desde Vender.
- [ ] La grilla muestra Mesa 3 ocupada con el total y los minutos. Dividir entre 2 y cobrar una parte: muestra lo que falta.
- [ ] "Cambiar de mesa" → Mesa 5: la 3 se libera. Mover a una ocupada desde otra tablet → "Esa mesa ya tiene una cuenta abierta".
- [ ] Cobrar el resto: la mesa queda libre; el ticket dice "Cuenta de la mesa · Mesa 5".
- [ ] Una cuenta del turno → "Asignar mesa" → Mesa 1; "Sacar de la mesa" la libera; al cerrar, la reserva queda con la cuenta cerrada como siempre.
- [ ] Al día siguiente (04:00): una mesa abierta sin consumos se anula; con deuda queda abierta y llega el aviso al dueño.
- Pendiente: QR por mesa para pedir desde la mesa (follow-up).

**Fichaje** (como dueño, Bar → Fichajes → Personas)
- [ ] Alta "Juan" con PIN y "Ana" vinculada a encargado@test.com. Un PIN repetido se rechaza.
- [ ] Como cajero: Caja → "Fichar entrada o salida" → PIN de Juan → "Hola Juan · Entrada HH:MM" (hora argentina). Repetir antes de 1 min → "ya fichaste recién"; después → "Salida … · X min".
- [ ] 5 PIN mal → el 6.º intento queda bloqueado unos 5 min.
- [ ] "Con el celular": con la sesión de Ana en el teléfono, escanear el QR → entrada. Pasados 60 s, el QR viejo dice "venció".
- [ ] Fichajes: "Trabajando ahora", horas por día/semana/mes, corregir un turno con nota (aparece en Cambios), borrar otro, exportar CSV.
- [ ] Club FREE: Fichar y Fichajes muestran "Disponible en PRO".

**Mini torneo** (prender el flag primero)
- [ ] Como jugador@test.com con una reserva confirmada futura: Mis reservas → "Armar mini torneo". Automático con 4 → americano de 3 rondas con la estimación y "Entra en el turno".
- [ ] Manual con 8+: parejas fijas, "Al azar" / "Por nivel", partidos por tiempo.
- [ ] Cargar resultados, ver la tabla en vivo, la llave y el podio al final.
- [ ] "Compartir por WhatsApp": el link en incógnito es de solo lectura y muestra solo nombres.
- [ ] "Abrir la carga con link": en incógnito → "Cargar resultados" → cargar uno; "Cerrar la carga" → ese navegador ya no guarda.
- [ ] Un participante de la cuenta (no el dueño) puede armarlo; alguien de afuera recibe "No se puede armar el mini torneo".
- [ ] No cambian puntos, ranking ni Pase. "Borrar mini torneo" funciona.

## Conocido / follow-ups
- Mesas: sin QR por mesa; anular una venta puede reabrir una cuenta de mesa en una mesa ya ocupada (la grilla muestra "+1 cuenta"); renombrar una mesa no renombra las cuentas abiertas.
- Fichaje: no se controlan turnos manuales superpuestos; el límite de PIN es por sesión de la PC, no por IP.
- Mini torneo: los nombres escritos a mano no se validan; quedan docs `editores` viejos al borrar (inofensivos).
