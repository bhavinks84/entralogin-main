# Deployment Guide

This guide focuses on a simple, server-agnostic deployment.

## Lightweight Repository Notes

- `node_modules` is intentionally not committed.
- build output (`frontend/dist`) is intentionally not committed.
- runtime logs (for example `deploy.log`) are intentionally not committed.

On any fresh server checkout, always install dependencies before running.

## Recommended Architecture

Use one public Node service:

- Backend Express runs on one port (for example `5000`)
- Backend serves built frontend files (`frontend/dist`)
- Same origin handles UI + API + Entra callback

This avoids port mismatch and removes nginx as a requirement.

## Prerequisites

- Node.js 18+
- MongoDB
- Redis
- Valid Entra app registration and permissions

## 1. Build and Install

```bash
# from repo root
cd frontend
npm ci
npm run build

cd ../backend
npm ci --omit=dev
```

For local development (optional):

```bash
cd backend && npm ci
cd ../frontend && npm ci
```

## 2. Configure Environment

Copy `backend/.env.example` to `backend/.env` and set at least:

```env
NODE_ENV=production
PORT=5000
SERVE_FRONTEND=true
FRONTEND_DIST_PATH=../frontend/dist

FRONTEND_URL=https://auth.your-domain.com
ENTRA_REDIRECT_URI=https://auth.your-domain.com/api/auth/entra/callback

MONGODB_URI=...
REDIS_URL=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...

ENTRA_CLIENT_ID=...
ENTRA_CLIENT_SECRET=...
ENTRA_TENANT_ID=...
ENTRA_TENANT_SUBDOMAIN=...
ENTRA_TENANT_DOMAIN=...onmicrosoft.com
```

## 3. Start Service

```bash
cd backend
npm start
```

Health check:

- `GET /api/health` should return `{"status":"ok"}`

## Docker Deployment (Recommended)

This is the easiest path for most servers.

1. Prepare environment:

```bash
cp backend/.env.example backend/.env
```

Windows PowerShell alternative:

```powershell
Copy-Item backend/.env.example backend/.env
```

2. Update `backend/.env` for single-port deployment:

```env
PORT=5000
SERVE_FRONTEND=true
FRONTEND_DIST_PATH=/app/frontend/dist
FRONTEND_URL=http://localhost:5000
ENTRA_REDIRECT_URI=http://localhost:5000/api/auth/entra/callback
```

3. Run stack:

```bash
docker compose up -d --build
```

4. Verify:

```bash
curl http://localhost:5000/api/health
```

## 4. Run as Service

Use your platform service manager:

- Linux: `systemd`
- Windows: NSSM / Task Scheduler / Windows Service wrapper
- Container platforms: run `npm start` in backend after frontend build

## 5. Entra Redirect URI Rules

Your Entra app redirect URI must exactly match runtime URL:

- `https://auth.your-domain.com/api/auth/entra/callback`

If your app is reachable at `http://localhost:5000` in test, use:

- `http://localhost:5000/api/auth/entra/callback`

## Optional: Split Frontend/Backend in Dev

Dev-only example:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- Vite proxy `/api` -> backend

In this mode set:

- `FRONTEND_URL=http://localhost:5173`
- `ENTRA_REDIRECT_URI=http://localhost:5000/api/auth/entra/callback`

## Troubleshooting

1. `422 password invalid on /register`
- You are likely hitting an old service instance. Verify the frontend proxy target and backend port.

2. Invitation accepted but app keeps loading
- Redirect URI mismatch in Entra app registration.
- Ensure `ENTRA_REDIRECT_URI` and registered redirect URI are identical.

3. Graph permission errors
- Grant admin consent for required Graph app permissions in the same tenant as `ENTRA_TENANT_ID`.
