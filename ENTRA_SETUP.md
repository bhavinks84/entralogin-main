# Microsoft Entra External ID Setup

Use this guide for the invitation-based authentication flow.

## 1. Create or Select External Tenant

1. Open Microsoft Entra admin center.
2. Switch to your External ID tenant.
3. Note tenant values:
- Tenant ID -> `ENTRA_TENANT_ID`
- Initial domain (`*.onmicrosoft.com`) -> `ENTRA_TENANT_DOMAIN`
- Subdomain portion -> `ENTRA_TENANT_SUBDOMAIN`

## 2. Register App

1. App registrations -> New registration.
2. Platform: Web.
3. Add redirect URI matching your runtime app URL.

Examples:

- Local single-port: `http://localhost:5000/api/auth/entra/callback`
- Production: `https://auth.your-domain.com/api/auth/entra/callback`

Save:

- Application (client) ID -> `ENTRA_CLIENT_ID`

## 3. Create Client Secret

1. Certificates & secrets -> New client secret.
2. Copy secret value immediately -> `ENTRA_CLIENT_SECRET`.

## 4. Add API Permissions (Microsoft Graph)

Add application permissions:

- `User.Invite.All`
- `User.Read.All`
- `Organization.Read.All`

Grant admin consent.

## 5. Configure Environment

Update `backend/.env`:

```env
ENTRA_CLIENT_ID=...
ENTRA_CLIENT_SECRET=...
ENTRA_TENANT_ID=...
ENTRA_TENANT_SUBDOMAIN=...
ENTRA_TENANT_DOMAIN=...onmicrosoft.com
ENTRA_REDIRECT_URI=http://localhost:5000/api/auth/entra/callback
```

Also set:

```env
FRONTEND_URL=http://localhost:5000
```

If you use split dev ports, set `FRONTEND_URL` to the frontend URL (for example `http://localhost:5173`) but keep `ENTRA_REDIRECT_URI` pointing to the backend callback URL.

## 6. Verify End-to-End

1. Open Register page.
2. Submit an invitation request.
3. Confirm invitation email arrives.
4. Accept invitation.
5. Return to app and click Sign in with Microsoft.
6. Confirm callback succeeds and dashboard loads.

## Common Errors

1. Redirect loop or hangs after invitation acceptance
- Redirect URI mismatch between Entra app registration and `ENTRA_REDIRECT_URI`.

2. Graph permission denied
- Missing admin consent for application permissions.

3. Wrong tenant domain behavior
- `ENTRA_TENANT_DOMAIN` must match your tenant initial `*.onmicrosoft.com` domain.
