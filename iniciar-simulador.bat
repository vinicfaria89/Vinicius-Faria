@echo off
chcp 65001 >nul
title GCB Simulador
cd /d "%~dp0"

:loop
echo.
echo ===================================================
echo  GCB Simulador — iniciando em http://localhost:4321
echo  (feche esta janela para desligar o servidor)
echo ===================================================
echo.
node server.js

echo.
echo O servidor parou inesperadamente. Reiniciando em 3 segundos...
timeout /t 3 /nobreak >nul
goto loop
