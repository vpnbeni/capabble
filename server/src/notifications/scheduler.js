/**
 * Time-based reminders that no user action triggers: fees falling due, meetings
 * tomorrow, assets due for maintenance. Runs hourly over every active tenant.
 *
 * Every reminder has a dedupeKey, so running twice (a restart, two instances)
 * never notifies twice — no lease needed. Off with NOTIFICATION_SCHEDULER_ENABLED=false.
 */
const { getPlatformModels } = require('../tenancy/platformModels');
const { TENANT_STATUS } = require('../models/platform/Tenant');
const { getActiveModelKeys } = require('../constants/moduleModelKeys');
const { normalizeTenantFeatureToggles } = require('../constants/tenantFeatures');
const { USER_KINDS } = require('../rbac/permissions');
const { send, modelsFor } = require('./send');
const recipients = require('./recipients');

const DAY = 86400 * 1000;
const FEE_NOTICE_DAYS = 3;
const MAINTENANCE_NOTICE_DAYS = 3;

/** Today in school time (IST) as YYYY-MM-DD, shifted by whole days. */
const istDate = (now, offsetDays = 0) => new Date(now.getTime() + 5.5 * 3600 * 1000 + offsetDays * DAY).toISOString().slice(0, 10);
const startOfIstDay = (now, offsetDays = 0) => new Date(`${istDate(now, offsetDays)}T00:00:00+05:30`);

const feeReminders = async (tenant, models, now) => {
  const soonEnd = startOfIstDay(now, FEE_NOTICE_DAYS + 1);
  const today = startOfIstDay(now);
  const demands = await models.FeeDemand.find({
    status: { $in: ['due', 'partial'] },
    balance: { $gt: 0 },
    // Due within the next few days, or overdue by up to a week (older ones were told already).
    dueDate: { $gte: new Date(today.getTime() - 7 * DAY), $lt: soonEnd }
  }).select('student label dueDate balance').lean();
  if (!demands.length) return 0;

  const students = await recipients.loadStudents(models, { _id: { $in: [...new Set(demands.map((d) => String(d.student)))] } });
  const byId = new Map(students.map((s) => [String(s._id), s]));
  let sent = 0;
  // Sequential per tenant keeps the load on the school's database gentle.
  // eslint-disable-next-line no-restricted-syntax
  for (const demand of demands) {
    const student = byId.get(String(demand.student));
    // eslint-disable-next-line no-continue
    if (!student) continue;
    // eslint-disable-next-line no-await-in-loop
    const { users, studentsByRoll } = await recipients.familyFor(models, [student], { kinds: [USER_KINDS.PARENT] });
    const overdue = new Date(demand.dueDate) < today;
    // eslint-disable-next-line no-await-in-loop
    sent += await send(tenant, users, overdue ? 'fees.overdue' : 'fees.due_soon', {
      demandId: String(demand._id),
      label: demand.label,
      dueDate: demand.dueDate,
      balance: demand.balance,
      studentsByRoll
    });
  }
  return sent;
};

const appointmentReminders = async (tenant, models, now) => {
  const tomorrow = istDate(now, 1);
  const appointments = await models.Appointment.find({ date: tomorrow, status: 'confirmed' }).lean();
  let sent = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const appointment of appointments) {
    const data = {
      appointmentId: String(appointment._id),
      event: 'reminder',
      at: tomorrow,
      appointment,
      entity: { type: 'appointment', id: String(appointment._id) }
    };
    const roll = appointment.studentSnapshot?.rollNumber;
    if (roll) data.studentsByRoll = { [roll.toUpperCase()]: appointment.studentSnapshot.name };
    /* eslint-disable no-await-in-loop */
    let family = appointment.requestedBy ? await recipients.byIds(models, [appointment.requestedBy]) : [];
    if (!family.length && appointment.visitorType === 'parent' && roll) {
      family = await recipients.familyForRollNumbers(models, [roll], { kinds: [USER_KINDS.PARENT] });
    }
    sent += await send(tenant, family, 'appnt.family_update', data);
    const host = await models.AppointmentHost.findById(appointment.host).select('user teacher').lean();
    let hostUsers = [];
    if (host?.user) hostUsers = await recipients.byIds(models, [host.user]);
    else if (host?.teacher) hostUsers = await recipients.usersForTeachers(models, [host.teacher]);
    sent += await send(tenant, hostUsers, 'appnt.host_update', data);
    /* eslint-enable no-await-in-loop */
  }
  return sent;
};

