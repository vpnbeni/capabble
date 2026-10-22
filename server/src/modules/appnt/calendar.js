/**
 * Appointments on the calendar: a host's own meetings and a family's meetings.
 * The purpose and notes stay in the appointments module.
 */
const { item } = require('../clndr/providers');
const { ACTIVE_STATUSES } = require('./lifecycle');

const visitorLabel = (a) => {
  const name = a.visitor?.name || 'Visitor';
  return a.studentSnapshot?.name ? `${name} (${a.studentSnapshot.name})` : name;
};

const appointments = {
  key: 'appnt.appointments',
  layer: 'appointments',
  features: ['appnt_desk'],
  audiences: ['staff', 'parent', 'student'],
  list: async ({ models, viewer, user, from, to, portal, portalSections = [] }) => {
    const { Appointment, AppointmentHost } = models;
    if (!Appointment) return [];
    const range = { date: { $gte: from, $lte: to }, status: { $in: [...ACTIVE_STATUSES] } };

    if (viewer.kind === 'staff') {
      if (!AppointmentHost) return [];
      const or = [{ user: user._id }];
      if (user.teacher) or.push({ teacher: user.teacher });
      const hosts = await AppointmentHost.find({ $or: or }).select('_id').lean();
      if (!hosts.length) return [];
      const list = await Appointment.find({ ...range, host: { $in: hosts.map((h) => h._id) } })
        .select('date startTime endTime status visitor.name studentSnapshot.name location').lean();
      return list.map((a) => item({
        id: `appointment:${a._id}`,
        title: `Meeting: ${visitorLabel(a)}`,
        startDate: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        venue: a.location || '',
        detail: a.status === 'requested' ? 'Waiting for your confirmation' : '',
        link: '/appnt/today',
        tentative: a.status === 'requested'
      }));
    }

    if (portal && !portalSections.includes('appointments')) return [];
    const childIds = viewer.children.map((child) => child.studentId);
    const list = await Appointment.find({ ...range, $or: [{ requestedBy: user._id }, { student: { $in: childIds } }] })
      .select('date startTime endTime status hostName student location').lean();
    return list.map((a) => {
      const child = viewer.children.find((c) => c.studentId === String(a.student));
      return item({
        id: `appointment:${a._id}`,
        title: `Meeting with ${a.hostName || 'the school'}`,
        startDate: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        venue: a.location || '',
        detail: a.status === 'requested' ? 'Waiting for the school to confirm' : '',
        link: '/portal/appointments',
        child: child ? { studentId: child.studentId, name: child.name } : null,
        tentative: a.status === 'requested'
      });
    });
  }
};

module.exports = [appointments];
