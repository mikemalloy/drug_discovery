# backend/Dockerfile
# Build context must be the project root: docker build -f backend/Dockerfile .
FROM python:3.12-slim

WORKDIR /app

# System deps required by RDKit
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (large, separate layer for caching)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python dependencies
COPY backend/requirements.txt /tmp/requirements.txt
RUN grep -v '^torch' /tmp/requirements.txt | \
    grep -v '^#' | \
    grep -v '^pytest' | \
    grep -v '^httpx' | \
    pip install --no-cache-dir -r /dev/stdin

# Pre-download model from HuggingFace Hub into image layer (runs once at build time)
# Container starts instantly — no download delay at runtime
RUN python -c "\
from transformers import AutoTokenizer, AutoModelForSequenceClassification; \
AutoModelForSequenceClassification.from_pretrained('mike-malloy/chemberta-tox21-multitarget'); \
AutoTokenizer.from_pretrained('mike-malloy/chemberta-tox21-multitarget'); \
print('Model cached.')"

# Copy application source
COPY backend/server.py backend/inference.py backend/chemistry.py backend/report.py /app/

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
