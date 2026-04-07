# Authentication Process Flow

This document describes the currently working, invitation-based flow.

## Core Flow

1. User submits register form (`email`, `displayName`, optional names).
2. Backend sends invitation using Microsoft Graph `/invitations`.
3. User receives invitation email and accepts it.
4. User clicks Sign in with Microsoft in the app.
5. Backend handles OAuth callback, creates/updates local user, issues app cookies.

No password is collected on app registration.

## Actors

- Frontend app (React)
- Backend API (Express)
- Microsoft Entra External ID
- Microsoft Graph API
- MongoDB (local user mirror)
- Redis (refresh token lifecycle)

## Invitation Registration Sequence

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend
    participant Graph as Microsoft Graph
    participant User as End User

    UI->>API: POST /api/auth/register
    API->>Graph: POST /v1.0/invitations
    Graph-->>API: invitation + invitedUser.id
    API-->>UI: 201 Invitation sent
    Graph-->>User: Invitation email
```

## Microsoft Sign-In Sequence

```mermaid
sequenceDiagram
    participant Browser
    participant API as Backend
    participant Entra as Microsoft Entra
    participant DB as MongoDB
    participant Redis

    Browser->>API: GET /api/auth/entra
    API-->>Browser: state cookie + redirect to Entra
    Browser->>Entra: Authenticate user
    Entra-->>Browser: Redirect /api/auth/entra/callback?code=...
    Browser->>API: Callback request
    API->>API: Validate state
    API->>Entra: Exchange code for tokens (MSAL)
    API->>DB: Find/create local user by Entra identity
    API->>Redis: Store refresh token record
    API-->>Browser: Set HttpOnly cookies + redirect /dashboard
```

## Session Model

After successful Entra authentication, backend issues app tokens:

- Access token: short-lived
- Refresh token: long-lived, rotated and revocable

Both are sent as HttpOnly cookies.

## Endpoints Involved

- `POST /api/auth/register` -> send invitation
- `GET /api/auth/entra` -> start OAuth flow
- `GET /api/auth/entra/callback` -> complete OAuth flow
- `GET /api/auth/session` -> check active session
- `POST /api/auth/refresh` -> rotate refresh token
- `POST /api/auth/logout` -> revoke refresh + clear cookies

## Required Entra/Graph Permissions

Application permissions used by invitation flow include:

- `User.Invite.All`
- `User.Read.All`
- `Organization.Read.All`

Admin consent must be granted in the same tenant configured in `ENTRA_TENANT_ID`.

## Optional Legacy Paths

OTP and password-reset endpoints still exist, but they are optional and not required for the invitation-based core flow.
