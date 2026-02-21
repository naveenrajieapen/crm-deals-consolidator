import { useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

function pickEndpoint(file) {
  const name = (file?.name || "").toLowerCase();
  const type = (file?.type || "").toLowerCase();

  if (name.endsWith(".zip") || type.includes("zip")) return "/upload/zip";
  if (name.endsWith(".csv") || type.includes("csv")) return "/upload/csv";
  if (name.endsWith(".xlsx") || type.includes("spreadsheet") || type.includes("excel"))
    return "/upload/xlsx";
  if (name.endsWith(".pdf") || type.includes("pdf")) return "/upload/pdf";
  if (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    type.includes("image/")
  )
    return "/upload/image";

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

  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [aiResult, setAiResult] = useState(null);

  // ZIP UI state
  const [zipFiles, setZipFiles] = useState([]); // [{name,file_type,size,checked}]
  const [zipId, setZipId] = useState("");
  const [zipStatus, setZipStatus] = useState("");
  const [zipProcessResult, setZipProcessResult] = useState(null);

  const endpoint = useMemo(() => (file ? pickEndpoint(file) : null), [file]);
  const apiUrl = endpoint ? `${API_BASE}${endpoint}` : "";

  const uploadFileType = result?.file_type || "";
  const uploadedDocumentId = result?.document_id || "";

  const canRunAI = (uploadFileType === "pdf" || uploadFileType === "image") && uploadedDocumentId;

  const dealPreviewRows = Array.isArray(result?.preview) ? result.preview : [];
  const dealPreviewCols = useMemo(() => {
    if (!dealPreviewRows.length) return [];
    return Object.keys(dealPreviewRows[0] || {});
  }, [dealPreviewRows]);

  const aiPreviewRows = Array.isArray(aiResult?.preview) ? aiResult.preview : [];
  const aiPreviewCols = useMemo(() => {
    if (!aiPreviewRows.length) return [];
    return Object.keys(aiPreviewRows[0] || {});
  }, [aiPreviewRows]);

  async function handleUpload() {
    setStatus("");
    setResult(null);
    setAiStatus("");
    setAiResult(null);

    setZipFiles([]);
    setZipId("");
    setZipStatus("");
    setZipProcessResult(null);

    if (!file) {
      setStatus("Pick a file first.");
      return;
    }

    const ep = pickEndpoint(file);
    if (!ep) {
      setStatus("Unsupported file type. Please upload ZIP/CSV/XLSX/PDF/PNG/JPG.");
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

      // ZIP behavior: show file list
      if (data.file_type === "zip") {
        const list = Array.isArray(data.supported_files) ? data.supported_files : [];
        setZipId(data.zip_id || "");
        setZipFiles(list.map((f) => ({ ...f, checked: false })));
        setStatus(`ZIP uploaded. Found ${list.length} supported files.`);
        return;
      }

      // normal files status
      if (data.file_type === "csv" || data.file_type === "xlsx") {
        setStatus(`Upload complete. Inserted ${data.inserted_rows ?? 0} rows.`);
      } else if (data.file_type === "pdf") {
        setStatus(`PDF uploaded. Extracted ${data.text_length ?? 0} characters.`);
      } else if (data.file_type === "image") {
        setStatus(`Image uploaded. OCR extracted ${data.text_length ?? 0} characters.`);
      } else {
        setStatus("Upload complete.");
      }
    } catch (err) {
      setStatus(String(err?.message || err));
      setResult({ error: String(err?.message || err) });
    } finally {
      setBusy(false);
    }
  }

  async function runAI(documentId) {
    setAiStatus("");
    setAiResult(null);

    if (!documentId) {
      setAiStatus("No document_id found.");
      return;
    }

    setAiBusy(true);
    setAiStatus("Running AI structuring...");

    try {
      const res = await fetch(`${API_BASE}/documents/${documentId}/structure`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.detail || `AI structuring failed (${res.status})`;
        throw new Error(msg);
      }

      setAiResult(data);
      setAiStatus(
        `AI done. Inserted ${data.inserted_rows ?? 0} structured deals (found ${data.structured_deals ?? 0}).`
      );
    } catch (err) {
      setAiStatus(String(err?.message || err));
      setAiResult({ error: String(err?.message || err) });
    } finally {
      setAiBusy(false);
    }
  }

  function toggleZipFile(name) {
    setZipFiles((prev) =>
      prev.map((f) => (f.name === name ? { ...f, checked: !f.checked } : f))
    );
  }

  function setAllZipFiles(checked) {
    setZipFiles((prev) => prev.map((f) => ({ ...f, checked })));
  }

  async function processSelectedZipFiles() {
    setZipStatus("");
    setZipProcessResult(null);

    if (!zipId) {
      setZipStatus("No zip_id found. Upload a ZIP first.");
      return;
    }

    const selected = zipFiles.filter((f) => f.checked).map((f) => f.name);
    if (selected.length === 0) {
      setZipStatus("Select at least one file to process.");
      return;
    }

    setZipStatus("Processing selected files...");

    try {
      const res = await fetch(`${API_BASE}/zip/${zipId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: selected }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.detail || `Process failed (${res.status})`;
        throw new Error(msg);
      }

      setZipProcessResult(data);
      setZipStatus(
        `Done. Inserted ${data.deals_inserted_total ?? 0} deals. Created ${data.documents_created?.length ?? 0} documents.`
      );
    } catch (err) {
      setZipStatus(String(err?.message || err));
      setZipProcessResult({ error: String(err?.message || err) });
    }
  }

  async function downloadExcel() {
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/export`);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);

      const blob = await res.blob();

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
      <p className="subtitle">
        Upload ZIP/CSV/XLSX/PDF or an image (PNG/JPG). ZIP shows files first; you choose what to process.
      </p>

      <div className="card">
        <div className="row">
          <input
            type="file"
            accept=".zip,.csv,.xlsx,.pdf,.png,.jpg,.jpeg"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <button onClick={handleUpload} disabled={!file || busy}>
            {busy ? "Uploading..." : "Upload"}
          </button>

          <button onClick={downloadExcel} disabled={busy || aiBusy}>
            Download Excel
          </button>
        </div>

        {file && (
          <div className="small">
            Selected: <b>{file.name}</b>
            <br />
            Upload endpoint: <span className="mono">{endpoint || "n/a"}</span>
            <br />
            Full URL: <span className="mono">{apiUrl || ""}</span>
          </div>
        )}

        {status && <div className="status">{status}</div>}

        {canRunAI && (
          <div style={{ marginTop: 12 }}>
            <div className="small">
              Stored as document_id: <span className="mono">{uploadedDocumentId}</span>
            </div>
            <button onClick={() => runAI(uploadedDocumentId)} disabled={aiBusy}>
              {aiBusy ? "Running AI..." : "Run AI Structuring"}
            </button>
            {aiStatus && <div className="status" style={{ marginTop: 10 }}>{aiStatus}</div>}
          </div>
        )}
      </div>

      {/* ZIP: list + manual processing */}
      {result?.file_type === "zip" && (
        <div className="card">
          <h2>ZIP Contents</h2>
          <div className="small">
            zip_id: <span className="mono">{zipId}</span>
          </div>

          {zipFiles.length === 0 ? (
            <div className="small">No supported files found in this ZIP.</div>
          ) : (
            <>
              <div className="row" style={{ marginTop: 10 }}>
                <button onClick={() => setAllZipFiles(true)}>Select all</button>
                <button onClick={() => setAllZipFiles(false)}>Clear</button>
                <button onClick={processSelectedZipFiles}>Process selected</button>
              </div>

              {zipStatus && <div className="status">{zipStatus}</div>}

              <div style={{ marginTop: 10 }}>
                {zipFiles.map((f) => (
                  <label key={f.name} style={{ display: "block", marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!f.checked}
                      onChange={() => toggleZipFile(f.name)}
                      style={{ marginRight: 8 }}
                    />
                    <span className="mono">{f.name}</span>{" "}
                    <span className="small">({f.file_type}, {f.size} bytes)</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {zipProcessResult?.documents_created?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h3>Documents created (PDF/Image)</h3>
              {zipProcessResult.documents_created.map((d) => (
                <div key={d.document_id} className="small" style={{ marginBottom: 8 }}>
                  <span className="mono">{d.name}</span> →{" "}
                  <span className="mono">{d.document_id}</span>{" "}
                  <button
                    style={{ marginLeft: 10 }}
                    onClick={() => runAI(d.document_id)}
                    disabled={aiBusy}
                  >
                    Run AI
                  </button>
                </div>
              ))}
            </div>
          )}

          {zipProcessResult && (
            <>
              <h3 style={{ marginTop: 14 }}>Process result (raw)</h3>
              <pre className="pre">{prettyJson(zipProcessResult)}</pre>
            </>
          )}
        </div>
      )}

      {/* Preview for deals uploads */}
      {(uploadFileType === "csv" || uploadFileType === "xlsx") && dealPreviewRows.length > 0 && (
        <div className="card">
          <h2>Preview (first 5)</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  {dealPreviewCols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dealPreviewRows.map((row, idx) => (
                  <tr key={idx}>
                    {dealPreviewCols.map((c) => (
                      <td key={c}>{String(row?.[c] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview for PDF/image uploads */}
      {(uploadFileType === "pdf" || uploadFileType === "image") && result && (
        <div className="card">
          <h2>{uploadFileType === "pdf" ? "PDF Text Preview" : "OCR Text Preview"}</h2>
          <div className="small">
            Text length: <b>{result?.text_length ?? 0}</b>
          </div>
          <pre className="pre">{result?.preview || "(no text found)"}</pre>
        </div>
      )}

      {/* AI result preview */}
      {aiResult && (
        <div className="card">
          <h2>AI Structured Deals (preview)</h2>

          {aiPreviewRows.length > 0 ? (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    {aiPreviewCols.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aiPreviewRows.map((row, idx) => (
                    <tr key={idx}>
                      {aiPreviewCols.map((c) => (
                        <td key={c}>{String(row?.[c] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="small">No structured deals returned.</div>
          )}

          <h3 style={{ marginTop: 14 }}>AI response (raw)</h3>
          <pre className="pre">{prettyJson(aiResult)}</pre>
        </div>
      )}

      {/* Raw response */}
      {result && (
        <div className="card">
          <h2>Upload Response (raw)</h2>
          <pre className="pre">{prettyJson(result)}</pre>
        </div>
      )}
    </div>
  );
}