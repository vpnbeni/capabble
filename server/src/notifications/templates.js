/**
 * Notification copy, one entry per kind. send.js calls `build(data, user, { schoolName })`
 * for each recipient; returning null skips that person.
 *
 *   module    — which part of the product it is about (shown as a filter)
 *   audience  — 'staff', 'family' (parents and students) or omitted for anyone
 *   section   — portal section a family member must be able to open (catalog `portal`)
 *   link / portalLink — client route opened on click (hash path)
 *   dedupeKey(data, user) — same key for the same person is stored once
 *
 * Voice follows client/src/components/ui/DESIGN.md: plain English, sentence case,
 * no exclamation marks, school words (Class 7-A, fee, admission no.).
 */
const { roleTemplates } = require('../rbac/catalog');
const { USER_KINDS } = require('../rbac/permissions');

const firstName = (user) => String(user?.name || '').trim().split(/\s+/)[0] || '';
const hello = (user) => (firstName(user) ? `, ${firstName(user)}` : '');
const list = (items) => {
  const clean = items.filter(Boolean);
  if (clean.length <= 1) return clean.join('');
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const inr = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value) => {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const timeLabel = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const classLabel = (className, section) => [className && `Class ${className}`, section].filter(Boolean).join('-');

const roleName = (key, customNames = {}) => roleTemplates.get(key)?.name || customNames[key] || 'a custom role';
const roleNames = (keys, customNames) => (keys || []).map((key) => roleName(key, customNames));

/**
 * For a family member: first names of their own children this notification is
 * about. `data.studentsByRoll` maps admission no. → student name.
 */
const childNameFor = (user, data) => {
  const byRoll = data.studentsByRoll || {};
  const names = (user.linkedStudents || [])
    .map((link) => byRoll[String(link.rollNumber || '').toUpperCase()])
    .filter(Boolean)
    .map((name) => firstName({ name }));
  return list([...new Set(names)]);
};
const isParent = (user) => user.kind === USER_KINDS.PARENT;
const forWhom = (user, data) => (isParent(user) ? childNameFor(user, data) || 'your child' : 'you');

const SECTION_LABELS = {
  attendance: 'attendance',
  timetable: 'timetable',
  results: 'results',
  fees: 'fees and receipts',
  notices: 'school notices',
  transport: 'school bus',
  appointments: 'meetings with teachers'
};

module.exports = {
  // ── Logins and access ───────────────────────────────────────────────────
  'user.welcome': {
    module: 'core',
    tone: 'success',
    dedupeKey: (data, user) => String(user._id),
    build: (data, user, { schoolName }) => {
      const school = schoolName || 'your school';
      if (user.kind === USER_KINDS.STAFF) {
        const roles = roleNames(data.roles, data.customRoleNames);
        return {
          title: `Welcome to ${school}${hello(user)}`,
          body: roles.length
            ? `Your login is ready. You're set up as ${list(roles)}, so the menu shows what that role can open.`
            : 'Your login is ready.',
          link: '/dashboard'
        };
      }
      const sections = (data.sections || []).map((s) => SECTION_LABELS[s]).filter(Boolean);
      const whose = isParent(user) ? `${childNameFor(user, data) || 'your child'}'s` : 'your';
      return {
        title: `Welcome to ${school}${hello(user)}`,
        body: sections.length
          ? `You can now see ${whose} ${list(sections)} here.`
          : 'Your family login is ready.',
        portalLink: '/portal'
      };
    }
  },
  'user.roles_changed': {
    module: 'core',
    audience: 'staff',
    tone: 'info',
    build: (data) => {
      const added = roleNames(data.added, data.customRoleNames);
      const removed = roleNames(data.removed, data.customRoleNames);
      if (!added.length && !removed.length) return null;
      const parts = [];
      if (added.length) parts.push(`You now have ${list(added)}.`);
      if (removed.length) parts.push(`You no longer have ${list(removed)}.`);
      return {
        title: 'Your access has changed',
        body: `${parts.join(' ')}${data.by ? ` Changed by ${data.by}.` : ''} The menu now shows what your roles can open.`,
        link: '/dashboard'
      };
    }
  },
  'user.role_permissions_changed': {
    module: 'core',
    audience: 'staff',
    tone: 'info',
    build: (data) => ({
      title: `The ${data.roleName} role was updated`,
      body: 'What you can open may have changed. Sign out and back in if something is missing.',
      link: '/dashboard'
    })
  },
  'user.reactivated': {
    module: 'core',
    tone: 'success',
    build: () => ({ title: 'Your login is active again', body: 'Welcome back. Everything you had access to is open again.' })
  },
  'user.students_linked': {
    module: 'core',
    audience: 'family',
    tone: 'success',
    build: (data) => {
      const names = list(Object.values(data.studentsByRoll || {}).map((name) => firstName({ name })));
      if (!names) return null;
      return {
        title: `${names} ${Object.keys(data.studentsByRoll).length === 1 ? 'is' : 'are'} now on your login`,
        body: 'Switch between children from the menu at the top.',
        portalLink: '/portal'
      };
    }
  },
  'user.password_reset': {
    module: 'core',
    tone: 'warning',
    build: (data) => ({
      title: 'Your password was reset',
      body: `${data.by ? `${data.by} reset your password` : 'Your password was reset'} and you were signed out on other devices. If you didn't ask for this, tell the school office.`
    })
  },
  'user.password_changed': {
    module: 'core',
    tone: 'info',
    build: () => ({
      title: 'Your password was changed',
      body: 'If this wasn\'t you, reset your password from the sign-in page and tell the school office.'
    })
  },
  'user.signed_out_everywhere': {
    module: 'core',
    tone: 'warning',
    build: (data) => ({
      title: 'You were signed out on other devices',
      body: `${data.by ? `${data.by} ended` : 'The school ended'} your other sessions. Sign in again on those devices.`
    })
  },

  // ── Appointments ────────────────────────────────────────────────────────
  'appnt.family_update': {
    module: 'appnt',
    audience: 'family',
    section: 'appointments',
    dedupeKey: (data) => `${data.appointmentId}:${data.event}:${data.at || ''}`,
    build: (data) => {
      const a = data.appointment;
      const when = `${dateLabel(a.date)} at ${timeLabel(a.startTime)}`;
      const reason = a.cancelReason ? ` Reason: ${a.cancelReason}.` : '';
      const copy = {
        requested: ['Meeting request sent', `Your request to meet ${a.hostName} on ${when} is waiting for confirmation.`, 'info'],
        confirmed: ['Meeting confirmed', `You're meeting ${a.hostName} on ${when}.${a.location ? ` Venue: ${a.location}.` : ''} Reference ${a.refNo}.`, 'success'],
        declined: ['Meeting request declined', `${a.hostName} couldn't meet on ${when}.${reason} Please request another time.`, 'danger'],
        cancelled: ['Meeting cancelled', `Your meeting with ${a.hostName} on ${when} was cancelled.${reason}`, 'danger'],
        rescheduled: ['Meeting moved', `Your meeting with ${a.hostName} is now on ${when}.`, 'info'],
        reminder: ['Meeting tomorrow', `You're meeting ${a.hostName} on ${when}.${a.location ? ` Venue: ${a.location}.` : ''}`, 'info']
      }[data.event];
      if (!copy) return null;
      return { title: copy[0], body: copy[1], tone: copy[2], portalLink: '/portal/appointments' };
    }
  },
  'appnt.host_update': {
    module: 'appnt',
    audience: 'staff',
    dedupeKey: (data) => `${data.appointmentId}:${data.event}:${data.at || ''}`,
    build: (data) => {
      const a = data.appointment;
      const who = a.visitor?.name || 'A visitor';
      const when = `${dateLabel(a.date)} at ${timeLabel(a.startTime)}`;
      const about = a.purpose ? ` about ${a.purpose}` : '';
      const copy = {
        requested: ['New meeting request', `${who} asked to meet you on ${when}${about}. Confirm or decline it.`, 'warning'],
        confirmed: ['Meeting booked', `${who} will meet you on ${when}${about}.`, 'info'],
        cancelled: ['Meeting cancelled', `Your meeting with ${who} on ${when} was cancelled.`, 'danger'],
        rescheduled: ['Meeting moved', `Your meeting with ${who} is now on ${when}.`, 'info'],
        checked_in: ['Your visitor has arrived', `${who} is at the front desk${about}.`, 'success'],
        reminder: ['Meeting tomorrow', `${who} is meeting you on ${when}${about}.`, 'info']
      }[data.event];
      if (!copy) return null;
      return { title: copy[0], body: copy[1], tone: copy[2], link: '/appnt/appointments' };
    }
  },

  // ── Exams ───────────────────────────────────────────────────────────────
  'exams.results_published': {
    module: 'exmcl',
    audience: 'family',
    section: 'results',
    tone: 'success',
    dedupeKey: (data) => String(data.examId),
    build: (data, user) => ({
      title: `${data.examName} results are out`,
      body: `See ${isParent(user) ? `${childNameFor(user, data) || 'your child'}'s` : 'your'} marks and report card.`,
      portalLink: '/portal/results'
    })
  },
  'exams.notice_published': {
    module: 'exmcl',
    audience: 'family',
    section: 'notices',
    tone: 'info',
    dedupeKey: (data) => String(data.circularId),
    build: (data) => ({ title: 'New notice from school', body: data.title, portalLink: `/portal/notices/${data.circularId}` })
  },
  'exams.duty_assigned': {
    module: 'cntr',
    audience: 'staff',
    tone: 'info',
    dedupeKey: (data) => `${data.examDate}:${data.roomNo || ''}`,
    build: (data) => ({
      title: `Exam duty on ${dateLabel(data.examDate)}`,
      body: data.roomNo ? `You're invigilating in room ${data.roomNo}.` : 'You\'ve been given an exam duty.'
    })
  },

  // ── Timetable ───────────────────────────────────────────────────────────
  'timetable.published': {
    module: 'timetable',
    section: 'timetable',
    tone: 'info',
    dedupeKey: (data) => String(data.versionId),
    build: (data, user) => ({
      title: 'New timetable published',
      body: user.kind === USER_KINDS.STAFF
        ? `${data.versionName ? `"${data.versionName}" is` : 'A new timetable is'} now in use. Check your periods.`
        : `${isParent(user) ? `${childNameFor(user, data) || 'Your child'}'s` : 'Your'} class timetable has changed.`,
      link: '/timetable',
      portalLink: '/portal/timetable'
    })
  },

  // ── Fees and salary ─────────────────────────────────────────────────────
  'fees.payment_recorded': {
    module: 'cpitl',
    audience: 'family',
    section: 'fees',
    tone: 'success',
    dedupeKey: (data) => String(data.paymentId),
    build: (data, user) => ({
      title: `Fee received: ${inr(data.amount)}`,
      body: `Receipt ${data.receiptNo} for ${forWhom(user, data)}. Download it from Fees.`,
      portalLink: '/portal/fees'
    })
  },
  'fees.payment_cancelled': {
    module: 'cpitl',
    audience: 'family',
    section: 'fees',
    tone: 'danger',
    dedupeKey: (data) => String(data.paymentId),
    build: (data) => ({
      title: `Receipt ${data.receiptNo} was cancelled`,
      body: `${inr(data.amount)} is due again.${data.reason ? ` Reason: ${data.reason}.` : ''} Contact the accounts office with any questions.`,
      portalLink: '/portal/fees'
    })
  },
  'fees.due_soon': {
    module: 'cpitl',
    audience: 'family',
    section: 'fees',
    tone: 'warning',
    dedupeKey: (data) => `${data.demandId}:soon`,
    build: (data, user) => ({
      title: `Fee due on ${dateLabel(data.dueDate)}`,
      body: `${inr(data.balance)} for ${data.label || 'school fees'} (${forWhom(user, data)}).`,
      portalLink: '/portal/fees'
    })
  },
  'fees.overdue': {
    module: 'cpitl',
    audience: 'family',
    section: 'fees',
    tone: 'danger',
    dedupeKey: (data) => `${data.demandId}:overdue`,
    build: (data, user) => ({
      title: 'Fee overdue',
      body: `${inr(data.balance)} for ${data.label || 'school fees'} (${forWhom(user, data)}) was due on ${dateLabel(data.dueDate)}.`,
      portalLink: '/portal/fees'
    })
  },
  'payroll.payslip_ready': {
    module: 'cpitl',
    audience: 'staff',
    tone: 'info',
    dedupeKey: (data) => `${data.month}:ready`,
    build: (data) => ({ title: `Payslip for ${data.monthLabel} is ready`, body: `Net pay ${inr(data.net)}.` })
  },
  'payroll.salary_paid': {
    module: 'cpitl',
    audience: 'staff',
    tone: 'success',
    dedupeKey: (data) => `${data.month}:paid`,
    build: (data) => ({ title: `Salary for ${data.monthLabel} paid`, body: `${inr(data.net)} paid on ${dateLabel(data.paidOn)}.` })
  },

  // ── Attendance ──────────────────────────────────────────────────────────
  'attendance.absent': {
    module: 'attnd',
    audience: 'family',
    section: 'attendance',
    tone: 'danger',
    dedupeKey: (data) => `${data.studentId}:${data.date}`,
    build: (data, user) => ({
      title: `${isParent(user) ? childNameFor(user, data) || 'Your child' : 'You'} marked absent`,
      body: `${isParent(user) ? 'Marked' : 'You were marked'} absent on ${dateLabel(data.date)}${data.className ? ` in ${classLabel(data.className, data.section)}` : ''}. If this is wrong, tell the class teacher.`,
      portalLink: '/portal/attendance'
    })
  },

  // ── Transport ───────────────────────────────────────────────────────────
  'transport.trip_started': {
    module: 'trnst',
    audience: 'family',
    section: 'transport',
    tone: 'info',
    dedupeKey: (data) => String(data.tripId),
    build: (data) => ({
      title: data.direction === 'pickup' ? 'The school bus is on its way' : 'The school bus has left school',
      body: `${data.routeName ? `${data.routeName}. ` : ''}Track it live in School bus.`,
      portalLink: '/portal/transport'
    })
  },
  'transport.boarded': {
    module: 'trnst',
    audience: 'family',
    section: 'transport',
    tone: 'success',
    dedupeKey: (data) => `${data.tripId}:${data.studentId}:boarded`,
    build: (data, user) => ({
      title: `${isParent(user) ? childNameFor(user, data) || 'Your child' : 'You'} boarded the bus`,
      body: `At ${new Date(data.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`,
      portalLink: '/portal/transport'
    })
  },
  'transport.dropped': {
    module: 'trnst',
    audience: 'family',
    section: 'transport',
    tone: 'success',
    dedupeKey: (data) => `${data.tripId}:${data.studentId}:dropped`,
    build: (data, user) => ({
      title: `${isParent(user) ? childNameFor(user, data) || 'Your child' : 'You'} got off the bus`,
      body: `At ${new Date(data.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`,
      portalLink: '/portal/transport'
    })
  },

  // ── Assets ──────────────────────────────────────────────────────────────
  'assets.allocated': {
    module: 'asets',
    audience: 'staff',
    tone: 'info',
    dedupeKey: (data) => String(data.allocationId),
    build: (data) => ({
      title: `${data.assetName} is now in your care`,
      body: `${data.assetTag ? `Tag ${data.assetTag}. ` : ''}${data.location ? `Kept at ${data.location}. ` : ''}Report any damage to the office.`
    })
  },
  'assets.maintenance_due': {
    module: 'asets',
    audience: 'staff',
    tone: 'warning',
    dedupeKey: (data) => `${data.maintenanceId}:${data.dueDate}`,
    build: (data) => ({
      title: `${plural(data.count, 'asset')} due for maintenance`,
      body: data.names?.length ? `${list(data.names.slice(0, 3))}${data.count > 3 ? ` and ${data.count - 3} more` : ''}.` : '',
      link: '/asets/maintenance'
    })
  },

  // ── Plan and billing (school administrators) ────────────────────────────
  'billing.notice': {
    module: 'billing',
    audience: 'staff',
    dedupeKey: (data) => data.key,
    build: (data) => ({
      title: data.title,
      body: data.body || 'Open Billing for the details.',
      tone: data.tone,
      link: '/billing'
    })
  }
};
