/**
 * APPNT event listeners.
 *
 * - A staff member leaving (teacher deactivated/deleted) closes their host
 *   profile and cancels their upcoming appointments, so nobody turns up to
 *   meet someone who is gone.
 * - Appointment events send best-effort emails to the visitor and the host.
 *   Email is optional: no SMTP setup, or notifications switched off, means no mail.
 */
const { getTenantConnectionAndModels } = require('../../tenancy/tenantConnectionManager');
const EVENTS = require('../../events/eventNames');
const { sendMail } = require('../../utils/mailer');
const { schoolNow } = require('./lifecycle');

const HOST_GONE = 'The person you were meeting is no longer available.';

const closeHostForTeacher = async ({ tenant, teacherId }) => {
  const { models } = getTenantConnectionAndModels(tenant.dbName, ['AppointmentHost', 'Appointment']);
  const host = await models.AppointmentHost.findOne({ teacher: teacherId });
  if (!host) return;
  host.isActive = false;
  host.parentBookable = false;
  await host.save();

  const today = schoolNow().date;
  const upcoming = await models.Appointment.find({ host: host._id, date: { $gte: today }, status: { $in: ['requested', 'confirmed'] } });
  await Promise.all(upcoming.map((appointment) => {
    appointment.status = 'cancelled';
    appointment.slotKey = undefined;
    appointment.cancelReason = HOST_GONE;
    appointment.timeline.push({ status: 'cancelled', by: 'System', note: HOST_GONE });
    return appointment.save();
  }));
};

const formatWhen = (appointment) => {
  const date = new Date(`${appointment.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const [h, m] = appointment.startTime.split(':').map(Number);
  const time = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  return `${date} at ${time}`;
};

const VISITOR_MESSAGES = {
  requested: (a) => [`Meeting request received: ${a.refNo}`, `Your request to meet ${a.hostName} on ${formatWhen(a)} has been received. You'll hear back once it is confirmed.`],
  confirmed: (a) => [`Meeting confirmed: ${a.refNo}`, `Your meeting with ${a.hostName} is confirmed for ${formatWhen(a)}.${a.location ? ` Venue: ${a.location}.` : ''} Please carry this reference number: ${a.refNo}.`],
  declined: (a) => [`Meeting request declined: ${a.refNo}`, `Your request to meet ${a.hostName} on ${formatWhen(a)} could not be accepted.${a.cancelReason ? ` Reason: ${a.cancelReason}.` : ''} Please request another time.`],
  cancelled: (a) => [`Meeting cancelled: ${a.refNo}`, `Your meeting with ${a.hostName} on ${formatWhen(a)} has been cancelled.${a.cancelReason ? ` Reason: ${a.cancelReason}.` : ''}`],
  rescheduled: (a) => [`Meeting moved: ${a.refNo}`, `Your meeting with ${a.hostName} has moved to ${formatWhen(a)}.`]
};

const HOST_MESSAGES = {
  requested: (a) => [`New meeting request: ${a.visitor.name}`, `${a.visitor.name} has asked to meet you on ${formatWhen(a)} about ${a.purpose}. Open Appointments to confirm or decline.`],
  confirmed: (a) => [`Meeting booked: ${a.visitor.name}`, `${a.visitor.name} will meet you on ${formatWhen(a)} about ${a.purpose}.`],
  cancelled: (a) => [`Meeting cancelled: ${a.visitor.name}`, `Your meeting with ${a.visitor.name} on ${formatWhen(a)} has been cancelled.`],
  rescheduled: (a) => [`Meeting moved: ${a.visitor.name}`, `Your meeting with ${a.visitor.name} has moved to ${formatWhen(a)}.`]
};

const trySend = async (to, message, schoolName) => {
  if (!to || !message) return;
  const [subject, body] = message;
  try {
    await sendMail({ to, subject: schoolName ? `${subject} · ${schoolName}` : subject, text: `${body}\n\n${schoolName || ''}`.trim() });
  } catch (err) {
    // SMTP not configured or unreachable: appointments must keep working without mail.
    console.warn(`[appnt] email not sent: ${err.message}`);
  }
};

/**
 * @param {{ tenant, appointmentId, event, notifyHost?: boolean }} payload
 * event: requested | confirmed | declined | cancelled | rescheduled
 */
const notify = async ({ tenant, appointmentId, event, notifyHost = true }) => {
  const { models } = getTenantConnectionAndModels(tenant.dbName, ['Appointment', 'AppointmentHost', 'AppointmentSettings', 'SchoolProfile']);
  const settings = await models.AppointmentSettings.findOne({ key: 'default' }).lean();
  if (settings && settings.emailNotifications === false) return;
  const appointment = await models.Appointment.findById(appointmentId).lean();
  if (!appointment) return;
  const host = await models.AppointmentHost.findById(appointment.host).lean();
  const school = await models.SchoolProfile.findOne({}).select('schoolName').lean();
  const schoolName = school?.schoolName || '';

  await trySend(appointment.visitor?.email, VISITOR_MESSAGES[event]?.(appointment), schoolName);
  if (notifyHost) await trySend(host?.email, HOST_MESSAGES[event]?.(appointment), schoolName);
};

const register = (bus) => {
  bus.on(EVENTS.TEACHER_DEACTIVATED, closeHostForTeacher);
  bus.on(EVENTS.TEACHER_DELETED, closeHostForTeacher);
  bus.on(EVENTS.APPOINTMENT_BOOKED, notify);
  bus.on(EVENTS.APPOINTMENT_STATUS_CHANGED, notify);
};

module.exports = { register, closeHostForTeacher };
