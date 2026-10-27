# Staging y producción

Hoy Padely corre en **un solo proyecto**: `padely-dev` (Firebase) + `padely.netlify.app` (Netlify, rama `dev`). Sirve
para probar, pero antes de cobrarle a clubes reales conviene separar staging de producción para que un deploy de prueba
no toque datos de clubes que pagan.

## Propuesta

| | Staging | Producción |
|---|---|---|
| Firebase | `padely-dev` (el actual) | `padely-prod` (nuevo, plan Blaze) |
| Rama | `dev` | `main` |
| Netlify | `dev--padely.netlify.app` (branch deploy) | `padely.com.ar` (o el dominio que elijas) |
| Mercado Pago | credenciales de **prueba** (usuarios TEST) | credenciales **productivas** de la app de Padely |
| Datos | clubes de prueba, se pueden ensuciar | solo clubes reales |

## Pasos para crear producción (una vez)

1. **Firebase**: crear `padely-prod` en la consola, activar Blaze, Authentication (Email/Contraseña + anónimo), Firestore
   (región `southamerica-east1` o `us-central1`: la misma que `REGION` en `functions/index.js`), Storage.
2. `.firebaserc`: sumar el alias
   ```json
   { "projects": { "default": "padely-dev", "prod": "padely-prod" } }
   ```
3. **Secretos** en prod (nunca en archivos ni logs):
   `npx firebase functions:secrets:set MP_CLIENT_SECRET --project padely-prod` (y `MP_WEBHOOK_SECRET`, más los demás
   que pida el deploy).
4. **Netlify**: un segundo sitio (o el mismo con contexto `production` en `main`) con las `VITE_FIREBASE_*` de prod,
   `VITE_SENTRY_DSN`, `VITE_EMAIL_CONTACTO`, `VITE_WHATSAPP_CONTACTO`. Ver `.env.example`.
5. **Mercado Pago**: en la app de Padely (developers), cargar la URL de redirect de OAuth y la del webhook de prod
   (`https://us-central1-padely-prod.cloudfunctions.net/...`), con las credenciales productivas.
6. **Deploy** a prod: los scripts de `.phase3-logs` usan `--project padely-dev`; para prod se corre lo mismo con
   `--project padely-prod` (conviene un script aparte, `deploy-prod.cmd`, que pida confirmación).
7. **Super-admin**: crear el documento `superadmins/{tu uid}` en prod (desde la consola) y los datos de cobro (Planes → Datos de pago).
8. Probar de punta a punta con un club propio antes de invitar a nadie.

## Backups

`scripts\backup-firestore.cmd [proyecto] [bucket]` exporta toda la base a un bucket (no borra nada).

Una vez por proyecto:

```
gcloud auth login
gsutil mb -l us-central1 gs://padely-dev-backups
```

**Semanal automático** (recomendado en prod): Cloud Scheduler llamando al export de Firestore.

```
gcloud scheduler jobs create http firestore-backup-semanal --project padely-prod --location us-central1 ^
  --schedule "0 5 * * 1" --time-zone "America/Argentina/Buenos_Aires" ^
  --uri "https://firestore.googleapis.com/v1/projects/padely-prod/databases/(default):exportDocuments" ^
  --http-method POST --message-body "{\"outputUriPrefix\":\"gs://padely-prod-backups\"}" ^
  --oauth-service-account-email padely-prod@appspot.gserviceaccount.com
```

La cuenta de servicio necesita el rol **Cloud Datastore Import Export Admin** y escritura en el bucket. Para no pagar
de más, poné en el bucket una regla de ciclo de vida que borre exports de más de 60 días.

Restaurar: `gcloud firestore import gs://<bucket>/<carpeta> --project <proyecto>` (pisa documentos con el mismo id; probalo
primero en staging).
