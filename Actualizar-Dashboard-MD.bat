@echo off
:: Regenera el dashboard MD y lo publica en GitHub Pages
cd /d "%~dp0"

echo [%date% %time%] Iniciando regeneracion del dashboard... >> dashboard-log.txt

:: Cargar el token desde .env y correr el generador
node generate-dashboard-md.js >> dashboard-log.txt 2>&1

echo [%date% %time%] Dashboard regenerado y publicado en GitHub Pages. >> dashboard-log.txt

:: Abrir el dashboard en el navegador forzando refresco de cache
start "" "https://cristianibm89.github.io/MONDAYMD/?updated=%time:~0,2%%time:~3,2%"
