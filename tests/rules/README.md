# Tests de reglas (P3-13)

`npm run test:rules` levanta el emulador de Firestore (proyecto de demo `demo-padely`, nada toca padely-dev) y corre
`tests/rules/*.test.mjs` contra `firestore.rules`.

Requisito: **Java 11+** en el PATH (el emulador de Firestore es Java). En Windows: instalar un JDK (por ejemplo
Temurin 21) y abrir una terminal nueva. La primera corrida descarga el emulador (~60 MB) a `~/.cache/firebase`.

Qué cubre: privacidad (cuentas, contactos de reservas, privado/*, superadmins), dueño vs staff y planes (plan y
mercadoPago no los escribe el club, un club FREE no abre caja ni crea productos ni invita staff, un club de antes sí),
consumos de cuentas con pagos, organizadores suspendidos, límites de frecuencia y el aviso de estado.

Los tests se escribieron sin poder correrlos (en la PC de desarrollo no había Java el 27/10): la primera corrida puede
pedir ajustes en los datos sembrados, no necesariamente en las reglas.
