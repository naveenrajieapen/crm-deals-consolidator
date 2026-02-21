from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pathlib import Path
import csv
import io
import os
import time
from datetime import date, datetime
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

from openpyxl import Workbook, load_workbook
from pypdf import PdfReader


# Load .env from backend folder
ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

app = FastAPI(title="CRM Deals Consolidation", version="0.1.0")

# allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


def to_int(value):
    try:
        return int(str(value).strip())
    except Exception:
        return None


def to_date(value):
    try:
        return date.fromisoformat(str(value).strip())
    except Exception:
        return None


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"app": "crm-deals-consolidator", "status": "running"}


@app.post("/upload/csv")
async def upload_csv(file: UploadFile = File(...)):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured. Check backend/.env")

    safe_name = (file.filename or "upload.csv").replace(" ", "_")
    saved_name = f"{int(time.time())}_{safe_name}"
    saved_path = UPLOADS_DIR / saved_name

    contents = await file.read()
    saved_path.write_bytes(contents)

    upload_timestamp = datetime.utcnow().isoformat() + "Z"
    processing_status = "inserted"

    text = saved_path.read_text(encoding="utf-8-sig", errors="replace")

    # simple cleanup: remove extra wrapping quotes per line if any
    cleaned_lines = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('"') and line.endswith('"'):
            line = line[1:-1]
        cleaned_lines.append(line)
    cleaned_text = "\n".join(cleaned_lines)

    reader = csv.DictReader(io.StringIO(cleaned_text), delimiter=",")

    headers = reader.fieldnames or []
    preview = []
    rows_to_insert = []
    total_rows = 0

    for i, row in enumerate(reader):
        total_rows += 1

        deal = {
            "deal_id": str(row.get("deal_id", "")).strip(),
            "client_name": str(row.get("client_name", "")).strip(),
            "deal_value": to_int(row.get("deal_value", "")),
            "stage": str(row.get("stage", "")).strip(),
            "closing_probability": to_int(row.get("closing_probability", "")),
            "owner": str(row.get("owner", "")).strip(),
            "expected_close_date": None,
            "upload_timestamp": upload_timestamp,
            "processing_status": processing_status,
        }

        d = to_date(row.get("expected_close_date", ""))
        if d:
            deal["expected_close_date"] = d.isoformat()

        rows_to_insert.append(deal)

        if i < 5:
            preview.append(deal)

    try:
        result = supabase.table("deals").insert(rows_to_insert).execute()
        inserted_rows = len(result.data) if result.data else 0
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase insert failed: {e}")

    return {
        "file_type": "csv",
        "saved_as": saved_name,
        "upload_timestamp": upload_timestamp,
        "processing_status": processing_status,
        "headers": headers,
        "total_rows": total_rows,
        "inserted_rows": inserted_rows,
        "preview": preview,
    }


