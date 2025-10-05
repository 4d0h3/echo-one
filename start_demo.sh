#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$HOME/Documents/projet_nasa"
BACKEND="$PROJECT_ROOT/leo-backend"
FRONTEND="$PROJECT_ROOT/leo-frontend"
RUN_DIR="$PROJECT_ROOT/run"
LOG_DIR="$PROJECT_ROOT/logs"

mkdir -p "$RUN_DIR" "$LOG_DIR"

echo "==> (1) Démarrage des services système (MongoDB & Mosquitto)…"
sudo systemctl start mongod || true
sudo systemctl start mosquitto || true

echo "==> (2) Démarrage du backend…"
cd "$BACKEND"
# charge .env et affiche l’URL locale
export $(grep -E '^(PORT|ALLOW_ORIGIN|MONGO_URI|MQTT_BROKER|MQTT_TOPIC)=' .env | xargs) || true
PORT="${PORT:-3000}"
nohup npm run dev > "$LOG_DIR/backend.log" 2>&1 & echo $! > "$RUN_DIR/backend.pid"

# Attente que le backend réponde
echo "    Attente de http://localhost:$PORT/health…"
for i in {1..30}; do
  if curl -sf "http://localhost:$PORT/health" >/dev/null; then
    echo "    OK: backend en ligne sur http://localhost:$PORT"
    break
  fi
  sleep 0.5
done

echo "==> (3) Démarrage de ngrok sur le port $PORT…"
# Ferme un éventuel ancien tunnel avant
pkill -f "ngrok http $PORT" 2>/dev/null || true
nohup ngrok http $PORT > "$LOG_DIR/ngrok.log" 2>&1 & echo $! > "$RUN_DIR/ngrok.pid"

# Attente de l’API locale ngrok
echo "    Attente de l’API ngrok (http://127.0.0.1:4040)…"
for i in {1..40}; do
  if curl -sf "http://127.0.0.1:4040/api/tunnels" >/dev/null; then
    break
  fi
  sleep 0.5
done

# Récupère l’URL publique https de ngrok
get_public_url() {
  curl -s "http://127.0.0.1:4040/api/tunnels" \
  | python3 -c 'import sys,json; 
import sys,json
try:
    data=json.load(sys.stdin)
    print(next((t["public_url"] for t in data.get("tunnels",[]) if str(t.get("public_url","")).startswith("https://")),""))
except Exception:
    print("")'
}
PUBLIC_URL=""
for i in {1..40}; do
  PUBLIC_URL="$(get_public_url)"
  [[ -n "$PUBLIC_URL" ]] && break
  sleep 0.5
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "!! Impossible de récupérer l’URL publique ngrok. Regarde $LOG_DIR/ngrok.log"
  exit 1
fi
echo "    URL publique ngrok : $PUBLIC_URL"

echo "==> (4) Mise à jour du .env du frontend avec VITE_API_URL…"
cd "$FRONTEND"
echo "VITE_API_URL=\"$PUBLIC_URL\"" > .env

echo "==> (5) Démarrage du frontend (Vite, accessible sur le réseau)…"
nohup npm run dev -- --host > "$LOG_DIR/frontend.log" 2>&1 & echo $! > "$RUN_DIR/frontend.pid"

echo
echo "══════════════════════════════════════════════════════════════════════"
echo "  ✅ Tout est lancé !"
echo "  Backend local :     http://localhost:$PORT"
echo "  Backend public :    $PUBLIC_URL"
echo "  Frontend local :    http://localhost:5173  (ou http://<IP_PC>:5173)"
echo "  Logs backend :      $LOG_DIR/backend.log"
echo "  Logs frontend :     $LOG_DIR/frontend.log"
echo "  Logs ngrok :        $LOG_DIR/ngrok.log"
echo
echo "  Pour arrêter proprement : $PROJECT_ROOT/stop_demo.sh"
echo "══════════════════════════════════════════════════════════════════════"
