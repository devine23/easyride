@echo off
echo.
echo  ==========================================
echo    EasyGo - Quality Service Excellence
echo  ==========================================
echo.
echo  Starting backend server (port 5000)...
start "EasyGo Server" cmd /k "cd /d %~dp0server && node src/index.js"
timeout /t 2 /nobreak >nul
echo  Starting frontend (port 3000)...
start "EasyGo Client" cmd /k "cd /d %~dp0client && npx vite"
timeout /t 3 /nobreak >nul
echo.
echo  App running at: http://localhost:3000
echo.
echo  Demo Accounts:
echo    Private Client : client@demo.com   / demo1234
echo    Corporate      : corp@demo.com     / demo1234
echo    Driver         : driver@demo.com   / demo1234
echo.
start http://localhost:3000
