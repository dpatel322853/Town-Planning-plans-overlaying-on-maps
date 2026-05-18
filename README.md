# TP Plan Overlay Automation

A GitHub-ready deployable web application for converting an official TP scheme PDF into GIS/web-map overlay outputs using GDAL.

Default source configured in the frontend:

- **VMC Final TP Scheme, Vadodara No. 20 (Atladara) (Final)**

> Important: Sample GCPs are placeholders. Replace them with actual pixel and latitude/longitude points before using the output.

---

## Features

- Prefilled VMC TP20 Atladara PDF URL
- Browser form for Ground Control Points (GCPs)
- FastAPI backend using GDAL + Poppler
- Outputs:
  - `tp_plan_georef.tif`
  - `tp_plan_overlay.kmz`
  - `tiles/` XYZ web map tile folder
  - `metadata.json`
- Docker Compose for local testing
- Render-ready deployment files

---

## Folder Structure

```text
tp-overlay-app/
├── backend/
│   ├── Dockerfile
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── App.jsx
│       └── styles.css
├── docker-compose.yml
├── render.yaml
├── .gitignore
└── README.md
```

---

## Local Run

### Prerequisite

Install Docker Desktop.

### Start app

```bash
docker compose up --build
```

Open frontend:

```text
http://localhost:5173
```

Open backend API docs:

```text
http://localhost:8000/docs
```

---

## How to Use

1. Open the frontend.
2. Keep the default TP20 Atladara VMC PDF URL or replace it with another TP plan PDF URL.
3. Replace sample GCPs with actual points.
4. Select transformation:
   - `Polynomial 1` for quick rough overlay.
   - `Polynomial 2` for better fit with 8+ GCPs.
   - `Thin Plate Spline` for distorted scanned maps.
5. Click **Generate Overlay**.
6. Download the ZIP output.

---

## GCP Format

Each GCP needs:

```json
{
  "px": 1250,
  "py": 980,
  "lon": 73.145820,
  "lat": 22.286410
}
```

Where:

- `px` = X pixel coordinate on TP plan image
- `py` = Y pixel coordinate on TP plan image
- `lon` = longitude of matching point on map
- `lat` = latitude of matching point on map

Minimum 4 GCPs are required.

Recommended: 8–12 well-distributed GCPs.

---

## Render Deployment

### Option A: Use `render.yaml`

1. Push this folder to GitHub.
2. In Render, choose **New → Blueprint**.
3. Connect your GitHub repository.
4. Render will detect `render.yaml` and create:
   - Backend Docker web service
   - Frontend static site

After backend URL is created, update this value in `render.yaml` if needed:

```yaml
VITE_BACKEND_URL=https://tp-overlay-api.onrender.com
```

### Option B: Manual Render Setup

#### Backend

- Service type: Web Service
- Environment: Docker
- Root directory: `backend`
- Port: `8000`

#### Frontend

- Service type: Static Site
- Root directory: `frontend`
- Build command:

```bash
npm install && npm run build
```

- Publish directory:

```text
dist
```

- Environment variable:

```text
VITE_BACKEND_URL=https://your-backend-url.onrender.com
```

---

## Output ZIP Contents

```text
tp_overlay_outputs.zip
├── tp_plan_georef.tif
├── tp_plan_overlay.kmz
├── metadata.json
└── tiles/
```

---

## Limitations

- This app does not automatically identify GCPs.
- Final accuracy depends on the quality and distribution of GCPs.
- Use generated overlays only for visualization and planning review.
- Do not use generated overlays for legal/property boundary decisions without certified authority records.

---

## Suggested Next Improvements

- Add an image viewer to click pixel coordinates directly.
- Add a Leaflet map to click matching lat/lon points directly.
- Add live tile preview after generation.
- Add user login and job history.
- Add vector digitization for TP boundaries, roads, plots, and reservations.
