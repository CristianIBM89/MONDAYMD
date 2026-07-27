@echo off
:: Regenera el dashboard MD y lo abre en el navegador
cd /d "C:\Users\CristianAvilan\Documents\bob-demo"

echo [%date% %time%] Iniciando regeneracion del dashboard... >> dashboard-log.txt

:: Cargar el token desde .env y correr el generador
node -e "require('dotenv').config(); process.env.MONDAY_TOKEN && require('child_process').execSync('node generate-dashboard-md.js', {stdio:'inherit'})" >> dashboard-log.txt 2>&1

echo [%date% %time%] Dashboard regenerado. >> dashboard-log.txt

:: Abrir el dashboard en el navegador
start "" "C:\Users\CristianAvilan\Documents\bob-demo\dashboard-md-workspace.html"
