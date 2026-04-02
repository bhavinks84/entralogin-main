const { ConfidentialClientApplication } = require('@azure/msal-node');

// Lazy singleton – only build the MSAL client when env vars are available.
// This avoids crashing during module load in dev environments that haven't
// yet configured the .env file.
let _msalClient = null;
let _fallbackMsalClient = null;

const normalizeSubdomain = (value = '') =>
  String(value).trim().toLowerCase().replace(/\.onmicrosoft\.com$/, '');

const getPrimaryAuthority = () => {
  if (process.env.ENTRA_AUTHORITY) {
    return process.env.ENTRA_AUTHORITY.trim();
  }

  if (process.env.ENTRA_TENANT_SUBDOMAIN && process.env.ENTRA_TENANT_SUBDOMAIN !== 'dummy') {
    const subdomain = normalizeSubdomain(process.env.ENTRA_TENANT_SUBDOMAIN);
    return `https://${subdomain}.ciamlogin.com/${process.env.ENTRA_TENANT_ID}`;
  }

  return `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`;
};

const getFallbackAuthority = () =>
  `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`;

const createClient = (authority) =>
  new ConfidentialClientApplication({
    auth: {
      clientId: process.env.ENTRA_CLIENT_ID,
      authority,
      clientSecret: process.env.ENTRA_CLIENT_SECRET,
    },
    system: {
      loggerOptions: {
        loggerCallback(_loglevel, message) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[MSAL] ${message}`);
          }
        },
        piiLoggingEnabled: false,
        logLevel: 3, // Warning
      },
    },
  });

const getMsalClient = () => {
  if (_msalClient) return _msalClient;

  if (!process.env.ENTRA_CLIENT_ID || !process.env.ENTRA_CLIENT_SECRET) {
    throw new Error(
      'Entra External ID is not configured. Set ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ' +
      'ENTRA_TENANT_ID, and ENTRA_TENANT_SUBDOMAIN in your .env file.'
    );
  }

  _msalClient = createClient(getPrimaryAuthority());

  return _msalClient;
};

const getFallbackMsalClient = () => {
  if (_fallbackMsalClient) return _fallbackMsalClient;
  _fallbackMsalClient = createClient(getFallbackAuthority());
  return _fallbackMsalClient;
};

const ENTRA_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

const getAuthCodeUrl = async (state) => {
  const request = {
    scopes: ENTRA_SCOPES,
    redirectUri: process.env.ENTRA_REDIRECT_URI,
    state,
    responseMode: 'query',
  };

  try {
    return await getMsalClient().getAuthCodeUrl(request);
  } catch (err) {
    if (err?.errorCode === 'endpoints_resolution_error') {
      return getFallbackMsalClient().getAuthCodeUrl(request);
    }
    throw err;
  }
};

const acquireTokenByCode = async (code) => {
  const request = {
    code,
    scopes: ENTRA_SCOPES,
    redirectUri: process.env.ENTRA_REDIRECT_URI,
  };

  try {
    return await getMsalClient().acquireTokenByCode(request);
  } catch (err) {
    if (err?.errorCode === 'endpoints_resolution_error') {
      return getFallbackMsalClient().acquireTokenByCode(request);
    }
    throw err;
  }
};

module.exports = { getMsalClient, getAuthCodeUrl, acquireTokenByCode, ENTRA_SCOPES };
