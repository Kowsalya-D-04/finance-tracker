#!/usr/bin/env bash
# Starts the Flask backend and the React frontend (macOS / Linux).
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/backend"
if [ ! -d venv ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv venv
  ./venv/bin/pip install -r requirements.txt
  ./venv/bin/python seed.py
fi
./venv/bin/python run.py &
BACKEND_PID=$!
trap "kill $BACKEND_PID 2>/dev/null" EXIT

cd "$ROOT/frontend"
[ -d node_modules ] || npm install
echo ""
echo "Open http://localhost:5173  (demo login: demo@financetracker.com / Demo@1234)"
npm run dev
