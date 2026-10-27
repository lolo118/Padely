@echo off
setlocal
rem P3-8c: fixes tras C-P3-8b (un pago de MP crea venta una sola vez, mpAnularVenta sinDevolucion,
rem barrido de las 04:00 que no anula cuentas con pagos, log de notificaciones legacy). Solo functions:
rem las reglas y los indices no cambiaron.
rem La CLI aborta si el codigo de functions tarda mas de 10 s en cargar
set FUNCTIONS_DISCOVERY_TIMEOUT=120
cd /d "%~dp0.."
set LOG=.phase3-logs\12-fixes-p3-8c-deploy.log
set LOCK=.phase3-logs\deploy.lock
rem Lock de deploy (incidente 2026-10-22: dos CLIs a la vez se pisaron con 409). Si hay un lock de menos de 30 min, no arranca.
powershell -NoProfile -Command "if ((Test-Path '%LOCK%') -and (((Get-Date) - (Get-Item '%LOCK%').LastWriteTime).TotalMinutes -lt 30)) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo Ya hay un deploy en curso: %LOCK% tiene menos de 30 min >> "%LOG%"
  echo Ya hay un deploy en curso
  exit /b 1
)
echo %DATE% %TIME% > "%LOCK%"
echo ==== P3-8c: deploy de functions (padely-dev) ==== > "%LOG%"
echo Inicio: %DATE% %TIME% >> "%LOG%"
git log --oneline -1 >> "%LOG%" 2>&1
rem [0/2] Los secretos tienen que existir ANTES de deployar (las functions los declaran). El valor va a NUL: nunca al log.
echo [0/2] secretos MP_CLIENT_SECRET y MP_WEBHOOK_SECRET >> "%LOG%"
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
echo [1/2] node functions/sync-utils.mjs + npm --prefix functions install >> "%LOG%"
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
echo [2/2] firebase deploy --only functions >> "%LOG%"
call npx firebase deploy --only functions --project padely-dev --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO el deploy de functions >> "%LOG%"
  goto fallo
)
echo OK functions >> "%LOG%"
echo Fin: %DATE% %TIME% >> "%LOG%"
del "%LOCK%" 2>nul
exit /b 0
:fallo
echo Fin: %DATE% %TIME% >> "%LOG%"
del "%LOCK%" 2>nul
exit /b 1
