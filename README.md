# EntraLogin

Invitation-based authentication portal using Microsoft Entra External ID.

## What This App Does

1. A user requests access from the register page.
2. Backend sends a Microsoft Graph invitation (`/invitations`).
3. User accepts the invitation from email.
4. User signs in through Microsoft Entra.
5. Backend creates app session cookies (access + refresh) and redirects to dashboard.

This app no longer requires collecting a password at registration.

## Tech Stack

- Frontend: React + Vite
- Backend: Express + MSAL + Microsoft Graph
- Database: MongoDB
- Token/session store: Redis

## Key Features

- Invitation-based registration via Microsoft Graph
- Microsoft Entra sign-in (OAuth authorization code flow)
- Local user mirror with roles (`user`, `moderator`, `admin`)
- Access/refresh token cookies (HttpOnly)
- Refresh token rotation and revocation
- Admin endpoints for user management and analytics
- Optional OTP and password-reset endpoints (not part of core invitation flow)

## Project Structure

```text
entralogin-main/
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   └── services/
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── vite.config.js
│   └── package.json
├── AUTH_PROCESS_FLOW.md
├── ENTRA_SETUP.md
└── DEPLOYMENT.md
```

## Lightweight Repository Notes

- `node_modules` is intentionally not committed.
- frontend build output (`frontend/dist`) is intentionally not committed.
- runtime logs are intentionally not committed.

On any fresh server checkout, always install dependencies before running.

## Local Development

### 1. Configure Entra

Follow ENTRA_SETUP.md.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm ci
npm run dev
```

Default backend URL: `http://localhost:5000`

### 3. Frontend

```bash
cd frontend
npm ci
npm run dev
```

Default frontend URL: `http://localhost:5173`

In dev mode, Vite proxies `/api` to backend.

## Production (No nginx required)

You can deploy as a single Node service:

1. Build frontend
2. Enable backend static serving
3. Run backend on one public port

```bash
cd frontend && npm ci && npm run build
cd ../backend && npm ci --omit=dev
```

Set in `backend/.env`:

```env
PORT=5000
SERVE_FRONTEND=true
FRONTEND_DIST_PATH=../frontend/dist
FRONTEND_URL=https://your-domain.com
ENTRA_REDIRECT_URI=https://your-domain.com/api/auth/entra/callback
```

Then start backend:

```bash
cd backend
npm start
```

## Docker Quick Start

If Docker is available on your server, this is the fastest deployment path.

1. Copy `backend/.env.example` to `backend/.env` and fill required Entra/JWT values.
2. Set these values in `backend/.env`:

```env
PORT=5000
SERVE_FRONTEND=true
FRONTEND_DIST_PATH=/app/frontend/dist
FRONTEND_URL=http://localhost:5000
ENTRA_REDIRECT_URI=http://localhost:5000/api/auth/entra/callback
```

3. Start all services:

```bash
docker compose up -d --build
```

This starts app + MongoDB + Redis and serves the frontend from the backend on port 5000.

## API Snapshot

- `POST /api/auth/register` -> Send Entra invitation
- `GET /api/auth/entra` -> Start Microsoft sign-in
- `GET /api/auth/entra/callback` -> OAuth callback
- `GET /api/auth/session` -> Session probe
- `POST /api/auth/refresh` -> Rotate refresh token
- `POST /api/auth/logout` -> Logout + revoke refresh token
- `GET /api/admin/users` -> Admin user list

## Notes

- nginx is optional. Use it only if you need reverse-proxy/TLS termination patterns outside this app.
- Core auth flow is invitation + Entra sign-in. OTP is optional.
