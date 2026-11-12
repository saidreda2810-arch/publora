# Production Deployment & Operations Guide

**Application**: SRA Social Publisher  
**Stack**: Node.js v22 + Express + React 19 + Vite  
**Default Port**: 3000  

---

## 1. Quick Start Production Build & Run

```bash
# 1. Install dependencies
npm install

# 2. Run the automated test suite
npm run test

# 3. Build the production bundle
npm run build

# 4. Start production server
npm run start
```

---

## 2. Docker Containerization

### `Dockerfile`
```dockerfile
# Multi-stage Docker build for SRA Social Publisher
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

# Run test suite and build frontend
RUN npx tsx tests/run-all-tests.ts
RUN npm run build

# ------------------------------------------------------------------------------
# Production Runner
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests and production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled frontend and server source
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.ts ./server.ts

# Prepare persistent data directory
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["npx", "tsx", "server.ts"]
```

### `docker-compose.yml`
```yaml
version: '3.8'

services:
  sra-publisher:
    build: .
    container_name: sra_social_publisher
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - APP_URL=https://publisher.yourdomain.com
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - SESSION_SECRET=${SESSION_SECRET}
      - OAUTH_ENCRYPTION_KEY=${OAUTH_ENCRYPTION_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

---

## 3. Google Cloud Run Deployment

Google Cloud Run provides auto-scaling, scale-to-zero, and integrated SSL.

```bash
# 1. Authenticate with Google Cloud
gcloud auth login
gcloud config set project protean-braid-gc9s2

# 2. Build and submit container image
gcloud builds submit --tag gcr.io/protean-braid-gc9s2/sra-publisher:latest

# 3. Deploy to Cloud Run
gcloud run deploy sra-publisher \
  --image gcr.io/protean-braid-gc9s2/sra-publisher:latest \
  --platform managed \
  --region europe-west2 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars="NODE_ENV=production,APP_URL=https://sra-publisher-xxxxx.a.run.app"
```

---

## 4. Nginx Reverse Proxy & TLS/SSL Configuration

```nginx
# Nginx Virtual Host configuration for SRA Social Publisher
server {
    listen 80;
    server_name publisher.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name publisher.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/publisher.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/publisher.yourdomain.com/privkey.pem;

    # SSL hardening
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Max upload limit matching backend (100MB)
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket & upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static uploads caching
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000/uploads/;
        proxy_cache_valid 200 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }
}
```

---

## 5. Health Monitoring & Observability

- **Liveness & Readiness Probe**: `GET http://localhost:3000/health`
- **Telemetry Metrics**: `GET http://localhost:3000/api/system/status`
- **Scheduler Heartbeat**: `GET http://localhost:3000/api/scheduler/status`
