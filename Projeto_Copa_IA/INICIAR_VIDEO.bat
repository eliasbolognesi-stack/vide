@echo off
title Video Copa do Mundo 2026 com IA - Servidor Local (NAO FECHE esta janela)
cd /d "%~dp0"
echo.
echo  Iniciando o servidor local do video da Copa...
echo  (deixe esta janela aberta enquanto usa o site)
echo.
start "Servidor Copa - nao feche" cmd /k node "%~dp0server.js"
timeout /t 2 >nul
start "" http://localhost:8000/site/index.html
exit