@app.post("/upload/xlsx")
async def upload_xlsx(file: UploadFile = File(...)):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured. Check backend/.env")

    safe_name = (file.filename or "upload.xlsx").replace(" ", "_")
    saved_name = f"{int(time.time())}_{safe_name}"
    saved_path = UPLOADS_DIR / saved_name

    contents = await file.read()
    saved_path.write_bytes(contents)

    upload_timestamp = datetime.utcnow().isoformat() + "Z"
    processing_status = "inserted"

    try:
        wb = load_workbook(saved_path, data_only=True)
        sheet = wb.worksheets[0]  # always first sheet
        sheet_name = sheet.title
        rows = list(sheet.iter_rows(values_only=True))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read XLSX: {e}")

    if not rows or len(rows) < 2:
        return {
            "file_type": "xlsx",
            "saved_as": saved_name,
            "sheet_used": sheet_name,
            "upload_timestamp": upload_timestamp,
            "processing_status": "empty",
            "total_rows": 0,
            "inserted_rows": 0,
            "preview": [],
        }

    headers = [str(h).strip() if h is not None else "" for h in rows[0]]

    preview = []
    rows_to_insert = []
    total_rows = 0

    for i, values in enumerate(rows[1:]):
        row = {}
        for idx, h in enumerate(headers):
            if not h:
                continue
            row[h] = values[idx] if idx < len(values) else None

        total_rows += 1

        deal = {
            "deal_id": str(row.get("deal_id", "")).strip(),
            "client_name": str(row.get("client_name", "")).strip(),
            "deal_value": to_int(row.get("deal_value", "")),
            "stage": str(row.get("stage", "")).strip(),
            "closing_probability": to_int(row.get("closing_probability", "")),
            "owner": str(row.get("owner", "")).strip(),
            "expected_close_date": None,
            "upload_timestamp": upload_timestamp,
            "processing_status": processing_status,
        }

        d = row.get("expected_close_date")
        if isinstance(d, datetime):
            deal["expected_close_date"] = d.date().isoformat()
        elif isinstance(d, date):
            deal["expected_close_date"] = d.isoformat()
        else:
            parsed = to_date(d)
            if parsed:
                deal["expected_close_date"] = parsed.isoformat()

        rows_to_insert.append(deal)

        if i < 5:
            preview.append(deal)

    try:
        result = supabase.table("deals").insert(rows_to_insert).execute()
        inserted_rows = len(result.data) if result.data else 0
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase insert failed: {e}")

    return {
        "file_type": "xlsx",
        "saved_as": saved_name,
        "sheet_used": sheet_name,
        "upload_timestamp": upload_timestamp,
        "processing_status": processing_status,
        "headers": headers,
        "total_rows": total_rows,
        "inserted_rows": inserted_rows,
        "preview": preview,
    }


@app.post("/upload/pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF, extract text, and store raw_text in Supabase (documents table).
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured. Check backend/.env")

    safe_name = (file.filename or "upload.pdf").replace(" ", "_")
    saved_name = f"{int(time.time())}_{safe_name}"
    saved_path = UPLOADS_DIR / saved_name

    contents = await file.read()
    saved_path.write_bytes(contents)

    upload_timestamp = datetime.utcnow().isoformat() + "Z"
    processing_status = "extracted"

    # extract text
    try:
        reader = PdfReader(str(saved_path))
        parts = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                parts.append(page_text)
        raw_text = "\n\n".join(parts).strip()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF text extraction failed: {e}")

    if not raw_text:
        processing_status = "no_text_found"

    doc_row = {
        "source_file": saved_name,
        "file_type": "pdf",
        "raw_text": raw_text,
        "upload_timestamp": upload_timestamp,
        "processing_status": processing_status,
    }

    try:
        result = supabase.table("documents").insert(doc_row).execute()
        inserted_id = result.data[0]["id"] if result.data else None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase insert failed: {e}")

    preview = raw_text[:1200] if raw_text else ""

    return {
        "file_type": "pdf",
        "saved_as": saved_name,
        "upload_timestamp": upload_timestamp,
        "processing_status": processing_status,
        "document_id": inserted_id,
        "text_length": len(raw_text),
        "preview": preview,
    }


@app.get("/export")
def export_deals_to_excel():
    """
    Downloads all deals as an Excel file.
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured. Check backend/.env")

    all_rows = []
    start = 0
    step = 1000

    while True:
        try:
            resp = (
                supabase.table("deals")
                .select("*")
                .range(start, start + step - 1)
                .execute()
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Supabase read failed: {e}")

        chunk = resp.data or []
        all_rows.extend(chunk)

        if len(chunk) < step:
            break

        start += step

    wb = Workbook()
    ws = wb.active
    ws.title = "deals"

    columns = [
        "deal_id",
        "client_name",
        "deal_value",
        "stage",
        "closing_probability",
        "owner",
        "expected_close_date",
        "upload_timestamp",
        "processing_status",
    ]

    ws.append(columns)

    for r in all_rows:
        ws.append([
            r.get("deal_id"),
            r.get("client_name"),
            r.get("deal_value"),
            r.get("stage"),
            r.get("closing_probability"),
            r.get("owner"),
            r.get("expected_close_date"),
            r.get("upload_timestamp"),
            r.get("processing_status"),
        ])

    out = io.BytesIO()
    wb.save(out)
    out.seek(0)

    filename = f"crm_deals_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )