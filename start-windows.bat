@echo off
REM Starts the Flask backend and the React frontend in two windows (Windows).

REM Refuse to start over an old backend. This avoids accidentally using stale API code.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":5000 .*LISTENING"') do (
  echo.
  echo ERROR: Port 5000 is already in use by process %%a.
  echo Close the old Finance Tracker backend window first, then run this file again.
  echo You can identify it with: tasklist /FI "PID eq %%a"
  pause
  exit /b 1
)
cd /d "%~dp0backend"
if not exist venv (
  echo Creating Python virtual environment...
  python -m venv venv
)
echo Checking Python dependencies...
call venv\Scripts\pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo ERROR: Python dependency installation failed.
  echo Check your internet connection, then run start-windows.bat again.
  pause
  exit /b 1
)
if not exist instance\finance_tracker.db call venv\Scripts\python seed.py
start "Finance Tracker - Backend" cmd /k "venv\Scripts\python run.py"

cd /d "%~dp0frontend"
if not exist node_modules (
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: Frontend dependency installation failed.
    echo Check Node.js/npm and your internet connection, then run this file again.
    pause
    exit /b 1
  )
)
echo.
echo Open http://localhost:5173  (demo login: demo@financetracker.com / Demo@1234)
start "Finance Tracker - Frontend" cmd /k "npm run dev"
