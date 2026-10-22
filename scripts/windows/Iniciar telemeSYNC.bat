@echo off
title telemeSYNC
cd /d "%~dp0"
echo.
echo   telemeSYNC - telemetry overlays for bike videos
echo   ------------------------------------------------
echo   The app opens in your browser at http://localhost:5174
echo   KEEP THIS WINDOW OPEN while you use the app. To stop, close this window.
echo.
echo   A aplicacao abre no browser em http://localhost:5174
echo   MANTENHA ESTA JANELA ABERTA enquanto usa a aplicacao. Para terminar, feche esta janela.
echo.
"%~dp0runtime\node.exe" --import tsx apps\server\src\main.ts
echo.
echo   The app has stopped. If an error appears above, take a picture of the screen and send it.
echo   A aplicacao terminou. Se apareceu um erro acima, tire uma fotografia ao ecra e envie-a.
pause
