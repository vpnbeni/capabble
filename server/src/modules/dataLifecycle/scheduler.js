/*
 * Runs the nightly backup and the daily workspace job inside the API server (EC2, not Vercel).
 * Each tick takes a lease in the central database, so with several instances only one runs a job,
 * and each job runs once per IST day. A failed backup is retried on later ticks (up to 3 tries a
 * day) and every failure emails support.
 */
const config = require('./config');
const { acquireLease, releaseLease, istDay, istHour } = require('./lease');
const { runBackup } = require('./backupService');
const { runLifecycle } = require('./lifecycleJob');
const { isStorageConfigured } = require('./storage');
const { sendMail } = require('../../utils/mailer');
const mailTemplates = require('../../mail/templates');

const BACKUP_JOB = 'backup-nightly';
const LIFECYCLE_JOB = 'workspace-lifecycle';
const LIFECYCLE_HOUR_IST = 7; // emails go out in the morning
const MAX_BACKUP_TRIES = 3;
const TICK_MS = 15 * 60 * 1000;

const formatTime = (date) => `${new Date(date).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short'
})} IST`;

const reportBackupFailure = (runId, status, failures, now) => sendMail({
  to: config.supportEmail,
  ...mailTemplates.backupFailed({
    runId: runId || '—', status, failures, time: formatTime(now), environment: config.prefix
  })
}).catch((error) => console.error('[backup:mail] status=failed', error.message));

/** One daily job: lease, once per IST day, at or after `hour`. */
const runDaily = async ({ name, hour, minutes, maxTries = 1, now = new Date(), work }) => {
  if (istHour(now) < hour) return { skipped: 'too early' };
  const today = istDay(now);
  const lease = await acquireLease(name, minutes, now);
  if (!lease) return { skipped: 'another instance holds the lease' };
  if (lease.lastDay === today) {
    await releaseLease(name);
    return { skipped: 'already ran today' };
  }
  const attempts = lease.attemptDay === today ? lease.attempts : 0;
  if (attempts >= maxTries) {
    await releaseLease(name);
    return { skipped: 'out of tries today' };
  }
  try {
    const result = await work(now);
    const done = result.status !== 'failed';
    await releaseLease(name, {
      attemptDay: today, attempts: attempts + 1, lastResult: result, ...(done ? { lastDay: today } : {})
    });
    return result;
  } catch (error) {
    await releaseLease(name, { attemptDay: today, attempts: attempts + 1, lastResult: { error: error.message } });
    throw error;
  }
};

const backupTick = (now = new Date()) => runDaily({
  name: BACKUP_JOB,
  hour: config.backupHourIst,
  minutes: 120,
  maxTries: MAX_BACKUP_TRIES,
  now,
  work: async () => {
    try {
      const result = await runBackup({ trigger: 'scheduled', now });
      const failures = result.files.filter((f) => !f.ok)
        .map((f) => ({ label: `${f.kind}:${f.label}`, error: f.error }));
      if (failures.length) await reportBackupFailure(result.runId, result.status, failures, now);
      return { runId: result.runId, status: result.status, files: result.files.length, failed: failures.length };
    } catch (error) {
      await reportBackupFailure(error.runId, 'failed', [{ label: 'run', error: error.message }], now);
      throw error;
    }
  }
});

const lifecycleTick = (now = new Date()) => runDaily({
  name: LIFECYCLE_JOB, hour: LIFECYCLE_HOUR_IST, minutes: 60, now, work: () => runLifecycle({ now })
});

let timer = null;

const start = () => {
  if (timer || process.env.VERCEL) return;
  const backups = config.backupsEnabled;
  const lifecycle = config.lifecycleEnabled;
  if (backups && !isStorageConfigured()) {
    console.warn('[backup] BACKUP_ENABLED is set but storage is not configured; backups are off.');
  }
  if (!(backups && isStorageConfigured()) && !lifecycle) return;
  const tick = () => {
    if (backups && isStorageConfigured()) {
      backupTick().then(
        (r) => { if (!r?.skipped) console.log('[backup]', JSON.stringify(r)); },
        (e) => console.error('[backup] failed', e.message)
      );
    }
    if (lifecycle) {
      lifecycleTick().then(
        (r) => { if (!r?.skipped) console.log('[workspace-lifecycle]', JSON.stringify(r)); },
        (e) => console.error('[workspace-lifecycle] failed', e.message)
      );
    }
  };
  setTimeout(tick, 60000).unref();
  timer = setInterval(tick, TICK_MS);
  timer.unref();
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { start, stop, backupTick, lifecycleTick, runDaily };
