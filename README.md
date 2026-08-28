# Sky Guardians — Drone Flood Disaster Intelligence & Operations Backend

> **Disaster Response & Aerial Telemetry Command API**  
> Built with **Node.js, Express, and TypeScript**.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables
```bash
cp .env.example .env
```

### 3. Reset Local Assessment Store (Optional)
```bash
npm run seed
```

### 4. Start Development Server
```bash
npm run dev
```

* **API Base URL**: `http://localhost:8000/api/v1`
* **Health Check**: `http://localhost:8000/health`
* **WebSocket**: `ws://localhost:8000`

---

## 📡 API Endpoint Index

### 1. Operational Dashboard
* `GET /api/v1/dashboard/summary` — Aggregated snapshot (Water coverage %, settlements, road accessibility %, infra assets, drone fleet, recent alerts).

### 2. Water Coverage & Hydrology
* `GET /api/v1/water-coverage/summary` — Coverage stats, peak depth, velocity vector.
* `GET /api/v1/water-coverage/zones` — Inundation catchment sectors (`Z-01` to `Z-05`).
* `GET /api/v1/water-coverage/timeline` — Time-series hydrological progression.
* `POST /api/v1/water-coverage/snapshot` — Record a new field hydrological survey.

### 3. Affected Settlements
* `GET /api/v1/settlements` — List settlements with population, households, evacuation status.
* `GET /api/v1/settlements/:id` — Detail of a specific settlement.
* `POST /api/v1/settlements` — Register new settlement or refugee cluster.
* `PUT /api/v1/settlements/:id` — Update water depth / evacuation progress.

### 4. Road Accessibility & Logistics
* `GET /api/v1/roads` — Routes directory with passability % and vehicle clearances.
* `GET /api/v1/roads/:id` — Single route transit status.
* `PUT /api/v1/roads/:id` — Update road obstruction or clearance level.

### 5. Infrastructure Impact
* `GET /api/v1/infrastructure` — Bridges, hospitals, power substations, water utilities.
* `GET /api/v1/infrastructure/:id` — Structural health & backup power diagnostics.
* `PUT /api/v1/infrastructure/:id` — Update asset integrity log.

### 6. Map & GIS Intelligence
* `GET /api/v1/map/google-config` — Google Maps API credentials & default coordinate centers.
* `GET /api/v1/map/layers` — Multi-layer metadata (flood zones, settlements, assets).
* `GET /api/v1/map/flood-zones` — GeoJSON polygon boundaries.

### 7. Drone Missions & Telemetry (Hardware Team Stubs)
* `GET /api/v1/missions` — List all missions and active drone statuses.
* `GET /api/v1/missions/:id/telemetry` — Telemetry snapshot (battery, altitude, GPS, signal).
* `POST /api/v1/missions` — Create new flight mission.
* `PUT /api/v1/missions/:id/status` — Mark mission Active / Completed.

### 8. Computer Vision Detections (ML Team Stubs)
* `GET /api/v1/detections/latest` — Latest AI annotated frame with bounding boxes.
* `GET /api/v1/detections/stats` — Count of detected persons, submerged vehicles, hazards.
* `POST /api/v1/detections/analyze` — Endpoint for ML inference model to submit bounding box outputs.

### 9. Response Planning & Field Units
* `GET /api/v1/units` — Active NDRF squads, swiftwater boat units, medical teams.
* `POST /api/v1/units` — Deploy new field rescue team.
* `PUT /api/v1/units/:id/status` — Update unit deployment status (`En Route` | `On Site` | `Available`).

### 10. Incidents & Historical Records
* `GET /api/v1/incidents` — Filterable by search, severity (`Critical` | `Warning`), status, and page.
* `POST /api/v1/incidents` — Log new field breach or incident.
* `PUT /api/v1/incidents/:id` — Resolve or escalate incident.

### 11. Relief Camps Oversight
* `GET /api/v1/camps` — Camps occupancy, capacity, food/water supply day counters.
* `PUT /api/v1/camps/:id` — Update supply levels (auto-flags Critical when food/water $\le 2$ days).
* `POST /api/v1/camps` — Register new shelter.

### 12. Emergency Alerts
* `GET /api/v1/alerts` — Broadcast log.
* `POST /api/v1/alerts` — Broadcast new alert across channels (triggers real-time WebSocket event).
* `PUT /api/v1/alerts/:id` — Mark alert resolved.

### 13. Flood Impact Analysis
* `GET /api/v1/flood-analysis/timeline` — Chronological hourly evolution.
* `GET /api/v1/flood-analysis/summary` — Regression analysis & 4-hour forecast projections.

### 14. Assessment Report
* `GET /api/v1/report/current` — Live aggregation of all 12 standardized parameters.
* `POST /api/v1/report/generate` — Archive official assessment report snapshot.

---

---

## ☁️ Step-by-Step Cloud Deployment Guide

### Option A: Deploy to Railway (Recommended)
1. Visit **[railway.app](https://railway.app)** and log in with your GitHub account.
2. Click **New Project** $\rightarrow$ **Deploy from GitHub repo**.
3. Select `Shashankpr17/drone_backend`.
4. Under **Variables**, add:
   * `PORT`: `8000`
   * `NODE_ENV`: `production`
   * `CORS_ORIGIN`: `*`
   * `GOOGLE_MAPS_API_KEY`: `AIzaSyDQ9RcBM265XRW3KXJDqecHs2STMk0jvk8`
5. Railway will automatically run `npm run build` and `npm start`.

### Option B: Deploy to Render
1. Visit **[render.com](https://render.com)** $\rightarrow$ **New Web Service**.
2. Connect `Shashankpr17/drone_backend`.
3. Set **Build Command**: `npm install && npm run build`
4. Set **Start Command**: `npm start`
