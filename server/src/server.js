const dotenv = require('dotenv');
const colors = require('colors');
require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);
// Load environment variables
dotenv.config();

// Import database connection
const { connectPlatformDB, getCentralDbName } = require('./config/platformDatabase');
const { runTenantModelStartupSanityCheck } = require('./tenancy/startupTenantModelSanityCheck');
const {
  initAttendanceQueue,
  isAttendanceQueueEnabled,
  isAttendanceQueueReady,
} = require('./queues/attendanceQueue');

// Import app
const app = require('./app');
const billing = require('./modules/billing');
const { isMailConfigured, verifyMailer } = require('./utils/mailer');
const { countActiveStudents } = require('./services/billingStudentCount');

// Billing reads the live student count from the school databases the server owns.
billing.setStudentCounter(countActiveStudents);

// Vercel serverless: export the Express app and run DB init in background (no listen)
if (process.env.VERCEL) {
  const init = async () => {
    try {
      await connectPlatformDB();
      console.log(`✅ Platform database '${getCentralDbName()}' connected (Vercel)`.green.bold);
      await runTenantModelStartupSanityCheck();
      require('./events/registerAllListeners')();
    require('./notifications/scheduler').start();
    require('./modules/clndr/jobs').start();
    require('./mail/outbox').start();
    require('./push/outbox').start();
    } catch (error) {
      console.error('❌ Server initialization failed (Vercel):'.red.bold, error.message);
    }
  };
  init();
  module.exports = app;
  return;
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...'.red.bold);
  console.log(err.name, err.message);
  process.exit(1);
});

// Connect to platform database (tenant databases are initialized per request)
const initializeServer = async () => {
  try {
    await connectPlatformDB();
    console.log(`✅ Platform database '${getCentralDbName()}' connected successfully`.green.bold);
    await runTenantModelStartupSanityCheck();
    require('./events/registerAllListeners')();

    if (billing.isConfigured()) {
      // Wake the billing database (Neon may be suspended) without holding up startup.
      billing.ping()
        .then((ms) => console.log(`✅ Billing database reachable (${ms}ms)`.green.bold))
        .catch((error) => console.warn('⚠️  Billing database not reachable yet; requests will retry:'.yellow, error.code || error.message));
      billing.startScheduler();
    } else {
      console.warn('⚠️  Billing is off (set BILLING_DATABASE_URL to enable).'.yellow);
    }

    // Nightly backups and the daily workspace job (each off unless enabled; see server/docs/backups.md).
    require('./modules/dataLifecycle').startScheduler();

    // Hourly reminders: fees due, meetings tomorrow, maintenance due (off with NOTIFICATION_SCHEDULER_ENABLED=false).
    require('./notifications/scheduler').start();
    require('./modules/clndr/jobs').start();
    require('./mail/outbox').start();
    require('./push/outbox').start();

    if (isMailConfigured()) {
      // Log in to the mail server once so a wrong password shows up at startup, not at the first signup.
      verifyMailer()
        .then(({ host, from }) => console.log(`✅ Email ready: ${from} via ${host}`.green.bold))
        .catch((error) => console.warn('⚠️  Email server login failed; emails will not send:'.yellow, error.message));
    } else {
      console.warn('⚠️  Email is off (set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM to enable).'.yellow);
    }

    
    console.log('✅ Server initialization completed successfully'.green.bold);
  } catch (error) {
    console.error('❌ Server initialization failed:'.red.bold, error.message);
    process.exit(1);
  }
};

// Initialize server
initializeServer().then(async () => {
  // Start attendance background worker after DB is ready.
  // Skip on Vercel (serverless — no persistent workers).
  if (process.env.VERCEL) {
    return;
  }

  if (!isAttendanceQueueEnabled) {
    console.warn(
      '⚠️  Attendance worker disabled (set REDIS_URL or ATTENDANCE_QUEUE_ENABLED=true to enable).'
        .yellow
    );
    return;
  }

  try {
    const queueReady = await initAttendanceQueue();
    if (!queueReady) {
      return;
    }

    require('./workers/attendanceWorker');
    console.log('✅ Attendance background worker started'.green.bold);
  } catch (workerErr) {
    // Worker failing to start (e.g. Redis not available) should not kill the server.
    console.warn(
      '⚠️  Attendance worker failed to start (Redis may be unavailable):'.yellow,
      workerErr.message
    );
  }
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(
    `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`.yellow.bold
  );
  console.log(`API URL: http://localhost:${PORT}/api`.cyan.underline);
  console.log(`Health Check: http://localhost:${PORT}/health`.green.underline);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...'.red.bold);
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
  billing.stopScheduler();
  require('./modules/dataLifecycle').stopScheduler();
  require('./notifications/scheduler').stop();
  require('./modules/clndr/jobs').stop();
  require('./mail/outbox').stop();
  require('./push/outbox').stop();
  if (isAttendanceQueueReady()) {
    const worker = require('./workers/attendanceWorker');
    worker.close().catch(() => {});
  }
  server.close(() => {
    console.log('💥 Process terminated!');
  });
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n👋 SIGINT RECEIVED. Shutting down gracefully');
  billing.stopScheduler();
  require('./modules/dataLifecycle').stopScheduler();
  require('./notifications/scheduler').stop();
  require('./modules/clndr/jobs').stop();
  require('./mail/outbox').stop();
  require('./push/outbox').stop();
  if (isAttendanceQueueReady()) {
    const worker = require('./workers/attendanceWorker');
    worker.close().catch(() => {});
  }
  server.close(() => {
    console.log('💥 Process terminated!');
    process.exit(0);
  });
});

module.exports = server;
