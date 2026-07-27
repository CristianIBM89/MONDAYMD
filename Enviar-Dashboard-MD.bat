@echo off
title Enviar Dashboard MD a Natalia Rincon
color 0B
echo.
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo    Enviando Dashboard MD a nrincon@ibm.com
echo  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

cd /d "C:\Users\CristianAvilan\Documents\bob-demo"

echo  [1/2] Regenerando datos desde Monday.com...
node generate-dashboard-md.js

echo.
echo  [2/2] Preparando correo en Outlook...
node enviar-dashboard.js

echo.
echo  LISTO - Outlook se abrio con el correo redactado.
echo  Solo arrastra el archivo al correo y haz clic en Enviar.
echo.
pause
