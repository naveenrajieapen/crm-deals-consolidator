import { useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

function pickEndpoint(file) {
  const name = (file?.name || "").toLowerCase();
  const type = (file?.type || "").toLowerCase();

  if (name.endsWith(".csv") || type.includes("csv")) return "/upload/csv";
  if (
    name.endsWith(".xlsx") ||
    type.includes("spreadsheet") ||
    type.includes("excel")
  )
    return "/upload/xlsx";
  if (name.endsWith(".pdf") || type.includes("pdf")) return "/upload/pdf";

  return null;
}

function prettyJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function App() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);

  const endpoint = useMemo(() => (file ? pickEndpoint(file) : null), [file]);
  const apiUrl = endpoint ? `${API_BASE}${endpoint}` : "";

  const isPdf = result?.file_type === "pdf";
  const isDeals = result?.file_type === "csv" || result?.file_type === "xlsx";

  const previewColumns = useMemo(() => {
    if (!isDeals || !result?.preview?.length) return [];
    const first = result.preview[0] || {};
    return Object.keys(first);
  }, [isDeals, result]);

  async function handleUpload() {
    setStatus("");
    setResult(null);

    if (!file) {
      setStatus("Pick a file first.");
      return;
    }

    const ep = pickEndpoint(file);
    if (!ep) {
      setStatus("Unsupported file type. Please upload CSV, XLSX, or PDF.");
      return;
    }

    setBusy(true);
    setStatus("Uploading...");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}${ep}`, {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.detail || `Upload failed (${res.status})`;
        throw new Error(msg);
      }

      setResult(data);
      setStatus("Upload complete.");
    } catch (err) {
      setStatus(String(err?.message || err));
      setResult({ error: String(err?.message || err) });
    } finally {
      setBusy(false);
    }
  }

  async function downloadExcel() {
    setStatus("");

    try {
      const res = await fetch(`${API_BASE}/export`);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);

      const blob = await res.blob();

      // filename from header (if provided)
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="([^"]+)"/i);
      const filename = match ? match[1] : "crm_deals.xlsx";

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatus("Excel downloaded.");
    } catch (err) {
      setStatus(String(err?.message || err));
    }
  }

  return (
    <div className="page">
      <h1>CRM Deals Consolidation</h1>
      <p className="subtitle">Upload CSV, XLSX, or PDF.</p>

      <div className="card">
        <div className="row">
          <input
            type="file"
            accept=".csv,.xlsx,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <button onClick={handleUpload} disabled={!file || busy}>
            {busy ? "Uploading..." : "Upload"}
          </button>

          <button onClick={downloadExcel} disabled={busy}>
            Download Excel
          </button>
        </div>

        {file && (
          <div className="small">
            Selected: <b>{file.name}</b>
            <br />
            Endpoint: <span className="mono">{endpoint || "n/a"}</span>
          </div>
        )}

        {status && <div className="status">{status}</div>}
      </div>

      {/* Preview */}
      {isDeals && result?.preview?.length > 0 && (
        <div className="card">
          <h2>Preview (first 5)</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  {previewColumns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, idx) => (
                  <tr key={idx}>
                    {previewColumns.map((c) => (
                      <td key={c}>{String(row?.[c] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isPdf && (
        <div className="card">
          <h2>PDF Text Preview</h2>
          <div className="small">
            Text length: <b>{result?.text_length ?? 0}</b>
          </div>
          <pre className="pre">{result?.preview || "(no text found)"}</pre>
        </div>
      )}

      {/* Raw response */}
      {result && (
        <div className="card">
          <h2>Response</h2>
          <pre className="pre">{prettyJson(result)}</pre>
        </div>
      )}
    </div>
  );
}