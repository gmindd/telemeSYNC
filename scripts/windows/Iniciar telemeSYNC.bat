@echo off
title telemeSYNC
cd /d "%~dp0"
echo.
echo   telemeSYNC - gerador de overlays de telemetria
echo   ---------------------------------------------
echo   A aplicacao vai abrir no browser em http://localhost:5174
echo.
echo   MANTENHA ESTA JANELA ABERTA enquanto usa a aplicacao.
echo   Para terminar, feche esta janela.
echo.
"%~dp0runtime\node.exe" --import tsx apps\server\src\main.ts
echo.
echo   A aplicacao terminou. Se apareceu um erro acima, tire uma fotografia ao ecra e envie-a.
pause
