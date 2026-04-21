@echo off
cd /d C:\dev\pharmacy-system\backend
start /B node src/index.js > backend.log 2>&1
cd /d C:\dev\pharmacy-system
start /B node serve.js > frontend.log 2>&1
echo Started
timeout /t 2 /nobreak > nul
netstat -ano | findstr ":3000 :3001 :3002" | findstr LISTENING
