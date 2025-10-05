#!/usr/bin/env bash
# verify_demo.sh — vérifie l’ensemble MongoDB/Mosquitto/Backend/Ngrok/Frontend
# Tolérant aux erreurs, nettoie les guillemets dans .env, ajoute l’entête ngrok.

set -u

# ========== Mise en forme ==========
B="\033[1m"; G="\033[32m"; R="\033[31m"; Y="\033[33m"; C="\033[36m"; N="\033[0m"
ok(){   echo -e "  ${G}✔${N} $*"; }
warn(){ echo -e "  ${Y}●${N} $*"; }
err(){  echo -e "  ${R}✖${N} $*"; }

ROOT="${HOME}/Documents/projet_nasa"
BACK="${ROOT}/leo-backend"
FRONT="${ROOT}/leo-frontend"

# ========== Détecter URLs ==========
API_URL_RAW="$(grep -E '^VITE_API_URL=' "${FRONT}/.env" 2>/dev/null | sed 's/^VITE_API_URL=//')"
# strip guillemets et slash final
API_URL="${API_URL_RAW//\"/}"
API_URL="${API_URL%/}"
# Fallback si vide
[[ -z "${API_URL}" ]] && API_URL="http://localhost:3000"

API_LOCAL="http://localhost:3000"
FRONT_URL="http://localhost:5173"

echo -e "${B}=== VERIFICATIONS PROJET ===${N}"
echo "API_URL (frontend .env): ${API_URL}"
echo "Backend local           : ${API_LOCAL}"
echo "Frontend local          : ${FRONT_URL}"
echo

# Utilitaires présents ?
HAS_JQ=0; command -v jq >/dev/null 2>&1 && HAS_JQ=1
HAS_MOSQ=0; command -v mosquitto_pub >/dev/null 2>&1 && HAS_MOSQ=1
HAS_MONGOSH=0; command -v mongosh >/dev/null 2>&1 && HAS_MONGOSH=1
HAS_CURL=0; command -v curl >/dev/null 2>&1 && HAS_CURL=1

if [[ $HAS_CURL -eq 0 ]]; then
  err "curl manquant — installe-le puis relance (sudo apt install curl)"
  exit 1
fi

# Fallback simple si jq absent
json_len(){
  if [[ $HAS_JQ -eq 1 ]]; then
    jq -r 'length'
  else
    python3 - <<'PY' || echo 0
import sys, json
try:
  print(len(json.load(sys.stdin)))
except Exception:
  print(0)
PY
  fi
}

# ========== [1] Services MongoDB & Mosquitto ==========
echo "[1/8] Services MongoDB & Mosquitto"
if pgrep -x mongod >/dev/null 2>&1; then ok "mongod est démarré"; else warn "mongod non détecté (sudo systemctl start mongod ?)"; fi
if pgrep -x mosquitto >/dev/null 2>&1; then ok "mosquitto est démarré"; else warn "mosquitto non détecté (sudo systemctl start mosquitto ?)"; fi
echo

# ========== [2] MongoDB — connexion & stats ==========
echo "[2/8] MongoDB — connexion & stats"
if [[ $HAS_MONGOSH -eq 1 ]]; then
  COUNT="$(mongosh --quiet --eval 'db = db.getSiblingDB("leo"); db.alerts.countDocuments()' 2>/dev/null || echo 0)"
  if [[ "$COUNT" =~ ^[0-9]+$ ]]; then
    ok "Collection leo.alerts: ${COUNT} docs"
  else
    warn "Impossible de compter les docs (mongosh OK ?), résultat: ${COUNT}"
  fi
else
  warn "mongosh absent — saute la vérification (sudo apt install mongosh)"
fi
echo

# ========== [3] Backend /health (local & public) ==========
echo "[3/8] Backend /health (local & public)"
LOCAL_HEALTH="$(curl -sS --max-time 8 -H 'ngrok-skip-browser-warning: 1' "${API_LOCAL}/health" || true)"
if [[ "$LOCAL_HEALTH" == *'"status":"ok"'* ]]; then
  ok "Local: ${API_LOCAL}/health => OK"
else
  err "Local: ${API_LOCAL}/health => KO (${LOCAL_HEALTH})"
fi

PUBLIC_HEALTH="$(curl -sS --max-time 8 -H 'ngrok-skip-browser-warning: 1' "${API_URL}/health" || true)"
if [[ "$PUBLIC_HEALTH" == *'"status":"ok"'* ]]; then
  ok "Public: ${API_URL}/health => OK"
else
  warn "Public /health KO (ngrok hors-ligne, CORS ou pare-feu ?) — réponse: ${PUBLIC_HEALTH:0:120}..."
fi
echo

# ========== [4] CORS preflight /alerts ==========
echo "[4/8] CORS preflight /alerts (Origin: ${FRONT_URL})"
CORS_CODE="$(curl -sSI -X OPTIONS "${API_URL}/alerts" \
  -H "Origin: ${FRONT_URL}" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type,ngrok-skip-browser-warning" \
  -H "ngrok-skip-browser-warning: 1" \
  | awk 'NR==1{print $2}')"
