const { ConfidentialClientApplication } = require('@azure/msal-node');
const crypto = require('crypto');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const REQUIRED_GRAPH_APP_ROLES = ['User.Invite.All', 'User.Read.All', 'Organization.Read.All'];

// Separate MSAL instance for Graph API client-credentials flow.
// Uses the standard AAD authority (not the CIAM ciamlogin.com endpoint, which
// is only for interactive/user flows).
let _graphClient = null;

const getGraphClient = () => {
  if (_graphClient) return _graphClient;
  _graphClient = new ConfidentialClientApplication({
    auth: {
      clientId:     process.env.ENTRA_CLIENT_ID,
      authority:    `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`,
      clientSecret: process.env.ENTRA_CLIENT_SECRET,
    },
  });
  return _graphClient;
};

const getGraphToken = async () => {
  const result = await getGraphClient().acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!result?.accessToken) throw new Error('Failed to acquire Microsoft Graph token.');
  return result.accessToken;
};

const decodeJwtPayload = (token = '') => {
  const parts = String(token).split('.');
  if (parts.length < 2) return null;

  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padding = payload.length % 4;
  const normalized = padding ? payload + '='.repeat(4 - padding) : payload;

  try {
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
};

const getTenantDomainsFromGraph = async (token) => {
  const response = await fetch(`${GRAPH_BASE}/organization?$select=verifiedDomains`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 403) {
      console.warn(
        '[Entra] Cannot auto-discover tenant domains from Graph organization endpoint (403). ' +
          'Grant Organization.Read.All application permission with admin consent, or set ENTRA_TENANT_DOMAIN manually.'
      );
    }
    return [];
  }

  const data = await response.json();
  const org = data.value?.[0];
  const verifiedDomains = org?.verifiedDomains || [];

  // Prioritize the initial tenant domain, then other onmicrosoft domains.
  const ordered = [];

  const initial = verifiedDomains.find((d) =>
    d?.isInitial === true && typeof d?.name === 'string'
  );
  if (initial?.name) {
    ordered.push(String(initial.name).trim().toLowerCase());
  }

  for (const domain of verifiedDomains) {
    const name = String(domain?.name || '').trim().toLowerCase();
    if (!name || !name.endsWith('.onmicrosoft.com')) continue;
    if (!ordered.includes(name)) ordered.push(name);
  }

  return ordered;
};

const getIssuerCandidates = () => {
  const normalizeDomain = (value = '') => String(value).trim().toLowerCase();
  const normalizeSubdomain = (value = '') =>
    String(value).trim().toLowerCase().replace(/\.onmicrosoft\.com$/, '');

  const candidates = [];

  if (process.env.ENTRA_TENANT_DOMAIN) {
    candidates.push(normalizeDomain(process.env.ENTRA_TENANT_DOMAIN));
  }

  if (process.env.ENTRA_TENANT_SUBDOMAIN && process.env.ENTRA_TENANT_SUBDOMAIN !== 'dummy') {
    const rawSubdomain = normalizeSubdomain(process.env.ENTRA_TENANT_SUBDOMAIN);
    candidates.push(`${rawSubdomain}.onmicrosoft.com`);

    // Some tenants are displayed with separators, but initial onmicrosoft domains
    // can be created without them. Try both forms before failing.
    const compactSubdomain = rawSubdomain.replace(/[^a-z0-9]/g, '');
    if (compactSubdomain && compactSubdomain !== rawSubdomain) {
      candidates.push(`${compactSubdomain}.onmicrosoft.com`);
    }
  }

  return Array.from(new Set(candidates.filter(Boolean)));
};

const toMailNickname = (email = '') => {
  const localPart = String(email || '').split('@')[0] || 'user';
  const normalized = localPart.toLowerCase().replace(/[^a-z0-9]/g, '');
  const safe = normalized || 'user';
  // Keep nickname simple and Graph-friendly: alphanumeric, starts with a letter.
  const startsWithLetter = /^[a-z]/.test(safe) ? safe : `u${safe}`;
  return startsWithLetter.slice(0, 64);
};

const toUserPrincipalName = (email = '', tenantDomain = '') => {
  const nickname = toMailNickname(email);
  const domain = String(tenantDomain || '').trim().toLowerCase();
  if (!domain) return '';
  return `${nickname}@${domain}`;
};

const buildGraphPrivilegeError = (graphMessage = '') => {
  const err = new Error(
    'Microsoft Graph registration permission is missing. ' +
      'Add application permission User.ReadWrite.All and grant admin consent in the same tenant as ENTRA_TENANT_ID. ' +
      'If consent was just granted, wait 1-2 minutes and retry.'
  );
  err.status = 403;
  err.details = graphMessage;
  return err;
};

