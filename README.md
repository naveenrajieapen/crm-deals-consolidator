CRM Deals Consolidation

Full Stack AI-Powered Document Consolidation System
🎯 Objective
This project is a Full Stack AI-powered document consolidation system built for the CRM Deals Consolidation domain.
It:
•	Accepts multiple file formats (CSV, Excel, PDF, Images, ZIP)
•	Extracts structured data using OCR + Groq LLM
•	Normalizes different formats into a single CRM schema
•	Stores structured output in Supabase (PostgreSQL)
•	Allows export of consolidated data as Excel
________________________________________
🚀 Live Deployment
Frontend (Vercel):
👉 https://crm-deals-consolidator.vercel.app/

Backend (Render – Dockerized):
👉 https://crm-deals-consolidator-backend-docker.onrender.com

GitHub Repository:
👉 https://github.com/naveenrajieapen/crm-deals-consolidator
________________________________________
🏗 Architecture Overview
React (Vercel)
       │
       ▼
FastAPI Backend (Render - Docker)
       │
       ├── Supabase (PostgreSQL)
       ├── Groq LLM API
       └── Tesseract OCR
________________________________________
🔄 Processing Flow
Step 1 – File Upload
Frontend (React) supports:
•	CSV
•	XLSX
•	PDF
•	JPG / PNG
•	ZIP (multiple files)
Files are validated and sent to the backend.
________________________________________
Step 2 – Extraction Layer
Structured Files (CSV / XLSX)
•	Parsed directly
•	Headers normalized
•	Converted into unified CRM schema
PDF
•	Text extracted using pypdf
Images (JPG / PNG)
•	OCR using Tesseract
•	Raw text extracted
ZIP
•	Extracted safely
•	Supported files listed
•	Manual processing per selected file
________________________________________
Step 3 – LLM Structuring (Mandatory AI Step)
For unstructured documents (PDF / Image):
1.	Raw text extracted
2.	Sent to Groq LLM
3.	LLM instructed to:
o	Extract CRM fields
o	Normalize field names
o	Return strictly valid JSON
4.	JSON validated
5.	Data inserted into database
________________________________________
🧠 LLM Prompt Strategy
The system uses a strict JSON-only prompt.
Example system instruction:
You extract CRM deals from text and return ONLY JSON.

Return a single JSON object with this shape:

{
  "deals": [
    {
      "deal_id": "string",
      "client_name": "string",
      "deal_value": number_or_null,
      "stage": "string",
      "closing_probability": number_or_null,
      "owner": "string",
      "expected_close_date": "YYYY-MM-DD_or_empty"
    }
  ]
}
Rules enforced:
•	No commentary
•	Valid JSON only
•	Missing fields → empty string or null
•	Max 50 records
This ensures consistent schema normalization across different document types.
________________________________________
🗄 Database Schema (Supabase / PostgreSQL)
Table: deals
Column	Type
deal_id	text
client_name	text
deal_value	integer
stage	text
closing_probability	integer
owner	text
expected_close_date	date
upload_timestamp	timestamp
processing_status	text
________________________________________
Table: documents
Column	Type
id	uuid
source_file	text
file_type	text
raw_text	text
upload_timestamp	timestamp
processing_status	text
________________________________________
📤 Export Functionality
Endpoint:
GET /export
Returns:
•	Consolidated CRM deals
•	Excel file (.xlsx)
•	Generated dynamically
________________________________________
📊 Domain Chosen
Option 4 – CRM Deals Consolidation
Final Unified Schema:
•	deal_id
•	client_name
•	deal_value
•	stage
•	closing_probability
•	owner
•	expected_close_date
________________________________________
🧰 Tech Stack
Frontend
•	ReactJS
•	Vite
•	Deployed on Vercel
Backend
•	Python FastAPI
•	Dockerized
•	Hosted on Render
AI / OCR
•	Groq LLM (llama-3.3-70b-versatile)
•	Tesseract OCR
•	pypdf for PDF parsing
Database
•	Supabase (PostgreSQL)
________________________________________
🧪 Supported File Types
Type	Handling
CSV	Direct structured parsing
XLSX	First sheet parsed
PDF	Text extraction + LLM structuring
JPG / PNG	OCR + LLM structuring
ZIP	Safe extraction + manual processing
________________________________________
⚙️ Key Engineering Decisions
•	Strict JSON enforcement from LLM to prevent malformed data
•	Header normalization to handle schema variations
•	ZIP safe extraction (prevents path traversal)
•	Manual LLM triggering to control API costs
•	Dockerized backend for portability
________________________________________
🧩 Challenges Faced
1.	Handling inconsistent headers across Excel formats
2.	Ensuring LLM returns valid JSON (strict prompt enforcement required)
3.	OCR variability across image quality
4.	CORS configuration during deployment
5.	Handling file uploads across multiple environments
________________________________________
💰 Cost Estimation (If Scaled)
Assuming:
•	1,000 document uploads per day
•	Average 2 LLM calls per document
Estimated monthly costs:
•	Groq API usage (based on token volume)
•	Supabase (database storage + bandwidth)
•	Render (backend hosting)
•	Vercel (frontend hosting)
Estimated small-scale deployment:
~ $30–$80/month depending on LLM usage