const maintenanceReminders = async (tenant, models, now) => {
  const settings = await models.AssetSettings.findOne({}).select('notifications').lean();
  if (settings?.notifications?.maintenanceDue === false) return 0;
  const due = await models.AssetMaintenance.find({
    nextDueDate: { $gte: startOfIstDay(now), $lt: startOfIstDay(now, MAINTENANCE_NOTICE_DAYS + 1) }
  }).select('assetId nextDueDate').lean();
  if (!due.length) return 0;
  const assets = await models.Asset.find({ _id: { $in: due.map((m) => m.assetId) } }).select('name').lean();
  const managers = await recipients.usersWithPermission(models, ['asets.assets.maintain']);
  // One summary per day rather than one per asset.
  return send(tenant, managers, 'assets.maintenance_due', {
    maintenanceId: 'daily',
    dueDate: istDate(now),
    count: due.length,
    names: assets.map((a) => a.name)
  });
};

const JOBS = [
  { name: 'fees', needs: ['FeeDemand', 'Student'], run: feeReminders },
  { name: 'appointments', needs: ['Appointment', 'AppointmentHost'], run: appointmentReminders },
  { name: 'maintenance', needs: ['AssetMaintenance', 'Asset', 'AssetSettings'], run: maintenanceReminders }
];

const runForTenant = async (tenantDoc, now) => {
  const tenant = { dbName: tenantDoc.dbName, slug: tenantDoc.slug, id: String(tenantDoc._id) };
  const active = new Set(getActiveModelKeys(normalizeTenantFeatureToggles(tenantDoc.featureToggles)));
  const result = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const job of JOBS) {
    // eslint-disable-next-line no-continue
    if (!job.needs.every((key) => active.has(key))) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      result[job.name] = await job.run(tenant, modelsFor(tenant, job.needs), now);
    } catch (error) {
      console.error(`[notifications] ${job.name} reminders failed for ${tenant.slug}: ${error.message}`);
    }
  }
  return result;
};

const runOnce = async (now = new Date()) => {
  const tenants = await getPlatformModels().Tenant.find({ status: TENANT_STATUS.ACTIVE }).select('_id slug dbName featureToggles').lean();
  const summary = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const tenant of tenants) {
    // eslint-disable-next-line no-await-in-loop
    summary[tenant.slug] = await runForTenant(tenant, now);
  }
  return summary;
};

const LEASE = 'notification-reminders';
let timer = null;
let running = false;

const start = ({ intervalMs = 60 * 60 * 1000, initialDelayMs = 60 * 1000 } = {}) => {
  if (timer || String(process.env.NOTIFICATION_SCHEDULER_ENABLED || 'true') !== 'true') return;
  // A slow run (many tenants) must not overlap the next tick.
  // Every reminder is deduplicated, but the lease also stops two servers doing the same work.
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // eslint-disable-next-line global-require
      const { acquireLease, releaseLease } = require('../modules/dataLifecycle/lease');
      if (!await acquireLease(LEASE, 50)) return;
      try {
        await runOnce();
      } finally {
        await releaseLease(LEASE);
      }
    } catch (error) {
      console.error('[notifications] reminders failed', error.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, initialDelayMs).unref();
  timer = setInterval(tick, intervalMs);
  timer.unref();
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { start, stop, runOnce, runForTenant, istDate };
