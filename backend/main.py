from fastapi import FastAPI, UploadFile, File
from pathlib import Path
import csv
import time
import io
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

app = FastAPI(
    title="CRM Deals Consolidation",
    version="0.1.0"
)

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


class Deal(BaseModel):
    deal_id: str
    client_name: str
    deal_value: Optional[int] = None
    stage: str
    closing_probability: Optional[int] = None
    owner: str
    expected_close_date: Optional[date] = None


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
    safe_name = (file.filename or "upload.csv").replace(" ", "_")
    saved_name = f"{int(time.time())}_{safe_name}"
    saved_path = UPLOADS_DIR / saved_name

    contents = await file.read()
    saved_path.write_bytes(contents)

    upload_timestamp = datetime.utcnow().isoformat() + "Z"
    processing_status = "previewed"

    # Read file and clean wrapping quotes (Excel sometimes quotes entire rows)
    text = saved_path.read_text(encoding="utf-8-sig")
    cleaned_lines = []

    for line in text.splitlines():
        line = line.strip()
        if line.startswith('"') and line.endswith('"'):
            line = line[1:-1]
        cleaned_lines.append(line)

    cleaned_text = "\n".join(cleaned_lines)

    # Parse cleaned CSV
    reader = csv.DictReader(io.StringIO(cleaned_text), delimiter=",")

    headers = reader.fieldnames or []
    preview_rows = []
    total_rows = 0

    for i, row in enumerate(reader):
        total_rows += 1

        deal = Deal(
            deal_id=str(row.get("deal_id", "")).strip(),
            client_name=str(row.get("client_name", "")).strip(),
            deal_value=to_int(row.get("deal_value", "")),
            stage=str(row.get("stage", "")).strip(),
            closing_probability=to_int(row.get("closing_probability", "")),
            owner=str(row.get("owner", "")).strip(),
            expected_close_date=to_date(row.get("expected_close_date", "")),
        )

        if i < 5:
            preview_rows.append(deal.model_dump())

    return {
        "saved_as": saved_name,
        "upload_timestamp": upload_timestamp,
        "processing_status": processing_status,
        "headers": headers,
        "total_rows": total_rows,
        "preview": preview_rows
    }