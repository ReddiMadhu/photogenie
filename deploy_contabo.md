# PhotoGenic — Contabo VPS Deployment Plan

## Prerequisites
- Your Contabo VPS credentials (IP address, root password from the welcome email)
- Your PhotoGenic codebase (on your local machine at `C:\Users\madhu\Desktop\PhotoGenic`)

---

## Phase 1: Server Setup (~5 minutes)

### Step 1 — SSH into your VPS
```bash
ssh root@<YOUR_CONTABO_IP>
```
Accept the fingerprint prompt and enter your root password from the Contabo welcome email.

### Step 2 — Update system packages
```bash
apt-get update && apt-get upgrade -y
```

### Step 3 — Install Docker, Docker Compose, Git, and Make
```bash
apt-get install -y docker.io docker-compose-v2 git make curl
systemctl enable docker
systemctl start docker
```

### Step 4 — Create a non-root deploy user (security best practice)
```bash
adduser deploy
usermod -aG docker deploy
su - deploy
```

---

## Phase 2: Upload Code (~2 minutes)

### Option A — Git clone (if repo is pushed to GitHub/GitLab)
```bash
git clone <YOUR_REPO_URL> ~/photogenic
cd ~/photogenic
```

### Option B — SCP from your local Windows machine (if no git repo yet)
Run this from **your local PowerShell** (not the VPS):
```powershell
scp -r C:\Users\madhu\Desktop\PhotoGenic deploy@<YOUR_CONTABO_IP>:~/photogenic
```
Then on the VPS:
```bash
cd ~/photogenic
```

---

## Phase 3: Configure Environment (~2 minutes)

### Step 5 — Create the `.env` file
```bash
cp .env.example .env
```

### Step 6 — Edit `.env` with secure production passwords
```bash
nano .env
```

Change these values to strong, unique passwords:
```env
POSTGRES_PASSWORD=<generate-a-strong-password>
MINIO_SECRET_KEY=<generate-a-strong-password>
JWT_SECRET=<generate-a-32-char-random-string>
```

> [!TIP]
> Generate random passwords quickly:
> ```bash
> openssl rand -hex 16
> ```

---

## Phase 4: Build & Launch (~8-12 minutes)

### Step 7 — Build the shared base image
This compiles all Python dependencies (insightface, hdbscan, etc.) once. Takes ~5-8 minutes on first run, then cached.
```bash
docker build -t photogenic-base:latest -f Dockerfile.base .
```

### Step 8 — Build and start all services
```bash
docker compose -f infra/docker-compose.yml up -d --build
```

### Step 9 — Verify all containers are running
```bash
docker ps
```
You should see **8 containers** running:
| Container | Port | Status |
|-----------|------|--------|
| postgres | 5432 | Up |
| qdrant | 6333 | Up |
| redis | 6379 | Up |
| minio | 9000, 9001 | Up |
| api | 8000 | Up |
| ml-inference | 8001 | Up |
| identity | 8002 | Up |
| retrieval | 8003 | Up |
| workers | — | Up |

---

## Phase 5: Initialize Databases (~1 minute)

### Step 10 — Apply PostgreSQL schema
```bash
docker exec -i $(docker ps -qf "name=postgres") \
  psql -U photogenic -d photogenic \
  < services/api/migrations/001_initial_schema.sql
```

### Step 11 — Initialize Qdrant vector collections
```bash
docker exec -it $(docker ps -qf "name=api") \
  python -c "
import sys; sys.path.insert(0, '.')
from infra.qdrant.init_collections import main
main()
"
```

---

## Phase 6: Open Firewall Ports (~1 minute)

### Step 12 — Allow web traffic through the firewall
```bash
# If UFW is active:
ufw allow 8000/tcp   # API Gateway
ufw allow 5173/tcp   # Frontend (if serving via Docker)
ufw allow 9001/tcp   # MinIO Console (optional, for debugging)

# If UFW is not active, use iptables:
iptables -A INPUT -p tcp --dport 8000 -j ACCEPT
iptables -A INPUT -p tcp --dport 5173 -j ACCEPT
```

---

## Phase 7: Verify Everything Works

### Step 13 — Test the API health endpoint
```bash
curl http://localhost:8000/health
```
Expected response:
```json
{"status": "healthy", "service": "api-gateway"}
```

### Step 14 — Test the API docs
Open in your browser:
```
http://<YOUR_CONTABO_IP>:8000/docs
```
You should see the Swagger UI with all 16 API endpoints.

### Step 15 — Test the Qdrant dashboard
```
http://<YOUR_CONTABO_IP>:6333/dashboard
```

### Step 16 — Test the MinIO console
```
http://<YOUR_CONTABO_IP>:9001
```
Login: `minioadmin` / (your MINIO_SECRET_KEY from `.env`)

---

## Phase 8: Deploy the Frontend

### Option A — Serve via Docker (simplest)
Add the frontend build to your compose stack or run it standalone:
```bash
cd ~/photogenic/web
npm install
npm run build
# Serve the built files with a simple static server
docker run -d -p 5173:80 -v $(pwd)/dist:/usr/share/nginx/html:ro nginx:alpine
```

### Option B — Deploy to Cloudflare Pages / Vercel (free, with CDN)
From your **local machine**:
```powershell
cd C:\Users\madhu\Desktop\PhotoGenic\web
npm run build
# Then deploy the `dist/` folder to Cloudflare Pages or Vercel
```
Set the API proxy to point to `http://<YOUR_CONTABO_IP>:8000`.

---

## Quick Reference — Useful Commands

| Action | Command |
|--------|---------|
| View all container logs | `docker compose -f infra/docker-compose.yml logs -f` |
| Restart a specific service | `docker compose -f infra/docker-compose.yml restart api` |
| Stop everything | `docker compose -f infra/docker-compose.yml down` |
| Rebuild after code changes | `docker compose -f infra/docker-compose.yml up -d --build` |
| Check disk usage | `df -h` |
| Check memory usage | `free -h` |
| Monitor containers live | `docker stats` |
