@echo off
setlocal
rem P3-16b: Pase Club (suscripcion de Mercado Pago con debito automatico, puntos y niveles Bronce/Plata/Oro, equipo).
rem Acumulado sobre 18 (29/10 12:03): reglas + indices + Storage + functions (63: +mpSuscribirPase, mpCancelarPase, onPaseEscrito, onVentaPuntosPase, onVentaAnuladaPuntosPase).
rem Tras cualquier corte del deploy, probar las callables nuevas (403 = falta el invoker publico, ver docs/LANZAMIENTO.md).
rem La CLI aborta si el codigo de functions tarda mas de 10 s en cargar
set FUNCTIONS_DISCOVERY_TIMEOUT=120
cd /d "%~dp0.."
set LOG=.phase3-logs\19-p3-16b-deploy.log
set LOCK=.phase3-logs\deploy.lock
rem Lock de deploy (incidente 2026-10-22: dos CLIs a la vez se pisaron con 409). Si hay un lock de menos de 30 min, no arranca.
powershell -NoProfile -Command "if ((Test-Path '%LOCK%') -and (((Get-Date) - (Get-Item '%LOCK%').LastWriteTime).TotalMinutes -lt 30)) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo Ya hay un deploy en curso: %LOCK% tiene menos de 30 min >> "%LOG%"
  echo Ya hay un deploy en curso
  exit /b 1
)
echo %DATE% %TIME% > "%LOCK%"
echo ==== P3-16b (membresias MP): deploy de reglas + indices (Firestore) + Storage + functions (padely-dev) ==== > "%LOG%"
echo Inicio: %DATE% %TIME% >> "%LOG%"
git log --oneline -1 >> "%LOG%" 2>&1
rem [0/3] Los secretos tienen que existir ANTES de deployar (las functions los declaran). El valor va a NUL: nunca al log.
echo [0/3] secretos MP_CLIENT_SECRET y MP_WEBHOOK_SECRET >> "%LOG%"
call npx firebase functions:secrets:access MP_CLIENT_SECRET --project padely-dev > NUL 2>&1
if errorlevel 1 (
  echo Falta el secreto MP_CLIENT_SECRET: corre npx firebase functions:secrets:set MP_CLIENT_SECRET --project padely-dev >> "%LOG%"
  echo Falta el secreto MP_CLIENT_SECRET: corre npx firebase functions:secrets:set MP_CLIENT_SECRET --project padely-dev
  goto fallo
)
call npx firebase functions:secrets:access MP_WEBHOOK_SECRET --project padely-dev > NUL 2>&1
if errorlevel 1 (
  echo Falta el secreto MP_WEBHOOK_SECRET: corre npx firebase functions:secrets:set MP_WEBHOOK_SECRET --project padely-dev >> "%LOG%"
  echo Falta el secreto MP_WEBHOOK_SECRET: corre npx firebase functions:secrets:set MP_WEBHOOK_SECRET --project padely-dev
  goto fallo
)
echo OK secretos presentes (valores no registrados) >> "%LOG%"
echo [1/3] node functions/sync-utils.mjs + npm --prefix functions install >> "%LOG%"
call node functions\sync-utils.mjs >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO sync-utils >> "%LOG%"
  goto fallo
)
call npm --prefix functions install --no-audit --no-fund >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO npm install en functions >> "%LOG%"
  goto fallo
)
echo [2/3] firebase deploy --only firestore,storage >> "%LOG%"
call npx firebase deploy --only firestore,storage --project padely-dev --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO el deploy de reglas >> "%LOG%"
  goto fallo
)
echo [3/3] firebase deploy --only functions >> "%LOG%"
call npx firebase deploy --only functions --project padely-dev --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO el deploy de functions >> "%LOG%"
  goto fallo
)
echo OK reglas + functions >> "%LOG%"
echo Fin: %DATE% %TIME% >> "%LOG%"
del "%LOCK%" 2>nul
exit /b 0
:fallo
echo Fin: %DATE% %TIME% >> "%LOG%"
del "%LOCK%" 2>nul
exit /b 1
