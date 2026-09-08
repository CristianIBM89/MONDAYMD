@echo off
setlocal EnableDelayedExpansion
title Agile Team Hub — Inicio automatico
color 0A

echo.
echo  =====================================================
echo    Agile Team Hub — Inicio y verificacion de salud
echo  =====================================================
echo.

:: ─── Verificar Node.js ───────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo          Descargalo desde https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER%

:: ─── Verificar .env del backend ──────────────────────────
if not exist "%~dp0backend\.env" (
    color 0C
    echo  [ERROR] No se encontro backend\.env
    echo          Copia backend\.env.example como backend\.env y completa las credenciales.
    pause & exit /b 1
)
echo  [OK] backend\.env encontrado

:: ─── Verificar dependencias instaladas ───────────────────
if not exist "%~dp0backend\node_modules" (
    echo  [INFO] Instalando dependencias del backend...
    cd /d "%~dp0backend"
    call npm install --silent
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install fallo en el backend.
        pause & exit /b 1
    )
    echo  [OK] Dependencias del backend instaladas
)
if not exist "%~dp0frontend\node_modules" (
    echo  [INFO] Instalando dependencias del frontend...
    cd /d "%~dp0frontend"
    call npm install --legacy-peer-deps --silent
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install fallo en el frontend.
        pause & exit /b 1
    )
    echo  [OK] Dependencias del frontend instaladas
)

:: ─── Detectar si los servidores ya estan corriendo ───────
echo.
echo  Verificando estado de los servidores...

set BACKEND_RUNNING=0
set FRONTEND_RUNNING=0

netstat -aon 2>nul | find ":3001" | find "LISTENING" >nul 2>&1
if %errorlevel% equ 0 set BACKEND_RUNNING=1

netstat -aon 2>nul | find ":3000" | find "LISTENING" >nul 2>&1
if %errorlevel% equ 0 set FRONTEND_RUNNING=1

:: ─── Backend ─────────────────────────────────────────────
if %BACKEND_RUNNING% equ 1 (
    echo  [OK] Backend ya esta corriendo en puerto 3001
) else (
    echo  [INFO] Iniciando backend en puerto 3001...
    start "ATH Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"
    :: Esperar hasta 15s a que el backend responda
    set BACKEND_OK=0
    for /l %%i in (1,1,15) do (
        if !BACKEND_OK! equ 0 (
            timeout /t 1 /nobreak >nul
            curl -s http://localhost:3001/api/health >nul 2>&1
            if !errorlevel! equ 0 set BACKEND_OK=1
        )
    )
    if !BACKEND_OK! equ 1 (
        echo  [OK] Backend listo en http://localhost:3001
    ) else (
        echo  [WARN] Backend tarda en responder — continua en segundo plano
    )
)

:: ─── Frontend ────────────────────────────────────────────
if %FRONTEND_RUNNING% equ 1 (
    echo  [OK] Frontend ya esta corriendo en puerto 3000
) else (
    echo  [INFO] Iniciando frontend en puerto 3000...
    start "ATH Frontend" cmd /k "cd /d "%~dp0frontend" && npm start"
    echo  [INFO] El frontend tarda ~30s en compilar la primera vez.
)

:: ─── ngrok ───────────────────────────────────────────────
echo.
echo  Verificando ngrok...
set NGROK_RUNNING=0
netstat -aon 2>nul | find ":4040" | find "LISTENING" >nul 2>&1
if %errorlevel% equ 0 set NGROK_RUNNING=1

if %NGROK_RUNNING% equ 1 (
    echo  [OK] ngrok ya esta corriendo - panel en http://localhost:4040
) else (
    where ngrok >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [INFO] Iniciando ngrok en puerto 3000...
        start "ATH ngrok" cmd /k "ngrok http 3000"
        timeout /t 3 /nobreak >nul
        :: Obtener URL publica de ngrok via su API local
        echo  [INFO] Obteniendo URL publica de ngrok...
        timeout /t 2 /nobreak >nul
        for /f "usebackq tokens=*" %%u in (`curl -s http://localhost:4040/api/tunnels 2^>nul ^| node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const t=JSON.parse(d).tunnels;const h=t&&t.find(x=>x.public_url&&x.public_url.startsWith('https'));process.stdout.write(h?h.public_url:'')" 2^>nul`) do set NGROK_URL=%%u
        if defined NGROK_URL (
            echo.
            echo  =====================================================
            echo   URL PUBLICA NGROK: !NGROK_URL!
            echo   Copia esta URL y pegala en el chat de Bob para
            echo   configurar el boton en Microsoft Teams.
            echo  =====================================================
        ) else (
            echo  [INFO] ngrok iniciando... Abre http://localhost:4040
            echo         para ver tu URL publica.
        )
    ) else (
        echo  [INFO] ngrok no esta instalado.
        echo         Para instalar: winget install ngrok.ngrok
        echo         Luego cierra y vuelve a abrir esta terminal.
    )
)

:: ─── Resumen final ───────────────────────────────────────
echo.
echo  =====================================================
echo   ESTADO DE SERVICIOS
echo  =====================================================
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:3001/api/health
echo   ngrok:     http://localhost:4040  (panel de ngrok)
echo  =====================================================
echo.
echo   Cuando el frontend compile (30s), abre:
echo   http://localhost:3000
echo.
echo   Presiona cualquier tecla para cerrar esta ventana.
echo   Los servidores continuaran corriendo en segundo plano.
echo  =====================================================
echo.
pause
