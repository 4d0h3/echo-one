// server.js
import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import mqtt from "mqtt";

dotenv.config();

/* ========= ENV ========= */
const PORT = Number(process.env.PORT || 3000);
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/leo";
const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "hackathon/sos";

/** Autoriser plusieurs origines, séparées par des virgules */
const ALLOW_ORIGIN = (process.env.ALLOW_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* ========= APP / HTTP ========= */
const app = express();
const server = http.createServer(app);

/* -- CORS (REST + pré-requêtes) -- */
/* Important : autoriser l’entête ngrok-skip-browser-warning pour le polling */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOW_ORIGIN.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, ngrok-skip-browser-warning"
  );
  res.setHeader("Access-Control-Allow-Credentials", "false");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204); // <- préflight OK
  }
  next();
});
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || ALLOW_ORIGIN.includes(origin)),
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "ngrok-skip-browser-warning"],
  })
);

app.use(express.json({ limit: "256kb" }));

/* ========= Socket.IO (CORS aligné) ========= */
const io = new SocketIO(server, {
  path: "/socket.io",
  cors: {
    origin: ALLOW_ORIGIN,
    methods: ["GET", "POST"],
    allowedHeaders: ["ngrok-skip-browser-warning", "content-type"],
    credentials: false,
  },
});

/* ========= MongoDB ========= */
try {
  await mongoose.connect(MONGO_URI);
  console.log("[MongoDB] Connected:", MONGO_URI);
} catch (e) {
  console.error("[MongoDB] Connection error:", e.message);
  process.exit(1);
}

const AlertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "SOS",
        "TECH",
        "FIRE",
        "MEDICAL",
        "RADIATION",
        "DEBRIS",
        "LOW_POWER",
        "SYSTEM_ALERT",
        "TEST",
        "OTHER",
      ],
      default: "SOS",
      index: true,
    },
    msg: { type: String, default: "Signal reçu" },
    lat: { type: Number, required: true, index: true },
    lng: { type: Number, required: true, index: true },
    ville: { type: String, default: "Inconnue" },
    intensity: { type: Number, default: 1, min: 0, max: 5, index: true },
    source: {
      type: String,
      enum: ["satellite", "station", "mobile", "testbench", "unknown"],
      default: "unknown",
      index: true,
    },
    ts: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);
const Alert = mongoose.model("Alert", AlertSchema);

/* ========= Helpers ========= */
function normalizeAlert(input = {}) {
  const out = {};
  out.type = String(input.type || "SOS").toUpperCase();

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("lat/lng invalides");
  }
  out.lat = lat;
  out.lng = lng;

  out.msg = typeof input.msg === "string" ? input.msg : "Signal reçu";

  const intensity = Number(input.intensity);
  out.intensity = Number.isFinite(intensity)
    ? Math.min(5, Math.max(0, intensity))
    : 1;

  out.source = typeof input.source === "string" ? input.source : "unknown";
  out.ville = typeof input.ville === "string" ? input.ville : "Inconnue";

  if (input.ts) {
    const d = new Date(input.ts);
    if (!isNaN(d.getTime())) out.ts = d;
  }
  return out;
}

/* ========= MQTT ========= */
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on("connect", () => {
  console.log("[MQTT] Connected to", MQTT_BROKER);
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (err) console.error("[MQTT] Subscribe error:", err);
    else console.log("[MQTT] Subscribed to topic:", MQTT_TOPIC);
  });
});

mqttClient.on("error", (err) => {
  console.error("[MQTT] Client error:", err.message);
});

mqttClient.on("message", async (_topic, payload) => {
  try {
    const raw = JSON.parse(payload.toString());
    const data = normalizeAlert(raw);
    const saved = await Alert.create(data); // 💾
    io.emit("alert", saved); // 🔊
    console.log("[MQTT] Alert saved:", {
      type: saved.type,
      lat: saved.lat,
      lng: saved.lng,
      intensity: saved.intensity,
      ts: saved.ts.toISOString(),
    });
  } catch (e) {
    console.error("[MQTT] Bad payload:", e.message);
  }
});

/* ========= Routes REST ========= */
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/alerts", async (_req, res) => {
  try {
    const alerts = await Alert.find().sort({ ts: -1 }).limit(200);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/alert", async (req, res) => {
  try {
    const data = normalizeAlert(req.body);
    const alert = await Alert.create(data);
    io.emit("alert", alert);
    res.status(201).json(alert);
  } catch (err) {
    res.status(400).json({ error: err.message || "Bad payload" });
  }
});

/* ========= Socket.IO logs ========= */
io.on("connection", (socket) => {
  console.log("🛰️ WS client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("🛰️ WS client disconnected:", socket.id);
  });
});

/* ========= Start ========= */
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
