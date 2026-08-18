@echo off
chcp 65001 >nul
echo Procurando o GCB Simulador na porta 4321...

set ENCONTROU=0
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":4321" ^| findstr "LISTENING"') do (
  echo Encerrando processo %%p...
  taskkill /F /PID %%p >nul 2>&1
  set ENCONTROU=1
)

if "%ENCONTROU%"=="1" (
  echo Servidor encerrado.
) else (
  echo Nenhum servidor rodando na porta 4321.
)
pause
