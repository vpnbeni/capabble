const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const path = require('path');
const os = require('os');

// Import custom middleware
const errorHandler = require('./middleware/errorHandler');
const { billingEntitlementMiddleware } = require('./middleware/billingEntitlement');
const { tenantAccessGate } = require('./rbac/gate');
const { requestContextMiddleware } = require('./tenancy/requestContext');
const { academicSessionMiddleware } = require('./middleware/academicSession');
const { tenantContextMiddleware } = require('./tenancy/tenantContextMiddleware');

// Import module registry — each module registers its own routes
const { mountAll } = require('./modules');
const platformModule = require('./modules/platform');
const billing = require('./modules/billing');
const dataLifecycle = require('./modules/dataLifecycle');

// Create Express app
const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com'],
      fontSrc: ['\'self\'', 'https://fonts.gstatic.com'],
      imgSrc: ['\'self\'', 'data:', 'https:'],
      scriptSrc: ['\'self\''],
      connectSrc: ['\'self\'']
    }
  }
}));

// CORS configuration
const getAllowedOrigins = () => {
  const explicitOrigins = (process.env.CLIENT_URLS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.CLIENT_URL) {
    explicitOrigins.push(process.env.CLIENT_URL);
  }

  return new Set(explicitOrigins);
};

const allowedOrigins = getAllowedOrigins();
const rootAppDomain = (process.env.ROOT_APP_DOMAIN || 'school.capabble.cloud').toLowerCase();

const isAllowedOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.has(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();

    if ((hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost'))
      && process.env.NODE_ENV !== 'production') {
      return true;
    }

    if (hostname === rootAppDomain || hostname.endsWith(`.${rootAppDomain}`)) {
      return true;
    }
  } catch (error) {
    return false;
  }

  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with', 'x-tenant-slug', 'x-academic-session'],
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'X-Cards-Issued'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting
const parseBooleanEnv = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const isDevelopment = process.env.NODE_ENV === 'development';
const rateLimitEnabled = parseBooleanEnv(process.env.RATE_LIMIT_ENABLED, !isDevelopment);
const configuredRateLimitWindow = Number.parseInt(process.env.RATE_LIMIT_WINDOW || '', 10);
const configuredRateLimitMax = Number.parseInt(process.env.RATE_LIMIT_MAX || '', 10);

if (rateLimitEnabled) {
  const limiter = rateLimit({
    windowMs: Number.isFinite(configuredRateLimitWindow) && configuredRateLimitWindow > 0
      ? configuredRateLimitWindow
      : 15 * 60 * 1000,
    max: Number.isFinite(configuredRateLimitMax) && configuredRateLimitMax > 0
      ? configuredRateLimitMax
      : 100,
    message: {
      error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);
}

// Razorpay webhooks are signed over the raw body, so they mount before the parsers and sanitizers.
app.use('/api/webhooks', billing.webhookRouter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(requestContextMiddleware);

// File upload middleware
const configuredMaxFileSize = Number.parseInt(process.env.MAX_FILE_SIZE || '', 10);
const effectiveMaxFileSize = Number.isFinite(configuredMaxFileSize) && configuredMaxFileSize > 0
  ? Math.max(configuredMaxFileSize, 200 * 1024 * 1024)
  : 200 * 1024 * 1024;

app.use(fileUpload({
  limits: { fileSize: effectiveMaxFileSize }, // min 200MB
  abortOnLimit: false,
  responseOnLimit: 'Uploaded file exceeds the allowed size limit',
  createParentPath: true,
  useTempFiles: true,
  tempFileDir: os.tmpdir() // Cross-platform temp directory
}));

// Data sanitization against NoSQL query injection
// We allow dots in keys so that features which rely on user-visible names
// containing dots (e.g. subject names like "I.T.") continue to work.
// MongoDB itself still never sees raw dots in dynamic keys because we
// encode/decode such keys at the model/controller layer.
app.use(mongoSanitize({
  allowDots: true,
}));

// Data sanitization against XSS (keep HTML on exam circulars so formatting can be saved)
const xssSanitize = xss();
app.use((req, res, next) => {
  if (String(req.originalUrl || '').includes('/exam-circulars')) return next();
  return xssSanitize(req, res, next);
});

// Prevent parameter pollution
app.use(hpp());

// Enable gzip compression
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Examination Management System API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      teachers: '/api/teachers',
      students: '/api/students',
      subjects: '/api/subjects',
      candidates: '/api/candidates',
      datesheets: '/api/datesheets',
      rooms: '/api/rooms',
      dispatch: '/api/dispatch',
      export: '/api/export',
      answersheets: '/api/answersheets',
      cbseCirculars: '/api/cbse-circulars',
      duties: '/api/duties',
      undertakings: '/api/undertakings',
      billing: '/api/billing',
      support: '/api/support',
      sessions: '/api/sessions',
      attendance: '/api/attendance',
      timetable: '/api/timetable',
      onboarding: '/api/onboarding',
      admin: '/api/admin'
    },
    documentation: 'See README.md for detailed API documentation'
  });
});

// Platform admin routes (central control plane)
platformModule.mountRoutes(app);

// Signed workspace-archive download links (from emails): no sign-in, the signature is the key.
app.use('/api/workspace-archives', dataLifecycle.publicRouter);
// Unsubscribe links in school emails: signed, no sign-in, no tenant header.
app.use('/api/mail/unsubscribe', require('./mail/unsubscribe').router);
// Private calendar feeds (Google / Apple / Outlook subscriptions): a secret link, no sign-in.
app.use('/api/ical', require('./modules/clndr/feed').router);

// Tenant-scoped routes — each module registers its own routes via mountAll()
const tenantScopedRouter = express.Router();
tenantScopedRouter.use(tenantContextMiddleware);
tenantScopedRouter.use(billingEntitlementMiddleware);
tenantScopedRouter.use(academicSessionMiddleware);
// Authentication + permission check for every tenant route (deny by default).
tenantScopedRouter.use(tenantAccessGate);
mountAll(tenantScopedRouter);

app.use('/api', tenantScopedRouter);

// Return API 404s as JSON
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Handle non-API 404 routes
app.all('*', (req, res) => {
  const message = `Route ${req.originalUrl} not found`;

  res.status(404).json({
    success: false,
    message
  });
});

// Global error handler (must be last middleware)
app.use(errorHandler);

module.exports = app;
