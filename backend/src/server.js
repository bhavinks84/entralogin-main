require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const app = require('./app');
const connectDB = require('./config/database');
const { getGraphPermissionStatus } = require('./services/entraUserService');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Non-blocking startup check to make Graph permission issues obvious.
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
          console.warn(
            `[Entra] Missing Graph application permissions: ${status.missingRoles.join(', ')}. ` +
            'Registration may fail until admin consent is granted.'
          );
          return;
        }

        console.log('[Entra] Graph application permissions check passed.');
      })
      .catch((err) => {
        console.warn(`[Entra] Graph permission self-check error: ${err.message}`);
      });
  });
}).catch((err) => {
  console.error('Failed to connect to database:', err);
  process.exit(1);
});
