# Kashshaf on a host (Render, Railway, Fly.io or any Docker server).
# Chromium takes the screenshots (for the agent and the evidence); the Noto fonts draw Arabic pages correctly.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV PYTHONUNBUFFERED=1 \
    CHROME_PATH=/usr/bin/chromium \
    ALLOW_LOCAL_TEST_SITES=false \
    KASHSHAF_LOCK_KEYS=1

# The host sets PORT; the server listens on it on every interface.
EXPOSE 8080
CMD ["python", "server.py"]
