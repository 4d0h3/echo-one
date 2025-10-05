import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  Circle,
  WMSTileLayer
} from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

// === Config ===
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// --- Métadonnées par type (couleur, label FR, icône) ---
const TYPE_META = {
  SOS:          { color: "#dc2626", label: "Urgence SOS",        icon: "red"    },
  FIRE:         { color: "#f97316", label: "Feu détecté",        icon: "orange" },
  MEDICAL:      { color: "#e11d48", label: "Alerte médicale",    icon: "red"    },
  RADIATION:    { color: "#a855f7", label: "Anomalie radiation", icon: "violet" },
  DEBRIS:       { color: "#06b6d4", label: "Débris spatial",     icon: "cyan"   },
  LOW_POWER:    { color: "#fde047", label: "Batterie faible",    icon: "gold"   },
  TECH:         { color: "#16a34a", label: "Alerte technique",   icon: "green"  },
  SYSTEM_ALERT: { color: "#3b82f6", label: "Alerte système",     icon: "blue"   },
  TEST:         { color: "#64748b", label: "Test système",       icon: "grey"   },
  OTHER:        { color: "#6b7280", label: "Autre alerte",       icon: "grey"   },
};

// Icônes colorées (pins) — source publique
const ICON_URLS = {
  red:    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  orange: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  green:  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  blue:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  grey:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png",
  gold:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png",
  violet: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png",
  cyan:   "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png", // fallback
};
const SHADOW = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

const iconCache = {};
function getTypeMeta(tRaw) {
  const t = (tRaw || "OTHER").toUpperCase();
  return TYPE_META[t] || TYPE_META.OTHER;
}
function getIcon(tRaw) {
  const { icon } = getTypeMeta(tRaw);
  if (!iconCache[icon]) {
    iconCache[icon] = L.icon({
      iconUrl: ICON_URLS[icon] || ICON_URLS.grey,
      shadowUrl: SHADOW,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
  }
  return iconCache[icon];
}

function NasaEonetCount() {
  const [n, setN] = useState(null);
  useEffect(() => {
    fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=1")
      .then(r=>r.json()).then(d=>setN(d?.title ? 0 : (d?.events?.length ?? 0))).catch(()=>{});
  }, []);
  if (n === null) return null;
  return (
    <div style={{position:"absolute", left:12, bottom:12, zIndex:1100,
                 padding:"6px 10px", background:"rgba(17,17,23,.75)",
                 border:"1px solid rgba(255,255,255,.12)", borderRadius:10, color:"#fff"}}>
      NASA EONET — Open events: <b>{n}</b>
    </div>
  );
}

// Icône par défaut Leaflet (fallback)
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

/* === Helpers === */
function AutoCenter({ last }) {
  const map = useMap();
  useEffect(() => {
    if (last && Number.isFinite(last.lat) && Number.isFinite(last.lng)) {
      map.flyTo([last.lat, last.lng], Math.max(map.getZoom(), 6), { duration: 0.6 });
    }
  }, [last, map]);
  return null;
}

function HUD({ apiUrl, total, last10min, wsOk, soundEnabled, setSoundEnabled }) {
  return (
    <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "12px 14px",
          background: "rgba(17,17,23,0.72)",
          border: "1px solid rgba(255,255,255,.10)",
          borderRadius: 16,
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          WebkitBackdropFilter: "blur(10px)",
          color: "#fff",
        }}
      >
        <div style={{ display: "grid", lineHeight: 1.15 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>
            ECHO-ONE <span style={{ opacity: 0.7 }}>— Live Alerts</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            <span style={{ marginRight: 10 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  marginRight: 6,
                  background: wsOk ? "#22c55e" : "#ef4444",
                  boxShadow: wsOk
                    ? "0 0 0 4px rgba(34,197,94,.25)"
                    : "0 0 0 4px rgba(239,68,68,.25)",
                  verticalAlign: "-1px",
                }}
              />
              {wsOk ? "Connecté" : "Hors ligne"}
            </span>
            API: {apiUrl} • Total: {total} • ⏱️ 10 min: {last10min}
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: "rgba(255,255,255,.12)" }} />

        <button
          onClick={() => setSoundEnabled((v) => !v)}
          title={soundEnabled ? "Couper le son" : "Activer le son"}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 10,
            background: "linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.05))",
            border: "1px solid rgba(255,255,255,.2)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {soundEnabled ? "🔊" : "🔇"}
        </button>
      </div>
    </div>
  );
}

// Heatmap simple (Leaflet.heat)
function HeatLayer({ points, max = 5, radius = 30, blur = 25 }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const heatPoints = (points || [])
      .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
      .map((p) => {
        const intensity = typeof p.intensity === "number" ? p.intensity : 1;
        return [p.lat, p.lng, Math.max(0, Math.min(1, intensity / max))];
      });
    const layer = L.heatLayer(heatPoints, { radius, blur, maxZoom: 12 }).addTo(map);
    return () => map.removeLayer(layer);
  }, [map, points, max, radius, blur]);
  return null;
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