if [[ "$CORS_CODE" == "204" || "$CORS_CODE" == "200" ]]; then
  ok "Preflight CORS renvoie ${CORS_CODE}"
else
  warn "Preflight CORS inattendu (${CORS_CODE:-vide})"
fi
echo

# ========== [5] GET /alerts ==========
echo "[5/8] GET /alerts"
ALERTS_JSON="$(curl -sS --max-time 10 -H 'ngrok-skip-browser-warning: 1' "${API_URL}/alerts" || echo '[]')"
LEN="$(printf "%s" "$ALERTS_JSON" | json_len)"
if [[ "$LEN" =~ ^[0-9]+$ ]]; then
  ok "/alerts répond (${LEN} éléments)"
else
  warn "/alerts a répondu mais impossible de parser la longueur"
fi
echo

# ========== [6] POST /alert & persistance ==========
echo "[6/8] POST /alert & persistance"
STAMP="$(date +%s)"
TEST_MSG="verify_demo_${STAMP}"
POST_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${API_URL}/alert" \
  -H "Content-Type: application/json" \
  -H "ngrok-skip-browser-warning: 1" \
  -d "{\"type\":\"TEST\",\"lat\":48.8566,\"lng\":2.3522,\"msg\":\"${TEST_MSG}\",\"intensity\":1}")"
if [[ "$POST_CODE" == "201" ]]; then
  ok "POST /alert => 201"
else
  warn "POST /alert => ${POST_CODE}"
fi

sleep 1
FOUND=0
if [[ $HAS_JQ -eq 1 ]]; then
  FOUND="$(curl -sS -H 'ngrok-skip-browser-warning: 1' "${API_URL}/alerts" \
    | jq -r "map(select(.msg==\"${TEST_MSG}\")) | length")"
else
  FOUND="$(curl -sS -H 'ngrok-skip-browser-warning: 1' "${API_URL}/alerts" \
    | python3 - "$TEST_MSG" <<'PY'
import sys, json
needle = sys.argv[1]
try:
  arr = json.load(sys.stdin)
  print(sum(1 for x in arr if isinstance(x, dict) and x.get("msg")==needle))
except Exception:
  print(0)
PY
  )"
fi

if [[ "$FOUND" =~ ^[1-9][0-9]*$ ]]; then
  ok "Persistance OK (message retrouvé)"
else
  warn "Persistance non confirmée (message absent)"
fi
echo

# ========== [7] MQTT → Backend → DB ==========
echo "[7/8] Chaîne MQTT → Backend → DB"
if [[ $HAS_MOSQ -eq 1 ]]; then
  MQTT_MSG="verify_mqtt_${STAMP}"
  mosquitto_pub -h localhost -t hackathon/sos -m "{\"type\":\"TEST\",\"lat\":40.7128,\"lng\":-74.0060,\"msg\":\"${MQTT_MSG}\",\"intensity\":1}" 2>/dev/null \
    && ok "Publie MQTT local (hackathon/sos)"
  sleep 1
  if [[ $HAS_JQ -eq 1 ]]; then
    FOUND2="$(curl -sS -H 'ngrok-skip-browser-warning: 1' "${API_URL}/alerts" \
      | jq -r "map(select(.msg==\"${MQTT_MSG}\")) | length")"
  else
    FOUND2="$(curl -sS -H 'ngrok-skip-browser-warning: 1' "${API_URL}/alerts" \
      | python3 - "$MQTT_MSG" <<'PY'
import sys, json
needle = sys.argv[1]
try:
  arr = json.load(sys.stdin)
  print(sum(1 for x in arr if isinstance(x, dict) and x.get("msg")==needle))
except Exception:
  print(0)
PY
    )"
  fi
  if [[ "$FOUND2" =~ ^[1-9][0-9]*$ ]]; then
    ok "Chaîne MQTT→Backend→DB OK (message retrouvé)"
  else
    warn "Chaîne MQTT non confirmée (message absent)"
  fi
else
  warn "mosquitto_pub absent — saute le test MQTT (sudo apt install mosquitto-clients)"
fi
echo

# ========== [8] Socket.IO (polling) ==========
echo "[8/8] Socket.IO (polling endpoint)"
WS_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'ngrok-skip-browser-warning: 1' \
  "${API_URL}/socket.io/?EIO=4&transport=polling&t=$(date +%s)" || true)"
if [[ "$WS_CODE" == "200" || "$WS_CODE" == "400" ]]; then
  # 200 = ok (poll), 400 arrive parfois selon état de session, on considère reachable
  ok "Endpoint Socket.IO reachable (HTTP ${WS_CODE})"
else
  warn "Socket.IO polling inattendu (HTTP ${WS_CODE:-vide})"
fi
echo

echo -e "${B}=== FIN DES VÉRIFS ===${N}"
echo "Si un point est en KO :"
echo " - Vérifie ngrok en ligne et l’URL dans ${FRONT}/.env (sans guillemets)."
echo " - Vérifie CORS côté backend (ALLOW_ORIGIN) et relance."
echo " - Regarde les logs :"
echo "     tail -n 200 ${ROOT}/logs/backend.log"
echo "     tail -n 200 ${ROOT}/logs/ngrok.log"
