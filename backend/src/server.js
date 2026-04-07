require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const app = require('./app');
const connectDB = require('./config/database');
const { getGraphPermissionStatus } = require('./services/entraUserService');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Non-blocking startup check - logs permission status for debugging.
    // Note: Token may not include roles claim even if permissions are granted in Entra.
    // If registration/invitations are working, permissions are properly configured.
    getGraphPermissionStatus()
      .then((status) => {
        if (!status.configured) {
          console.warn(`[Entra] ${status.message}`);
          return;
        }

        if (!status.tokenAcquired) {
          console.warn(`[Entra] Graph token check failed: ${status.message}`);
          return;
        }

        if (!status.hasAllRequiredRoles) {
          console.log(
            `[Entra] Note: Token roles claim shows ${status.missingRoles.join(', ')} as not present. ` +
            'This is normal if roles are not configured in app manifest. If registration works, permissions are granted.'
          );
          return;
        }

        console.log('[Entra] Graph application permissions verified in token claims.');
      })
      .catch((err) => {
        console.log(`[Entra] Permission check: ${err.message}`);
      });
  });
}).catch((err) => {
  console.error('Failed to connect to database:', err);
  process.exit(1);
});