async function getCityName(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    const data = await res.json();
    return data.address.city || data.address.town || data.address.village || "Inconnu";
  } catch {
    return "Inconnu";
  }
}
function PanTo({ target, zoom = 7 }) {
  const map = useMap();
  useEffect(() => {
    if (target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
      map.flyTo([target.lat, target.lng], zoom, { duration: 0.6 });
    }
  }, [target, zoom, map]);
  return null;
}


// === Composant principal ===
export default function App() {
  const [alerts, setAlerts] = useState([]);
  const [showBanner, setShowBanner] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isActive, setIsActive] = useState(false); // radar
  const [pulseKey, setPulseKey] = useState(0);     // reset anim
  const [wsOk, setWsOk] = useState(false);
  const [listOpen, setListOpen] = useState(true);    // panneau ouvert/fermé
  const [panTarget, setPanTarget] = useState(null);  // cible de recentrage (lat/lng)
  const socketRef = useRef(null);

  const sinceMin = (ms) => (Date.now() - new Date(ms).getTime()) / 60000;
  const last10min = alerts.filter((a) => sinceMin(a.ts || Date.now()) <= 10).length;

  // === Historique initial (protégé contre l'interstitiel ngrok) ===
  useEffect(() => {
    const url = `${API_URL}/alerts`;
    console.log("[INIT] Fetch alerts from:", url);

    fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      cache: "no-store",
    })
      .then(async (r) => {
        console.log("[INIT] /alerts status:", r.status, r.headers.get("content-type"));
        const text = await r.text();
        try {
          const data = JSON.parse(text);
          console.log("[INIT] /alerts length:", Array.isArray(data) ? data.length : "not array");
          setAlerts(Array.isArray(data) ? data : []);
        } catch {
          console.error("[INIT] /alerts not JSON → first 200 chars:", text.slice(0, 200));
          setAlerts([]);
        }
      })
      .catch((err) => console.error("[INIT] /alerts error:", err));
  }, []);

  // === Temps réel (Socket.IO) + radar + son ===
  useEffect(() => {
    const socket = io(API_URL, {
      transports: ["polling", "websocket"], // laisse le fallback si WS bloqué
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      timeout: 20000,
      withCredentials: false,
      extraHeaders: { "ngrok-skip-browser-warning": "true" },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setWsOk(true);
      console.log("[WS] connected", socket.id);
    });
    socket.on("connect_error", (err) => {
      setWsOk(false);
      console.warn("[WS] connect_error:", err?.message || err);
    });
    socket.on("disconnect", (reason) => {
      setWsOk(false);
      console.warn("[WS] disconnected:", reason);
    });

    socket.on("alert", async (a) => {
      a.ville = await getCityName(a.lat, a.lng);
      setAlerts((prev) => [a, ...prev]);
      setShowBanner(true);

      if (soundEnabled) {
        const alertSound = new Audio("/sounds/alert.mp3");
        alertSound.volume = 0.6;
        alertSound.play().catch((err) => console.log("Audio bloqué :", err));
      }

      // radar
      setIsActive(true);
      setPulseKey((k) => k + 1);
      setTimeout(() => setShowBanner(false), 2500);
      setTimeout(() => setIsActive(false), 6000);
    });

    return () => socket.close();
  }, [soundEnabled]);

  // Rafraîchit l'affichage "il y a X"
  useEffect(() => {
    const id = setInterval(() => setAlerts((a) => [...a]), 60000);
    return () => clearInterval(id);
  }, []);

  // Débloque l'audio après 1er clic utilisateur
  useEffect(() => {
    const enableAudio = () => {
      const audio = new Audio("/sounds/alert.mp3");
      audio.volume = 0;
      audio.play().catch(() => {});
      window.removeEventListener("click", enableAudio);
      setSoundEnabled(true);
      console.log("✅ Audio activé par l'utilisateur");
    };
    window.addEventListener("click", enableAudio);
  }, []);

  const last = alerts[0];
  const fallbackCenter = [48.8566, 2.3522];

  // CSS pour l'animation radar injecté
  const radarCSS = `
    @keyframes pulse-grow {
      0% { transform: scale(1); opacity: 0.8; }
      50% { transform: scale(1.4); opacity: 0.4; }
      100% { transform: scale(1); opacity: 0.8; }
    }
    .circle-pulse { animation: pulse-grow 2.5s ease-in-out infinite; transform-origin: center; }
    .circle-idle  { animation: pulse-grow 8s ease-in-out infinite; opacity: 0.3; }
    @keyframes bannerPulse { 0%,100%{opacity:1} 50%{opacity:.6} }
  `;

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        background: "#0b0e11",
        paddingBottom: showBanner ? 56 : 0,
        boxSizing: "border-box",
      }}
    >
      <style>{radarCSS}</style>
      <NasaEonetCount />
      <HUD
        apiUrl={API_URL}
        total={alerts.length}
        last10min={last10min}
        wsOk={wsOk}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
      />
      {/* ====== Panneau liste des alertes (droite, milieu) ====== */}