/**
 * Returns true only when real Entra credentials are present.
 * In dev mode (dummy values) all Graph calls are skipped.
 */
const isEntraConfigured = () =>
  !!(
    process.env.ENTRA_CLIENT_ID &&
    process.env.ENTRA_CLIENT_ID !== '00000000-0000-0000-0000-000000000000' &&
    process.env.ENTRA_TENANT_ID &&
    process.env.ENTRA_TENANT_ID !== '00000000-0000-0000-0000-000000000000' &&
    ((process.env.ENTRA_TENANT_SUBDOMAIN && process.env.ENTRA_TENANT_SUBDOMAIN !== 'dummy') ||
      !!process.env.ENTRA_TENANT_DOMAIN)
  );

/**
 * Create a new user in Entra External ID via Microsoft Graph.
 *
 * The user is created with a random internal password — they will never use it
 * because they authenticate via Email OTP.  The account is immediately usable
 * for the OTP flow and for SSO via the "Sign in with Microsoft" button.
 *
 * Requires application permission: User.ReadWrite.All
 *
 * @returns {object|null} Entra user object (includes .id) or null in dev mode.
 */
const createEntraUser = async ({ email, displayName, givenName, surname, password }) => {
  if (!isEntraConfigured()) {
    console.log(`[DEV] Skipping Entra user creation for ${email} – configure ENTRA_* vars to enable.`);
    return null;
  }

  const token = await getGraphToken();
  const envTenantDomains = getIssuerCandidates();
  const discoveredTenantDomains = await getTenantDomainsFromGraph(token);
  const tenantDomains = Array.from(new Set([...envTenantDomains, ...discoveredTenantDomains]));

  if (!tenantDomains.length) {
    throw new Error(
      'Missing tenant domain configuration. Set ENTRA_TENANT_DOMAIN or ENTRA_TENANT_SUBDOMAIN in backend/.env.'
    );
  }

  let lastErrorMessage = '';

  for (const tenantDomain of tenantDomains) {
    const body = {
      accountEnabled: true,
        creationType: 'LocalAccount',
      displayName: displayName || email.split('@')[0],
      ...(givenName && { givenName }),
      ...(surname && { surname }),
      identities: [
        {
          signInType: 'emailAddress',
          issuer: tenantDomain,
          issuerAssignedId: email,
        },
      ],
      passwordProfile: {
        password: password || generateSecurePassword(),
        forceChangePasswordNextSignIn: false,
      },
      passwordPolicies: 'DisablePasswordExpiration',
    };

    const response = await fetch(`${GRAPH_BASE}/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`[Entra] Created user ${email} in Entra External ID (id: ${data.id})`);
      return data;
    }

    const code = data.error?.code;
    const msg = data.error?.message || '';
    lastErrorMessage = msg || response.statusText;

    if (code === 'Request_BadRequest' && msg.toLowerCase().includes('already exists')) {
      console.log(`[Entra] User ${email} already exists in Entra, linking existing account.`);
      return findEntraUserByEmail(email);
    }

    // Try next issuer candidate when issuer/domain mismatch is returned.
    if (msg.toLowerCase().includes('issuer should match tenants domainname')) {
      continue;
    }

    // Try next tenant domain if Graph rejects the UPN domain portion.
    if (msg.toLowerCase().includes('domain portion of the userprincipalname property is invalid')) {
      continue;
    }

    if (
      code === 'Authorization_RequestDenied' ||
      msg.toLowerCase().includes('insufficient privileges')
    ) {
      throw buildGraphPrivilegeError(lastErrorMessage);
    }

    throw new Error(`Microsoft Graph API error: ${lastErrorMessage}`);
  }

  throw new Error(
    `Tenant domain mismatch for Entra user creation. Tried domains: ${tenantDomains.join(', ')}. ` +
      `Graph said: ${lastErrorMessage || 'Issuer should match tenant domainName.'} ` +
      'Set ENTRA_TENANT_DOMAIN to your exact initial domain (for example: mytenant.onmicrosoft.com).'
  );
};

/**
 * Find an existing Entra user by their email address identity.
 * Returns the user object or null.
 */
const findEntraUserByEmail = async (email) => {
  if (!isEntraConfigured()) return null;

  const token = await getGraphToken();
  const safeEmail = String(email).replace(/'/g, "''");

  // B2B guest users have their external email stored in the `mail` field.
  const mailFilter = encodeURIComponent(`mail eq '${safeEmail}'`);
  const mailRes = await fetch(
    `${GRAPH_BASE}/users?$filter=${mailFilter}&$select=id,displayName,givenName,surname,mail`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (mailRes.ok) {
    const mailData = await mailRes.json();
    if (mailData.value?.[0]) return mailData.value[0];
  }

  // Fallback: identity-based filter for CIAM / External ID local accounts.
  const idFilter = encodeURIComponent(
    `identities/any(id:id/issuerAssignedId eq '${safeEmail}' and id/signInType eq 'emailAddress')`
  );
  const idRes = await fetch(
    `${GRAPH_BASE}/users?$filter=${idFilter}&$select=id,displayName,givenName,surname,mail`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!idRes.ok) return null;
  const idData = await idRes.json();
  return idData.value?.[0] ?? null;
};

/**
 * Invite an external user to the workforce tenant via B2B invitation
 * (Microsoft Graph POST /v1.0/invitations).
 *
 * The invitee receives an email with a redemption link and becomes a Guest
 * user (External Identity) fully supported in the workforce tenant.
 *
 * Requires application permission: User.Invite.All
 *
 * @returns {object|null} Graph invitation object (includes .invitedUser.id
 *   and .inviteRedeemUrl) or null in dev mode.
 */
const inviteEntraUser = async ({ email, displayName, redirectUrl }) => {
  if (!isEntraConfigured()) {
    console.log(`[DEV] Skipping Entra B2B invitation for ${email} – configure ENTRA_* vars to enable.`);
    return null;
  }

  const token = await getGraphToken();
  const body = {
    invitedUserEmailAddress: email,
    invitedUserDisplayName: displayName || email.split('@')[0],
    inviteRedirectUrl: redirectUrl || process.env.FRONTEND_URL || 'https://localhost',
    sendInvitationMessage: true,
  };

  const response = await fetch(`${GRAPH_BASE}/invitations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (response.ok) {
    console.log(`[Entra] Invited ${email} as B2B guest (id: ${data.invitedUser?.id}, status: ${data.status})`);
    return data;
  }

  const code = data.error?.code;
  const msg = data.error?.message || response.statusText;

  if (msg.toLowerCase().includes('already exists')) {
    console.log(`[Entra] Guest ${email} already exists, linking existing account.`);
    const existing = await findEntraUserByEmail(email);
    return existing ? { invitedUser: { id: existing.id } } : null;
  }

  if (
    code === 'Authorization_RequestDenied' ||
    msg.toLowerCase().includes('insufficient privileges')
  ) {
    throw buildGraphPrivilegeError(msg);
  }

  throw new Error(`Microsoft Graph invitation error: ${msg}`);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random 24-character password that satisfies
 * Azure AD complexity requirements (upper, lower, digit, special).
 */
const generateSecurePassword = () => {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghijkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '!@#$%^&*';
  const all     = upper + lower + digits + special;
  const pick    = (set) => set[crypto.randomInt(set.length)];

  // Guarantee at least one character from each required category
  const chars = [
    pick(upper), pick(lower), pick(digits), pick(special),
    ...Array.from({ length: 20 }, () => pick(all)),
  ];

  // Fisher-Yates shuffle using cryptographically secure randomness
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
};

const getGraphPermissionStatus = async () => {
  if (!isEntraConfigured()) {
    return {
      configured: false,
      tokenAcquired: false,
      hasAllRequiredRoles: false,
      requiredRoles: REQUIRED_GRAPH_APP_ROLES,
      grantedRoles: [],
      missingRoles: REQUIRED_GRAPH_APP_ROLES,
      message: 'Entra is not configured. Fill ENTRA_* values in backend/.env.',
    };
  }

  try {
    const token = await getGraphToken();
    const payload = decodeJwtPayload(token) || {};
    const grantedRoles = Array.isArray(payload.roles) ? payload.roles : [];
    const missingRoles = REQUIRED_GRAPH_APP_ROLES.filter((role) => !grantedRoles.includes(role));

    return {
      configured: true,
      tokenAcquired: true,
      hasAllRequiredRoles: missingRoles.length === 0,
      requiredRoles: REQUIRED_GRAPH_APP_ROLES,
      grantedRoles,
      missingRoles,
      tenantId: process.env.ENTRA_TENANT_ID,
      appId: process.env.ENTRA_CLIENT_ID,
    };
  } catch (err) {
    return {
      configured: true,
      tokenAcquired: false,
      hasAllRequiredRoles: false,
      requiredRoles: REQUIRED_GRAPH_APP_ROLES,
      grantedRoles: [],
      missingRoles: REQUIRED_GRAPH_APP_ROLES,
      tenantId: process.env.ENTRA_TENANT_ID,
      appId: process.env.ENTRA_CLIENT_ID,
      message: err.message,
    };
  }
};

module.exports = { inviteEntraUser, findEntraUserByEmail, isEntraConfigured, getGraphPermissionStatus };
