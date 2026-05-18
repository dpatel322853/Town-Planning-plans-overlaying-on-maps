import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const DEFAULT_PDF =
  "https://vmc.gov.in/pdf/2022/TDOTP/Final%20TP/TP%20Scheme,%20Vadodara%20No.%2020%20%28Atladara%29%20%28Final%29.PDF";

const SAMPLE_GCPS = [
  { px: "1250", py: "980", lon: "73.145820", lat: "22.286410", note: "Sample NW road/boundary point" },
  { px: "4320", py: "1020", lon: "73.170250", lat: "22.287100", note: "Sample NE road/boundary point" },
  { px: "4380", py: "3150", lon: "73.171000", lat: "22.263900", note: "Sample SE road/boundary point" },
  { px: "1180", py: "3200", lon: "73.143950", lat: "22.263200", note: "Sample SW road/boundary point" },
];

function App() {
  const [pdfUrl, setPdfUrl] = useState(DEFAULT_PDF);
  const [transform, setTransform] = useState("order1");
  const [minZoom, setMinZoom] = useState(12);
  const [maxZoom, setMaxZoom] = useState(20);
  const [gcps, setGcps] = useState(SAMPLE_GCPS);
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

  const validGcpCount = useMemo(
    () => gcps.filter((g) => g.px && g.py && g.lon && g.lat).length,
    [gcps]
  );

  function updateGcp(index, field, value) {
    const copy = [...gcps];
    copy[index] = { ...copy[index], [field]: value };
    setGcps(copy);
  }

  function addGcp() {
    setGcps([...gcps, { px: "", py: "", lon: "", lat: "", note: "" }]);
  }

  function removeGcp(index) {
    setGcps(gcps.filter((_, i) => i !== index));
  }

  function downloadGcpCsv() {
    const rows = ["pixel_x,pixel_y,longitude,latitude,note"];
    gcps.forEach((g) => {
      const note = String(g.note || "").replaceAll('"', '""');
      rows.push(`${g.px},${g.py},${g.lon},${g.lat},"${note}"`);
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tp20_atladara_gcps.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function generateOverlay() {
    setStatus("");
    setDownloadUrl("");

    if (validGcpCount < 4) {
      setStatus("Error: Minimum 4 valid GCPs are required.");
      return;
    }

    const cleanGcps = gcps
      .filter((g) => g.px && g.py && g.lon && g.lat)
      .map((g) => ({
        px: Number(g.px),
        py: Number(g.py),
        lon: Number(g.lon),
        lat: Number(g.lat),
      }));

    if (cleanGcps.some((g) => Object.values(g).some((v) => Number.isNaN(v)))) {
      setStatus("Error: GCP pixel and coordinate values must be numeric.");
      return;
    }

    const form = new FormData();
    form.append("pdf_url", pdfUrl);
    form.append("transform", transform);
    form.append("min_zoom", String(minZoom));
    form.append("max_zoom", String(maxZoom));
    form.append("gcps_json", JSON.stringify(cleanGcps));

    try {
      setIsBusy(true);
      setStatus("Generating overlay. This may take 1–5 minutes on free hosting...");

      const res = await fetch(`${backendUrl}/generate`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus(`Error: ${data.error || "Unknown backend error"}`);
        return;
      }

      setStatus(data.message || "Overlay generated successfully.");
      setDownloadUrl(`${backendUrl}${data.download_url}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="badges">
            <span>VMC TP Overlay</span>
            <span>GDAL + Poppler</span>
            <span>Render-ready</span>
          </div>
          <h1>TP Plan Overlay Automation</h1>
          <p>
            Convert a VMC TP scheme PDF into a georeferenced GeoTIFF, Google Earth KMZ,
            and web map XYZ tiles using GCP-based automation.
          </p>
        </div>
        <button className="secondary" onClick={downloadGcpCsv}>Download GCP CSV</button>
      </section>

      <section className="grid two">
        <div className="card">
          <h2>1. Input</h2>
          <label>Official TP PDF URL</label>
          <input value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} />

          <label>Transformation</label>
          <select value={transform} onChange={(e) => setTransform(e.target.value)}>
            <option value="order1">Polynomial 1 - faster / rough</option>
            <option value="order2">Polynomial 2 - better with 8+ GCPs</option>
            <option value="tps">Thin Plate Spline - warped scans</option>
          </select>

          <div className="zoom-row">
            <div>
              <label>Min zoom</label>
              <input type="number" value={minZoom} min="0" max="22" onChange={(e) => setMinZoom(Number(e.target.value))} />
            </div>
            <div>
              <label>Max zoom</label>
              <input type="number" value={maxZoom} min="0" max="22" onChange={(e) => setMaxZoom(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2>2. Output</h2>
          <p className="muted">
            The backend generates a ZIP file containing GeoTIFF, KMZ and tile folder.
          </p>
          <div className="metric">
            <span>Valid GCPs</span>
            <strong>{validGcpCount}</strong>
          </div>
          <button className="primary" onClick={generateOverlay} disabled={isBusy}>
            {isBusy ? "Generating..." : "Generate Overlay"}
          </button>
          {status && <p className={status.startsWith("Error") ? "error" : "status"}>{status}</p>}
          {downloadUrl && (
            <a className="download" href={downloadUrl} target="_blank" rel="noreferrer">
              Download GeoTIFF + KMZ + Tiles
            </a>
          )}
        </div>
      </section>

      <section className="card">
        <div className="row-header">
          <div>
            <h2>3. Ground Control Points</h2>
            <p className="muted">
              Replace sample values with actual points from your TP image and map. Minimum 4 points.
            </p>
          </div>
          <button className="secondary" onClick={addGcp}>Add GCP</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Pixel X</th>
                <th>Pixel Y</th>
                <th>Longitude</th>
                <th>Latitude</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {gcps.map((g, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td><input value={g.px} onChange={(e) => updateGcp(index, "px", e.target.value)} /></td>
                  <td><input value={g.py} onChange={(e) => updateGcp(index, "py", e.target.value)} /></td>
                  <td><input value={g.lon} onChange={(e) => updateGcp(index, "lon", e.target.value)} /></td>
                  <td><input value={g.lat} onChange={(e) => updateGcp(index, "lat", e.target.value)} /></td>
                  <td><input value={g.note} onChange={(e) => updateGcp(index, "note", e.target.value)} /></td>
                  <td><button className="danger" onClick={() => removeGcp(index)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card warning">
        <h2>Important</h2>
        <p>
          This app is for visualization and planning review only. Georeferencing scanned TP plans
          may introduce positional error. For legal / property decisions, use certified VMC / VUDA records.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
