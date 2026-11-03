@echo off
setlocal
rem P3-16f: SOLO mpWebhook. Los cobros del Pase llegan como "payment" sin ?club=: se procesan por la cuenta de MP que cobro. ~2 min.
rem El codigo esta en GitHub (origin/dev): este script trae dev con fast-forward y despues deploya. Si dev local tiene commits
rem propios que no estan en origin, el pull falla y no se deploya nada (avisar a Claude).
rem Tras cualquier corte del deploy, probar las callables nuevas (403 = falta el invoker publico, ver docs/LANZAMIENTO.md).
rem La CLI aborta si el codigo de functions tarda mas de 10 s en cargar
set FUNCTIONS_DISCOVERY_TIMEOUT=120
cd /d "%~dp0.."
set LOG=.phase3-logs\23-p3-16f-deploy.log
set LOCK=.phase3-logs\deploy.lock
rem Lock de deploy (incidente 2026-10-22: dos CLIs a la vez se pisaron con 409). Si hay un lock de menos de 30 min, no arranca.
powershell -NoProfile -Command "if ((Test-Path '%LOCK%') -and (((Get-Date) - (Get-Item '%LOCK%').LastWriteTime).TotalMinutes -lt 30)) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo Ya hay un deploy en curso: %LOCK% tiene menos de 30 min >> "%LOG%"
  echo Ya hay un deploy en curso
  exit /b 1
)
echo %DATE% %TIME% > "%LOCK%"
echo ==== P3-16f (mpWebhook: cobros del Pase como payment) ==== > "%LOG%"
echo Inicio: %DATE% %TIME% >> "%LOG%"
echo [0/4] git: rama dev al dia con origin/dev (solo fast-forward) >> "%LOG%"
call git checkout dev >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO git checkout dev >> "%LOG%"
  goto fallo
)
call git pull --ff-only origin dev >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO git pull --ff-only origin dev: dev local no es un ancestro de origin/dev >> "%LOG%"
  goto fallo
)
git log --oneline -1 >> "%LOG%" 2>&1
rem [1/4] Los secretos tienen que existir ANTES de deployar (las functions los declaran). El valor va a NUL: nunca al log.
echo [1/4] secretos MP_CLIENT_SECRET y MP_WEBHOOK_SECRET >> "%LOG%"
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
echo [2/4] node functions/sync-utils.mjs + npm --prefix functions install >> "%LOG%"
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
echo [3/4] tests de functions (node --test) >> "%LOG%"
pushd functions
call node --test mercadopago.test.js >> "..\%LOG%" 2>&1
set TESTS=%ERRORLEVEL%
popd
if not "%TESTS%"=="0" (
  echo FALLO tests de functions >> "%LOG%"
  goto fallo
)
echo [4/4] firebase deploy --only functions:mpWebhook >> "%LOG%"
call npx firebase deploy --only functions:mpWebhook --project padely-dev --non-interactive >> "%LOG%" 2>&1
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
