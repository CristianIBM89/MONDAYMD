@echo off
title Actualizar Dashboard MD Workspace - IBM
color 0A
cd /d "%~dp0"

echo ========================================================
echo   ACTUALIZANDO DASHBOARD MD WORKSPACE (MONDAY.COM)
echo ========================================================
echo.
echo  Fecha: %date% %time%
echo  Obteniendo datos de Monday API y publicando en GitHub Pages...
echo.

node generate-dashboard-md.js

echo.
echo ========================================================
echo   ¡DASHBOARD ACTUALIZADO Y PUBLICADO EXITOSAMENTE!
echo ========================================================
echo.
echo  Abriendo el dashboard en vivo en tu navegador...
echo.

:: Generar un identificador unico para forzar la recarga sin cache
set /a "rand=%RANDOM% * 1000 + %RANDOM%"
start "" "https://cristianibm89.github.io/MONDAYMD/?v=%rand%"

ping -n 4 127.0.0.1 >nul
