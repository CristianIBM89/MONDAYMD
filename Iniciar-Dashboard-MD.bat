@echo off
title Dashboard MD Workspace
color 0A
echo.
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo    Dashboard MD Workspace
echo    Iniciando servidor...
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

cd /d "C:\Users\CristianAvilan\Documents\bob-demo"

:: Verificar si node esta instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js no esta instalado.
    echo  Descargalo en https://nodejs.org
    pause
    exit /b
)

:: Verificar si el puerto 3000 ya esta en uso
netstat -ano | findstr ":3000 " >nul 2>&1
if %errorlevel% == 0 (
    echo  El servidor ya esta corriendo.
    echo  Abriendo http://localhost:3000 ...
    timeout /t 1 >nul
    start "" "http://localhost:3000"
    exit /b
)

echo  Servidor iniciando en http://localhost:3000
echo  Abriendo navegador en 5 segundos...
echo  ^(Deja esta ventana abierta mientras usas el dashboard^)
echo.

:: Abrir navegador despues de 5 segundos en segundo plano
start "" cmd /c "timeout /t 5 >nul && start http://localhost:3000"

:: Iniciar servidor (esta ventana queda abierta)
node server.js
