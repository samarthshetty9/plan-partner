#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Clear ports ──────────────────────────────────────────────────
for PORT in 3002 8082; do
  PIDS=$(lsof -ti :$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Clearing port $PORT (PID $PIDS)..."
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
done

# ── Start backend in background and wait for it ──────────────────
echo "Starting backend..."
cd "$ROOT/server" && npm run dev > /tmp/mediimate-server.log 2>&1 &
BACKEND_PID=$!

# Poll until port 3002 is accepting connections (max 15s)
for i in $(seq 1 15); do
  sleep 1
  if lsof -ti :3002 >/dev/null 2>&1; then
    echo "✅ Backend ready on :3002 (PID $BACKEND_PID)"
    break
  fi
  echo "  waiting for backend... ($i)"
done

# ── Open frontend in a new Terminal window ───────────────────────
osascript <<EOF
tell application "Terminal"
  do script "echo '🟢 Frontend starting...' && cd '$ROOT' && npm run dev"
  delay 0.3
  set custom title of front window to "MediMate – Frontend :8082"
end tell
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MediMate is running"
echo ""
echo "  Frontend  →  http://localhost:8082"
echo "  Backend   →  http://localhost:3002"
echo ""
echo "  Doctor login : doc@mediimate.in / DocDemo1234!"
echo "  Patient login: demo@mediimate.in / Demo1234!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "(Backend logs: tail -f /tmp/mediimate-server.log)"


echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MediMate is starting in two Terminal windows"
echo ""
echo "  Frontend  →  http://localhost:8082"
echo "  Backend   →  http://localhost:3002"
echo ""
echo "  Doctor login : doc@mediimate.in / DocDemo1234!"
echo "  Patient login: demo@mediimate.in / Demo1234!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