<div
  style={{
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 1100,
    display: "flex",
    alignItems: "center",
    gap: 8,
  }}
>
  {/* Poignée / bouton pour ouvrir/fermer */}
  <button
    onClick={() => setListOpen((v) => !v)}
    title={listOpen ? "Masquer la liste" : "Afficher la liste"}
    style={{
      writingMode: "vertical-rl",
      transform: "rotate(180deg)",
      background: "rgba(17,17,23,0.72)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,.15)",
      borderRadius: 12,
      padding: "8px 6px",
      cursor: "pointer",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      boxShadow: "0 8px 24px rgba(0,0,0,.35)",
      fontWeight: 700,
      letterSpacing: 0.5,
    }}
  >
    {listOpen ? "ALERTES ◀" : "ALERTES ▶"}
  </button>

  {/* Panneau */}
  {listOpen && (
    <div
      style={{
        width: 320,
        maxHeight: "65vh",
        overflowY: "auto",
        background: "rgba(17,17,23,0.82)",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 16,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 14px 40px rgba(0,0,0,.45)",
        color: "#fff",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          fontWeight: 800,
          letterSpacing: 0.4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          background: "rgba(17,17,23,0.92)",
          backdropFilter: "blur(10px)",
        }}
      >
        <span>Alertes ({alerts.length})</span>
        <small style={{ opacity: 0.8 }}>10 min: {last10min}</small>
      </div>

      {/* Liste d’items */}
      <div>
        {(alerts || []).slice(0, 200).map((a, i) => {
          const meta = getTypeMeta(a.type);
          return (
            <button
              key={a._id || i}
              onClick={() => {
                setPanTarget({ lat: a.lat, lng: a.lng });
                setIsActive(true);               // petit boost au radar
                setTimeout(() => setIsActive(false), 3000);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                padding: "10px 12px",
                display: "grid",
                gap: 4,
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,.06)",
              }}
            >
              {/* Pastille couleur */}
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: meta.color,
                  boxShadow: `0 0 0 4px ${meta.color}33`,
                }}
              />

              {/* Texte */}
              <div style={{ display: "grid", lineHeight: 1.2 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {(a.type || "OTHER").toUpperCase()} —{" "}
                  <span style={{ opacity: 0.9 }}>{a.ville || "Inconnu"}</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.msg || "—"}
                </div>
              </div>

              {/* Temps relatif + intensité */}
              <div style={{ textAlign: "right", lineHeight: 1.1 }}>
                <div style={{ fontSize: 11, opacity: 0.75 }}>{timeAgo(a.ts || Date.now())}</div>
                {typeof a.intensity === "number" && (
                  <div style={{ fontSize: 11, opacity: 0.9 }}>🔥 {a.intensity}/5</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  )}
</div>

      {showBanner && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            padding: "14px 0",
            background: "rgba(220,38,38,0.95)",
            color: "#fff",
            fontWeight: 700,
            textAlign: "center",
            zIndex: 2000,
            animation: "bannerPulse 1s infinite",
            borderTop: "2px solid #fff3",
          }}
        >
          🚨 SOS reçu ! Nouveau signal détecté
        </div>
      )}
      

      <MapContainer
        center={last ? [last.lat, last.lng] : fallbackCenter}
        zoom={6}
        style={{ height: "100vh", width: "100vw" }}
        whenCreated={(m) => setTimeout(() => m.invalidateSize(), 0)}
      >
        
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

          

        <AutoCenter last={last} />
        <PanTo target={panTarget} zoom={7} />
        <HeatLayer points={alerts} max={5} radius={30} blur={25} />

        {alerts.map((a, i) => {
          const meta = getTypeMeta(a.type);
          return (
            <Marker key={a._id || i} position={[a.lat, a.lng]} icon={getIcon(a.type)}>
              <Popup>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      background: meta.color,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: 999,
                      letterSpacing: 0.5,
                    }}
                  >
                    {(a.type || "OTHER").toUpperCase()}
                  </span>
                  <b>{TYPE_META[(a.type || "OTHER").toUpperCase()]?.label || meta.label}</b>
                </div>
                <div style={{ marginTop: 6 }}>
                  {a.msg || "—"}
                  <br />
                  {a.ville ? `📍 ${a.ville}` : null}
                  <br />
                  ⏱️ {timeAgo(a.ts || Date.now())}
                  {typeof a.intensity === "number" ? (
                    <>
                      <br />🔥 Intensité : {a.intensity}/5
                    </>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {last && (
          <Circle
            key={pulseKey}
            center={[last.lat, last.lng]}
            radius={isActive ? 50000 : 40000}
            pathOptions={{
              color: getTypeMeta(last.type).color,
              fillColor: getTypeMeta(last.type).color,
              fillOpacity: 0.2,
              weight: 2,
              className: isActive ? "circle-pulse" : "circle-idle",
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
