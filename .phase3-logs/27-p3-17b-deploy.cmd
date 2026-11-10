@echo off
setlocal
rem P3-17b: SOLO reglas de Firestore (mini torneo: formatos americanoParejas y rey, tercerPuesto, minimo 6 jugadores pares). ~1 min.
rem El frontend NO va aca: Netlify lo publica solo al pushear dev (este script necesita ese push antes). Correrlo apenas
rem se pushea: hasta que terminen las reglas, crear un mini torneo con los formatos nuevos da "sin permiso".
rem El codigo esta en GitHub (origin/dev): este script trae dev con fast-forward y despues deploya. Si dev local tiene commits
rem propios que no estan en origin, el pull falla y no se deploya nada (avisar a Claude).
rem Tras cualquier corte del deploy, probar las callables nuevas (403 = falta el invoker publico, ver docs/LANZAMIENTO.md).
rem La CLI aborta si el codigo de functions tarda mas de 10 s en cargar
set FUNCTIONS_DISCOVERY_TIMEOUT=120
cd /d "%~dp0.."
set LOG=.phase3-logs\27-p3-17b-deploy.log
set LOCK=.phase3-logs\deploy.lock
rem Lock de deploy (incidente 2026-10-22: dos CLIs a la vez se pisaron con 409). Si hay un lock de menos de 30 min, no arranca.
powershell -NoProfile -Command "if ((Test-Path '%LOCK%') -and (((Get-Date) - (Get-Item '%LOCK%').LastWriteTime).TotalMinutes -lt 30)) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo Ya hay un deploy en curso: %LOCK% tiene menos de 30 min >> "%LOG%"
  echo Ya hay un deploy en curso
  exit /b 1
)
echo %DATE% %TIME% > "%LOCK%"
echo ==== P3-17b (mini torneo: solo reglas) ==== > "%LOG%"
echo Inicio: %DATE% %TIME% >> "%LOG%"
echo [0/5] git: rama dev al dia con origin/dev (solo fast-forward) >> "%LOG%"
rem Primero se adelanta la rama dev LOCAL a origin/dev sin tocar los archivos (incidente 2026-11-10: el checkout de un dev
rem viejo borro este mismo .cmd mientras corria). Solo fast-forward: si dev local tiene commits propios, no sigue.
call git fetch origin dev >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO git fetch origin dev >> "%LOG%"
  goto fallo
)
call git merge-base --is-ancestor dev origin/dev >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO dev local no es un ancestro de origin/dev >> "%LOG%"
  goto fallo
)
set RAMA=
for /f %%b in ('git branch --show-current') do set RAMA=%%b
if not "%RAMA%"=="dev" call git branch -f dev origin/dev >> "%LOG%" 2>&1
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
rem [1/5] Los secretos tienen que existir ANTES de deployar (las functions los declaran). El valor va a NUL: nunca al log.
echo [1/5] secretos MP_CLIENT_SECRET y MP_WEBHOOK_SECRET >> "%LOG%"
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
echo [2/5] node functions/sync-utils.mjs + npm --prefix functions install >> "%LOG%"
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
echo [3/5] tests de functions (node --test) >> "%LOG%"
pushd functions
call npm test >> "..\%LOG%" 2>&1
set TESTS=%ERRORLEVEL%
popd
if not "%TESTS%"=="0" (
  echo FALLO tests de functions >> "%LOG%"
  goto fallo
)
echo [4/5] firebase deploy --only firestore:rules >> "%LOG%"
call npx firebase deploy --only firestore:rules --project padely-dev --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO el deploy de las reglas >> "%LOG%"
  goto fallo
)
echo OK reglas >> "%LOG%"
echo Fin: %DATE% %TIME% >> "%LOG%"
del "%LOCK%" 2>nul
exit /b 0
:fallo
echo Fin: %DATE% %TIME% >> "%LOG%"
del "%LOCK%" 2>nul
exit /b 1

