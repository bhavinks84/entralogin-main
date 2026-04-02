# Authentication Process Flow

This project uses Microsoft Entra External ID for identity, but the app still maintains its own local user record and JWT session.

There are two distinct layers:

1. Entra proves who the user is or stores their credential.
2. The backend creates or updates the local MongoDB user and issues the app's own tokens.

---

## High-Level Model

- Entra account: the identity account created in Microsoft Entra External ID.
- Local app user: the MongoDB user document used for roles, profile, and app data.
- App session: the JWT access token and refresh token stored in HttpOnly cookies.

This means a successful Entra sign-in does not directly log the user into the app by itself. The backend still exchanges the Entra result for app-specific tokens.

---

## Direct Registration Flow

The direct registration form creates the account in Entra first, then mirrors it into the local database.

### What happens

1. The frontend registration form submits `email`, `displayName`, optional name fields, and `password` to `POST /api/auth/register`.
2. The backend validates that Entra is configured.
3. The backend calls Microsoft Graph and creates a local Entra account in the External tenant.
4. The backend saves or updates the matching MongoDB user with `entraExternalId` set to the Entra user id.
5. The API returns a success message telling the user to continue with Microsoft sign-in.

### Important detail

Registration does not immediately create an app session. It provisions the Entra identity first. The user then signs in through the Entra login flow, and only after that does the app issue its own cookies.

### Sequence

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Graph as Microsoft Graph
    participant DB as MongoDB

    UI->>API: POST /api/auth/register
    API->>Graph: Create Entra External ID user
    Graph-->>API: Entra user id
    API->>DB: Create or update local user
    DB-->>API: Local user saved
    API-->>UI: Account created in Entra
```

---

## OTP Flow

The OTP flow is separate from direct registration, but it can also provision users into Entra.

### What happens

1. The frontend requests an OTP with `POST /api/auth/otp/request`.
2. The user submits the OTP to `POST /api/auth/otp/verify`.
3. If the user is new, the backend creates the local MongoDB user.
4. The backend also attempts to provision the same email into Entra External ID.
5. The backend issues app JWT tokens and stores them as HttpOnly cookies.

### Why this exists

This lets an email-based user later use the Entra-based sign-in path, because the app tries to keep the Entra identity and local user record aligned.

---

## Entra Login Flow

The Microsoft sign-in button starts an OAuth/OpenID Connect flow through the backend.

### What happens

1. The frontend redirects the browser to `GET /api/auth/entra`.
2. The backend generates a random `state` value and stores it in a short-lived cookie.
3. The backend builds an MSAL authorization URL and redirects the browser to Microsoft.
4. The user signs in on the Entra-hosted page.
5. Microsoft redirects back to `GET /api/auth/entra/callback` with an authorization code.
6. The backend validates the `state` cookie to prevent CSRF.
7. The backend exchanges the code for tokens using MSAL.
8. The backend reads the Entra claims, especially the user id and email.
9. The backend finds or creates the local MongoDB user and links it with `entraExternalId`.
10. The backend issues its own access token and refresh token.
11. The backend stores those tokens in HttpOnly cookies and redirects the user to the dashboard.

### Sequence

```mermaid
sequenceDiagram
    participant Browser
    participant API as Backend API
    participant Entra as Microsoft Entra
    participant DB as MongoDB
    participant Redis as Redis

    Browser->>API: GET /api/auth/entra
    API-->>Browser: Set oauth_state cookie + redirect to Entra
    Browser->>Entra: User signs in
    Entra-->>Browser: Redirect with auth code
    Browser->>API: GET /api/auth/entra/callback?code=...
    API->>API: Validate state cookie
    API->>Entra: Exchange code for tokens
    Entra-->>API: ID token claims
    API->>DB: Find or create local user
    API->>Redis: Store refresh token allowlist entry
    API-->>Browser: Set access/refresh cookies + redirect /dashboard
```

---

## How Entra Creation Works

User creation in Entra happens through Microsoft Graph using application permissions.

The backend sends a request to Graph's `/users` endpoint with:

- `identities.signInType = emailAddress`
- `identities.issuer = <tenant>.onmicrosoft.com`
- `identities.issuerAssignedId = user's email`
- `passwordProfile.password = submitted password` for direct registration, or a generated password for OTP provisioning

This is why the Entra setup requires application permissions such as `User.ReadWrite.All` and `Organization.Read.All`.

---

## How App Login Works After Entra Authentication

After Entra authenticates the user, the backend does not reuse the Entra token directly for app authorization.

Instead, it does the following:

1. Creates a short-lived app access token.
2. Creates a longer-lived refresh token.
3. Stores refresh token state in Redis.
4. Sends both tokens as HttpOnly cookies.

The app then uses those cookies for:

- protected API access
- session restore on page load
- refresh token rotation
- logout and token revocation

This keeps the application session model independent from the Microsoft token lifecycle.

---

## Files Involved

- `frontend/src/services/authService.js`: starts registration, OTP, and Entra login requests.
- `backend/src/routes/auth.js`: main registration, OTP, callback, session, refresh, and logout routes.
- `backend/src/services/entraUserService.js`: Microsoft Graph user creation and lookup.
- `backend/src/config/msal.js`: MSAL auth URL and code exchange logic.
- `backend/src/services/tokenService.js`: app JWT issuance, cookie handling, and refresh rotation.

---

## Short Summary

- Direct registration creates the user in Entra first, then mirrors that user locally.
- Entra login authenticates the user with Microsoft, then the backend creates the app session.
- Local MongoDB users are still required because the app stores roles and profile state outside Entra.
- Redis is used to manage refresh token validity for logout and rotation.