@echo off
cd /d "%~dp0"
echo Iniciando Catalog Chatbot en http://127.0.0.1:3100
start "" http://127.0.0.1:3100/
call npm start
