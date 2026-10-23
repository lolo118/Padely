@echo off
setlocal
rem La CLI aborta si el codigo de functions tarda mas de 10 s en cargar
set FUNCTIONS_DISCOVERY_TIMEOUT=120
cd /d "%~dp0.."
set LOG=.phase3-logs\05-pedidos-deploy.log
echo ==== P3-5: deploy de reglas, indices y functions (padely-dev) ==== > "%LOG%"
echo Inicio: %DATE% %TIME% >> "%LOG%"
echo [1/3] firebase deploy --only firestore:rules,firestore:indexes >> "%LOG%"
call npx firebase deploy --only firestore:rules,firestore:indexes --project padely-dev --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO el deploy de reglas/indices >> "%LOG%"
  goto fallo
)
echo [2/3] npm --prefix functions install >> "%LOG%"
call npm --prefix functions install --no-audit --no-fund >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO npm install en functions >> "%LOG%"
  goto fallo
)
echo [3/3] firebase deploy --only functions >> "%LOG%"
call npx firebase deploy --only functions --project padely-dev --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO el deploy de functions >> "%LOG%"
  goto fallo
)
echo OK reglas, indices y functions >> "%LOG%"
echo Fin: %DATE% %TIME% >> "%LOG%"
exit /b 0
:fallo
echo Fin: %DATE% %TIME% >> "%LOG%"
exit /b 1
