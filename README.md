🛰️ ECHO-ONE — Emergency Connectivity from Orbit

“When Earth goes silent, the orbit still listens.”

ECHO-ONE is a low-cost, low-power satellite network concept designed to provide emergency and humanitarian connectivity when terrestrial networks fail.
Built as part of the NASA Space Apps Challenge, the project demonstrates a complete prototype — from IoT alert transmission to real-time visualization.

🌍 Overview
As humanity becomes increasingly dependent on connectivity, millions are still isolated during crises.
ECHO-ONE bridges this gap with a humanitarian satellite relay system operating in Low Earth Orbit (LEO).

Key features:
🌐 Humanitarian-as-a-Service (HaaS) model

☀️ Solar-powered ESP32 transmitters (LoRa / MQTT)

🛰️ LEO-based data relay simulation

🗺️ Real-time alert dashboard (React + Leaflet)

🔒 Sustainable & recyclable nanosatellite concept

🧠 Architecture : 
ESP32 (LoRa/MQTT)
      ↓
MQTT Broker (Mosquitto)
      ↓
Node.js Backend (Express + Socket.IO + MongoDB)
      ↓
Frontend Dashboard (React + Leaflet Heatmap)

🧰 Tech Stack : 
| Layer    | Technologies                          |
| -------- | ------------------------------------- |
| Hardware | ESP32, LoRa, Solar panel              |
| Backend  | Node.js, Express, MQTT.js, MongoDB    |
| Frontend | React, Leaflet, Socket.IO client      |
| Tools    | Ngrok (public tunnel), Vite, Mongoose |

💻 Setup Instructions :
./start_demo.sh
./verify_demo.sh
./send_all_alerts.sh
./stop_demo.sh

💻 Public demo link :
https://isela-nonenigmatic-briana.ngrok-free.dev

👥 Team :
4d0h3, Mission Impro and ChatGPT
NASA Space Apps Challenge 2025 — Paris 
