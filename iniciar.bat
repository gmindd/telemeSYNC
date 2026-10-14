@echo off
rem Duplo clique para instalar (primeira vez) e arrancar o telemeSYNC.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao esta instalado. Instale a versao LTS em https://nodejs.org/pt e volte a tentar.
  pause
  exit /b 1
)
if not exist node_modules (
  echo A instalar dependencias ^(so da primeira vez, pode demorar alguns minutos^)...
  call npm.cmd install
  if errorlevel 1 (
    echo Erro na instalacao. Copie as mensagens acima e envie-as.
    pause
    exit /b 1
  )
)
echo A arrancar o telemeSYNC... Mantenha esta janela aberta enquanto usa a aplicacao.
call npm.cmd start
pause
