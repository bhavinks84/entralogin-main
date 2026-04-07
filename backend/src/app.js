const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { rateLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();

// Keep proxy support enabled when deployed behind reverse proxies.
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS – allow the React dev server and production origin
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Global rate limiter
app.use('/api/', rateLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const shouldServeFrontend = process.env.SERVE_FRONTEND === 'true';
if (shouldServeFrontend) {
  const distPath = process.env.FRONTEND_DIST_PATH
    ? path.resolve(process.cwd(), process.env.FRONTEND_DIST_PATH)
    : path.resolve(__dirname, '..', '..', 'frontend', 'dist');

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));

    // Serve SPA routes from index.html while keeping /api for backend routes.
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.warn(`[Static] SERVE_FRONTEND is true but dist path was not found: ${distPath}`);
  }
}

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
