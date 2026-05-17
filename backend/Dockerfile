FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Run seed (idempotent — exits early if seeded) then start API
CMD python seed.py || true; uvicorn app.main:app --host 0.0.0.0 --port 8000
