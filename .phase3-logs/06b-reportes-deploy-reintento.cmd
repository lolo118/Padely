@echo off
setlocal
rem P3-6 reintento: primero SOLO las 6 functions nuevas (si Cloud Run vuelve a fallar, no se tocan las existentes),
rem despues todas (las existentes llevan los rollups nuevos en onVentaCreated/onVentaUpdated/etc.).
rem Reglas e indices ya estan desplegados; no se vuelven a tocar.
set FUNCTIONS_DISCOVERY_TIMEOUT=120
cd /d "%~dp0.."
set LOG=.phase3-logs\06b-reportes-deploy-reintento.log
set LOCK=.phase3-logs\deploy.lock
rem Lock de deploy (incidente 2026-10-22: dos CLIs a la vez se pisaron con 409). Si hay un lock de menos de 30 min, no arranca.
powershell -NoProfile -Command "if ((Test-Path '%LOCK%') -and (((Get-Date) - (Get-Item '%LOCK%').LastWriteTime).TotalMinutes -lt 30)) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo Ya hay un deploy en curso: %LOCK% tiene menos de 30 min >> "%LOG%"
  echo Ya hay un deploy en curso
  exit /b 1
)
echo %DATE% %TIME% > "%LOCK%"
echo ==== P3-6 reintento: functions en dos etapas (padely-dev) ==== > "%LOG%"
echo Inicio: %DATE% %TIME% >> "%LOG%"
git log --oneline -1 >> "%LOG%" 2>&1
echo [1/3] npm --prefix functions install >> "%LOG%"
call npm --prefix functions install --no-audit --no-fund >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO npm install en functions >> "%LOG%"
  goto fallo
)
echo [2/3] solo las functions nuevas >> "%LOG%"
call npx firebase deploy --only "functions:recalcularReporte,functions:reconstruirCatalogo,functions:onCajaUpdated,functions:onProductoWritten,functions:onCategoriaWritten,functions:avisosStockDiario" --project padely-dev --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO la etapa 1 - NO se tocaron las functions existentes >> "%LOG%"
  goto fallo
)
echo [3/3] todas las functions >> "%LOG%"
call npx firebase deploy --only functions --project padely-dev --non-interactive >> "%LOG%" 2>&1
if errorlevel 1 (
  echo FALLO la etapa 2 - las nuevas quedaron arriba, revisar las existentes >> "%LOG%"
  goto fallo
)
echo OK functions nuevas y existentes >> "%LOG%"
echo Fin: %DATE% %TIME% >> "%LOG%"
echo.
echo OK. Log en %LOG%
del "%LOCK%" 2>nul
exit /b 0
:fallo
echo Fin: %DATE% %TIME% >> "%LOG%"
echo.
echo FALLO. Mira %LOG%
del "%LOCK%" 2>nul
exit /b 1
