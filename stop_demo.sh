#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$HOME/Documents/projet_nasa"
RUN_DIR="$PROJECT_ROOT/run"

stop_pid() {
  local name="$1"
  local file="$RUN_DIR/$name.pid"
  if [[ -f "$file" ]]; then
    local pid
    pid=$(cat "$file" 2>/dev/null || echo "")
    if [[ -n "${pid}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "Arrêt de $name (pid $pid)…"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

stop_pid "frontend"
stop_pid "ngrok"
stop_pid "backend"

# Au cas où…
pkill -f "ngrok http" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "node src/server.js" 2>/dev/null || true

echo "✅ Tous les processus de démo ont été arrêtés."
