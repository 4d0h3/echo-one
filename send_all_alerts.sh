#!/usr/bin/env bash
set -euo pipefail
BROKER="${1:-localhost}"
TOPIC="hackathon/sos"

send() {
  local json="$1"
  echo "→ $json"
  mosquitto_pub -h "$BROKER" -t "$TOPIC" -m "$json"
  sleep 1
}

# Paris (SOS)
send '{"type":"SOS","lat":48.8566,"lng":2.3522,"msg":"SOS Paris","intensity":5}'
# Lyon (FIRE)
send '{"type":"FIRE","lat":45.7640,"lng":4.8357,"msg":"Incendie Lyon","intensity":4}'
# Alger (DEBRIS)
send '{"type":"DEBRIS","lat":36.7538,"lng":3.0588,"msg":"Débris détecté Alger","intensity":5}'
# Toulouse (TECH)
send '{"type":"TECH","lat":43.6045,"lng":1.4442,"msg":"Panne capteur Toulouse","intensity":2}'
# Marseille (LOW_POWER)
send '{"type":"LOW_POWER","lat":43.2965,"lng":5.3698,"msg":"Batterie faible Marseille","intensity":2}'
# Rabat (MEDICAL)
send '{"type":"MEDICAL","lat":34.0207,"lng":-6.8416,"msg":"Urgence médicale Rabat","intensity":4}'
# NYC (RADIATION - démo)
send '{"type":"RADIATION","lat":40.7128,"lng":-74.0060,"msg":"Anomalie NYC","intensity":4}'
# Système (SYSTEM_ALERT)
send '{"type":"SYSTEM_ALERT","lat":51.5074,"lng":-0.1278,"msg":"Self-check OK Londres","intensity":1}'
# Test
send '{"type":"TEST","lat":41.9028,"lng":12.4964,"msg":"Test Rome","intensity":1}'
# Other
send '{"type":"OTHER","lat":52.5200,"lng":13.4050,"msg":"Alerte non catégorisée Berlin","intensity":1}'

echo "✅ Fini."
