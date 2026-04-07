# EntraLogin

## Overview

This system acts as the authentication gateway for **Qlik QAP (Qlik Analytics Platform)** dashboards. The core flow is:

1. A user registers or logs in through this application.
2. On registration, the user is **automatically created in Microsoft Entra External ID** (Azure AD) via the Microsoft Graph API.
3. **Qlik's user sync** pulls users from Entra / Active Directory and provisions access, so the newly registered user gains permission to view Qlik dashboards without any manual admin step.
4. After a successful login, the user is redirected to the Qlik dashboard with an authenticated session.

In short: **register here → auto-provisioned in Entra → Qlik picks up the user → dashboard access granted.**

---

A production-ready authentication system built with **React + Vite** (frontend) and **Express.js** (backend), using **Microsoft Entra External ID** as the identity provider.

## Features

- **Direct Entra account registration** — create Entra External ID users from the app with email + profile + password
- **Microsoft Entra sign-in** — primary login path via MSAL OAuth2 flow
- **Optional OTP flow** — available as an add-on path, not required for core auth
- **JWT + Refresh token rotation** stored in HttpOnly cookies (not localStorage)
- **CSRF protection** on OAuth2 state parameter
- **Role-based access control** — `user`, `moderator`, `admin`
- **Admin panel** — user management table + analytics
- **Password reset** flow (email link with hashed token)
- **Rate limiting** on auth endpoints
- **Automatic silent token refresh** via Axios interceptor

---

## Project Structure

```
EntraLogin/
├── backend/                # Express.js API
│   ├── src/
│   │   ├── app.js          # Express app setup
│   │   ├── server.js       # Entry point
│   │   ├── config/
│   │   │   ├── database.js # MongoDB connection
│   │   │   ├── msal.js     # MSAL configuration
│   │   │   └── redis.js    # Redis client
│   │   ├── middleware/
│   │   │   ├── auth.js     # JWT authentication + role guard
│   │   │   ├── rateLimiter.js
│   │   │   └── validate.js
│   │   ├── models/
│   │   │   └── User.js     # Mongoose user schema
│   │   ├── routes/
│   │   │   ├── auth.js     # All /api/auth/* routes
│   │   │   └── admin.js    # All /api/admin/* routes
│   │   └── services/
│   │       ├── otpService.js      # OTP generation + email delivery
│   │       ├── tokenService.js    # JWT issue / rotate / revoke
│   │       └── passwordService.js # Password reset flow
│   └── .env.example
│
├── frontend/               # React + Vite app
│   ├── src/
│   │   ├── App.jsx         # Router + route definitions
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── services/
│   │   │   ├── api.js          # Axios instance with interceptor
│   │   │   ├── authService.js
│   │   │   └── adminService.js
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   ├── OTPInput.jsx       # 6-digit OTP component
│   │   │   │   ├── ProtectedRoute.jsx
│   │   │   │   └── AdminRoute.jsx
│   │   │   └── layout/
│   │   │       ├── Navbar.jsx
│   │   │       └── AppLayout.jsx
│   │   └── pages/
│   │       ├── LoginPage.jsx
│   │       ├── RegisterPage.jsx
│   │       ├── DashboardPage.jsx
│   │       ├── ProfilePage.jsx
│   │       ├── SettingsPage.jsx
│   │       └── admin/
│   │           ├── AdminUsersPage.jsx
│   │           └── AdminAnalyticsPage.jsx
│   └── vite.config.js
│
├── ENTRA_SETUP.md          # Step-by-step Entra External ID guide
└── README.md
```

---

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Redis (optional but recommended for refresh token rotation)
- A Microsoft account (to create the Entra External tenant)

---

## Quick Start

### 1 – Configure Microsoft Entra External ID

Follow **[ENTRA_SETUP.md](./ENTRA_SETUP.md)** to create your External tenant, register the application, and obtain the required credentials.

For a concise end-to-end explanation of how direct registration, Entra sign-in, and app session creation work together, see **[AUTH_PROCESS_FLOW.md](./AUTH_PROCESS_FLOW.md)**.

### 2 – Backend setup

```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
npm install
npm run dev
```

Server starts at `http://localhost:5000`.

### 3 – Frontend setup

```bash
cd frontend
npm install
npm run dev
```

App opens at `http://localhost:3000`. The Vite dev server proxies `/api` → `http://localhost:5000`.

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Public | Create account in Entra External ID and mirror locally |
| GET  | `/api/auth/entra` | Public | Redirect to Entra ID login |
| GET  | `/api/auth/entra/callback` | Public | OAuth2 callback |
| POST | `/api/auth/otp/request` | Public | Optional: send OTP to email |
| POST | `/api/auth/otp/verify` | Public | Optional: verify OTP, create/login user |
| GET  | `/api/auth/me` | JWT | Get current user |
| GET  | `/api/auth/session` | Public | Get current session user or null |
| POST | `/api/auth/logout` | Public | Clear cookies & revoke token |
| POST | `/api/auth/refresh` | Cookie | Rotate refresh token |
| PUT  | `/api/auth/profile` | JWT | Update profile |
| POST | `/api/auth/password/reset-request` | Public | Send reset email |
| POST | `/api/auth/password/reset` | Public | Reset password with token |
| GET  | `/api/admin/users` | JWT + Admin | List users (paginated) |
| PATCH | `/api/admin/users/:id/role` | JWT + Admin | Change user role |
| DELETE | `/api/admin/users/:id` | JWT + Admin | Delete user |
| GET  | `/api/admin/analytics` | JWT + Admin | Usage stats |

---

## Security Notes

- Access tokens expire in **15 minutes**; refresh tokens in **7 days**.
- Refresh tokens are stored in Redis and revoked on logout (token rotation).
- OTPs are stored in Redis with a 10-minute TTL and deleted after first use (optional path).
- Password reset tokens are SHA-256 hashed before being stored in MongoDB.
- CSRF is mitigated on the OAuth2 flow using a random `state` parameter validated via cookie.
- All auth cookies are `HttpOnly`, `SameSite`, and `Secure` in production.
