@echo off
setlocal
rem P3-7 cuenta compartida: reglas (cuentas: participantes, pagos, lectura de participantes; pedidos de participantes;
rem perfilesPublicos, invitacionesTurno, companeros), indices (participantesUids, canchaId+fecha, perfilesPublicos,
rem pedidos.estado en grupo) y functions (crearInvitacionTurno, unirseATurno, sumarJugador, quitarParticipante,
rem asignarLineas, onUserWritten, reconstruirPerfilesPublicos; onCuentaUpdated, cerrarCuentasVencidas, onUserDeleted).
rem La CLI aborta si el codigo de functions tarda mas de 10 s en cargar
set FUNCTIONS_DISCOVERY_TIMEOUT=120
cd /d "%~dp0.."
set LOG=.phase3-logs\08-cuenta-compartida-deploy.log
set LOCK=.phase3-logs\deploy.lock
rem Lock de deploy (incidente 2026-10-22: dos CLIs a la vez se pisaron con 409). Si hay un lock de menos de 30 min, no arranca.
powershell -NoProfile -Command "if ((Test-Path '%LOCK%') -and (((Get-Date) - (Get-Item '%LOCK%').LastWriteTime).TotalMinutes -lt 30)) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo Ya hay un deploy en curso: %LOCK% tiene menos de 30 min >> "%LOG%"
  echo Ya hay un deploy en curso
  exit /b 1
)
echo %DATE% %TIME% > "%LOCK%"
echo ==== P3-7: deploy de reglas, indices y functions (padely-dev) ==== > "%LOG%"
echo Inicio: %DATE% %TIME% >> "%LOG%"
git log --oneline -1 >> "%LOG%" 2>&1
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
del "%LOCK%" 2>nul
exit /b 0
:fallo
echo Fin: %DATE% %TIME% >> "%LOG%"
del "%LOCK%" 2>nul
exit /b 1
