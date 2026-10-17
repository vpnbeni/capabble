/**
 * APPNT access rules.
 *
 * Seeing and acting on appointments is permission-driven:
 *   view     — every appointment
 *   host     — only appointments where the user is the host
 *   manage   — act on any appointment (front desk)
 *   notes    — read private meeting notes of any appointment
 *
 * A user's host profiles are those linked to their login or their staff record.
 */
const P = Object.freeze({
  VIEW: 'appnt.appointments.view',
  BOOK: 'appnt.appointments.book',
  MANAGE: 'appnt.appointments.manage',
  HOST: 'appnt.appointments.host',
  NOTES: 'appnt.appointments.notes',
  SETTINGS: 'appnt.appointments.settings',
  REPORT: 'appnt.appointments.report'
});

const MATCH_NOTHING = Object.freeze({ _id: { $exists: false } });

/** Host profile ids that belong to the signed-in user (cached per request). */
const getMyHostIds = async (req) => {
  if (req.appntHostIds) return req.appntHostIds;
  const Host = req.models?.AppointmentHost;
  const or = [];
  if (req.user?._id) or.push({ user: req.user._id });
  if (req.user?.teacher) or.push({ teacher: req.user.teacher });
  const hosts = Host && or.length ? await Host.find({ $or: or }).select('_id').lean() : [];
  req.appntHostIds = hosts.map((row) => String(row._id));
  return req.appntHostIds;
};

/**
 * Mongo filter limiting appointments to what the user may see.
 * Returns {} for full access, a host filter for hosts, or a match-nothing filter.
 */
const buildAppointmentScope = async (req) => {
  if (req.rbac?.has(P.VIEW)) return {};
  if (!req.rbac?.has(P.HOST)) return MATCH_NOTHING;
  const ids = await getMyHostIds(req);
  return ids.length ? { host: { $in: ids } } : MATCH_NOTHING;
};

const isOwnHost = async (req, hostId) => (await getMyHostIds(req)).includes(String(hostId));

/** Can act (confirm, check in, cancel…) on this appointment? */
const canActOn = async (req, appointment) => {
  if (req.rbac?.has(P.MANAGE)) return true;
  return Boolean(req.rbac?.has(P.HOST) && await isOwnHost(req, appointment.host?._id || appointment.host));
};

/** Can read and write the private meeting notes of this appointment? */
const canSeeNotes = async (req, appointment) => {
  if (req.rbac?.has(P.NOTES)) return true;
  return Boolean(req.rbac?.has(P.HOST) && await isOwnHost(req, appointment.host?._id || appointment.host));
};

/** Strip private notes unless the user may read them. */
const redact = async (req, appointment) => {
  const row = typeof appointment.toObject === 'function' ? appointment.toObject() : { ...appointment };
  const notesAllowed = await canSeeNotes(req, row);
  if (!notesAllowed) delete row.outcomeNotes;
  row.canSeeNotes = notesAllowed;
  row.canAct = await canActOn(req, row);
  return row;
};

module.exports = {
  P,
  MATCH_NOTHING,
  getMyHostIds,
  buildAppointmentScope,
  isOwnHost,
  canActOn,
  canSeeNotes,
  redact
};
