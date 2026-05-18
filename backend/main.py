from fastapi import FastAPI, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import pathlib
import uuid
import json
import requests
import zipfile
import shutil
import os

app = FastAPI(title="TP Plan Overlay Automation API", version="1.0.0")

# For production, replace ["*"] with your frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORK_DIR = pathlib.Path(os.getenv("WORK_DIR", "work"))
WORK_DIR.mkdir(exist_ok=True)

MAX_GCPS = 50

@app.get("/")
def health():
    return {
        "status": "running",
        "message": "TP Overlay Automation API",
        "docs": "/docs"
    }


def run_cmd(cmd, cwd=None):
    """Run a shell command safely and return stderr/stdout on failure."""
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"Command failed: {' '.join(cmd)}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )
    return proc


def clean_old_jobs(max_jobs=30):
    """Simple cleanup to avoid filling disk on free deployments."""
    jobs = sorted([p for p in WORK_DIR.iterdir() if p.is_dir()], key=lambda p: p.stat().st_mtime)
    for job in jobs[:-max_jobs]:
        shutil.rmtree(job, ignore_errors=True)


@app.post("/generate")
def generate_overlay(
    pdf_url: str = Form(...),
    gcps_json: str = Form(...),
    transform: str = Form("order1"),
    min_zoom: int = Form(12),
    max_zoom: int = Form(20),
):
    """
    Generate georeferenced GeoTIFF, KMZ, and XYZ tiles from a TP plan PDF URL and GCPs.

    gcps_json format:
    [
      {"px": 1250, "py": 980, "lon": 73.145820, "lat": 22.286410},
      ...
    ]
    """
    clean_old_jobs()

    job_id = str(uuid.uuid4())
    job_dir = WORK_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = job_dir / "tp_plan.pdf"
    png_base = job_dir / "tp_plan"
    png_path = job_dir / "tp_plan.png"
    gcps_tif = job_dir / "tp_plan_gcps.tif"
    georef_tif = job_dir / "tp_plan_georef.tif"
    kmz_path = job_dir / "tp_plan_overlay.kmz"
    tiles_dir = job_dir / "tiles"
    zip_path = job_dir / "tp_overlay_outputs.zip"

    try:
        if not pdf_url.lower().startswith(("http://", "https://")):
            return JSONResponse({"error": "Only HTTP/HTTPS PDF URLs are supported."}, status_code=400)

        # 1. Download PDF
        response = requests.get(pdf_url, timeout=90, headers={"User-Agent": "TP-Overlay-App/1.0"})
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        if "pdf" not in content_type and not pdf_url.lower().endswith(".pdf"):
            # Some government servers may not return correct content-type, so this is a soft check.
            pass
        pdf_path.write_bytes(response.content)

        # 2. Convert first PDF page to PNG at 300 DPI
        run_cmd([
            "pdftoppm",
            "-png",
            "-r",
            "300",
            "-singlefile",
            str(pdf_path),
            str(png_base),
        ])

        if not png_path.exists():
            return JSONResponse({"error": "PDF to PNG conversion failed."}, status_code=500)

        # 3. Parse and validate GCPs
        gcps = json.loads(gcps_json)
        if not isinstance(gcps, list):
            return JSONResponse({"error": "gcps_json must be a list."}, status_code=400)
        if len(gcps) < 4:
            return JSONResponse({"error": "Minimum 4 GCPs are required."}, status_code=400)
        if len(gcps) > MAX_GCPS:
            return JSONResponse({"error": f"Maximum {MAX_GCPS} GCPs are allowed."}, status_code=400)

        clean_gcps = []
        for g in gcps:
            clean_gcps.append({
                "px": float(g["px"]),
                "py": float(g["py"]),
                "lon": float(g["lon"]),
                "lat": float(g["lat"]),
            })

        # 4. Attach GCPs using gdal_translate
        translate_cmd = ["gdal_translate", "-of", "GTiff"]
        for g in clean_gcps:
            translate_cmd += ["-gcp", str(g["px"]), str(g["py"]), str(g["lon"]), str(g["lat"])]
        translate_cmd += [str(png_path), str(gcps_tif)]
        run_cmd(translate_cmd)

        # 5. Warp to WGS84
        warp_cmd = ["gdalwarp", "-overwrite", "-r", "cubic", "-t_srs", "EPSG:4326"]
        if transform == "order2":
            warp_cmd += ["-order", "2"]
        elif transform == "tps":
            warp_cmd += ["-tps"]
        else:
            warp_cmd += ["-order", "1"]
        warp_cmd += [str(gcps_tif), str(georef_tif)]
        run_cmd(warp_cmd)

        # 6. Generate KMZ super-overlay
        run_cmd([
            "gdal_translate",
            "-of",
            "KMLSUPEROVERLAY",
            str(georef_tif),
            str(kmz_path),
        ])

        # 7. Generate XYZ tiles
        min_zoom = max(0, min(int(min_zoom), 22))
        max_zoom = max(min_zoom, min(int(max_zoom), 22))
        run_cmd([
            "gdal2tiles.py",
            "-z",
            f"{min_zoom}-{max_zoom}",
            "-w",
            "none",
            str(georef_tif),
            str(tiles_dir),
        ])

        # 8. Add metadata
        metadata = {
            "job_id": job_id,
            "source_pdf_url": pdf_url,
            "transform": transform,
            "min_zoom": min_zoom,
            "max_zoom": max_zoom,
            "gcp_count": len(clean_gcps),
            "outputs": ["tp_plan_georef.tif", "tp_plan_overlay.kmz", "tiles/"]
        }
        (job_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        # 9. Package outputs
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(georef_tif, "tp_plan_georef.tif")
            z.write(kmz_path, "tp_plan_overlay.kmz")
            z.write(job_dir / "metadata.json", "metadata.json")
            for file in tiles_dir.rglob("*"):
                if file.is_file():
                    z.write(file, file.relative_to(job_dir))

        return {
            "job_id": job_id,
            "message": "Overlay generated successfully.",
            "download_url": f"/download/{job_id}",
            "tile_preview_url": f"/tiles/{job_id}/tilemapresource.xml",
        }

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/download/{job_id}")
def download_output(job_id: str):
    zip_path = WORK_DIR / job_id / "tp_overlay_outputs.zip"
    if not zip_path.exists():
        return JSONResponse({"error": "Output not found."}, status_code=404)
    return FileResponse(zip_path, filename="tp_overlay_outputs.zip", media_type="application/zip")


@app.get("/tiles/{job_id}/{path:path}")
def serve_tile(job_id: str, path: str):
    tile_file = WORK_DIR / job_id / "tiles" / path
    if not tile_file.exists() or not tile_file.is_file():
        return JSONResponse({"error": "Tile not found."}, status_code=404)
    return FileResponse(tile_file)
