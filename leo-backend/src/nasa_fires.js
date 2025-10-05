// src/nasa_fires.js
import fetch from "node-fetch";

export async function fetchRecentFires() {
  const url = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/active/VIIRS_SNPP_NRT/world/24h";
  const res = await fetch(url);
  const csv = await res.text();

  const rows = csv.split("\n").slice(1, 10); // 10 derniers
  const alerts = rows.map(line => {
    const [latitude, longitude, brightness, scan, track, acq_date] = line.split(",");
    return {
      type: "FIRE",
      msg: `NASA FIRMS fire detected (${acq_date})`,
      lat: parseFloat(latitude),
      lng: parseFloat(longitude),
      intensity: Math.min(5, Math.round((brightness - 300) / 50)),
      source: "NASA_FIRMS",
    };
  });

  console.log("🔥 Derniers feux NASA:", alerts.length);
  return alerts;
}
