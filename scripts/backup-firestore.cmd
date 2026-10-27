@echo off
setlocal
rem Backup de Firestore (P3-15): exporta TODA la base a gs://padely-dev-backups/AAAA-MM-DD_HHMM. No borra nada.
rem Requisitos (una vez, ver docs/STAGING.md "Backups"): gcloud instalado y logueado (gcloud auth login), el bucket
rem creado (gsutil mb -l us-central1 gs://padely-dev-backups) y el proyecto en Blaze. Restaurar:
rem   gcloud firestore import gs://padely-dev-backups/<carpeta> --project padely-dev   (pisa los documentos con el mismo id)
rem Uso: scripts\backup-firestore.cmd [proyecto] [bucket]
set PROYECTO=%~1
if "%PROYECTO%"=="" set PROYECTO=padely-dev
set BUCKET=%~2
if "%BUCKET%"=="" set BUCKET=gs://%PROYECTO%-backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set FECHA=%%i
echo Exportando Firestore de %PROYECTO% a %BUCKET%/%FECHA% ...
call gcloud firestore export "%BUCKET%/%FECHA%" --project %PROYECTO% --async
if errorlevel 1 (
  echo FALLO el export. Revisa gcloud auth login, que el bucket exista y que la cuenta tenga rol "Cloud Datastore Import Export Admin".
  exit /b 1
)
echo Listo: el export corre en segundo plano. Seguilo con: gcloud firestore operations list --project %PROYECTO%
exit /b 0
