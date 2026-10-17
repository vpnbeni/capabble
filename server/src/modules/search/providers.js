/**
 * Record providers for the global search (command palette).
 *
 * Each provider describes one searchable collection:
 * - `enabled(ctx)`  — feature-toggle / permission gate (`can(key)`); disabled providers never query.
 * - `baseFilter`    — object, or `(ctx) => object` for per-user scoping (e.g. a teacher's sections).
 * - `fields`        — which fields to match and how:
 *     prefixUpper: anchored, case-sensitive prefix on fields stored uppercase (index-friendly)
 *     prefix:      anchored, case-insensitive prefix (codes, phone numbers)
 *     contains:    case-insensitive substring (names)
 * - `map(doc, ctx)` — shape a lean document into a palette item.
 */

const on = (toggles, key) => toggles[key] !== false;
const join = (parts, sep = ' · ') => parts.filter(Boolean).join(sep);
const classLabel = (cls, section) => (cls ? `Class ${join([cls, section], '-')}` : '');
const humanize = (value) => String(value).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const withQuery = (path, q) => `${path}?q=${encodeURIComponent(q)}`;

const PROVIDERS = [
  {
    type: 'student',
    label: 'Students',
    modelKey: 'Student',
    enabled: ({ toggles, can }) => (on(toggles, 'stdnt_students') && can('stdnt.students.read'))
      || (on(toggles, 'cpitl_fees') && can('cpitl.finance.view')),
    baseFilter: ({ scopes }) => scopes?.student || {},
    fields: {
      prefixUpper: ['rollNumber'],
      prefix: ['guardianPhone', 'phone', 'penNumber'],
      contains: ['name', 'fatherName']
    },
    select: 'name rollNumber class section classRollNo fatherName guardianPhone isActive profileImage',
    map: (doc, { toggles, can }) => ({
      title: doc.name,
      subtitle: join([
        classLabel(doc.class, doc.section),
        doc.rollNumber && `Adm ${doc.rollNumber}`,
        doc.fatherName && `F: ${doc.fatherName}`
      ]),
      path: on(toggles, 'stdnt_students') && can('stdnt.students.read')
        ? `/stdnt/students/${doc._id}`
        : `/cpitl/students/${doc._id}`,
      badge: doc.isActive === false ? 'Inactive' : undefined,
      image: doc.profileImage || undefined
    })
  },
  {
    type: 'staff',
    label: 'Staff',
    modelKey: 'Teacher',
    enabled: ({ toggles, can }) => (on(toggles, 'staaf_staff_members') || on(toggles, 'exam_functionaries'))
      && can('staaf.staff.read'),
    fields: {
      prefix: ['employeeId', 'oasisId', 'mobileNo'],
      contains: ['name', 'email', 'designation']
    },
    select: 'name employeeId oasisId designation department mobileNo isActive profileImage',
    map: (doc, { toggles }) => ({
      title: doc.name,
      subtitle: join([
        doc.designation,
        doc.department,
        doc.employeeId ? `Emp ${doc.employeeId}` : doc.oasisId && `OASIS ${doc.oasisId}`
      ]),
      path: on(toggles, 'staaf_staff_members') ? `/staaf/staff/${doc._id}` : `/exam-functionaries/${doc._id}`,
      badge: doc.isActive === false ? 'Inactive' : undefined,
      image: doc.profileImage || undefined
    })
  },
  {
    type: 'receipt',
    label: 'Fee receipts',
    modelKey: 'FeePayment',
    enabled: ({ toggles, can }) => on(toggles, 'cpitl_fees') && can('cpitl.finance.view'),
    fields: {
      prefix: ['receiptNo', 'studentSnapshot.rollNumber', 'cheque.number'],
      contains: ['studentSnapshot.name']
    },
    select: 'receiptNo student studentSnapshot date feeAmount lateFeeCollected status mode',
    sort: { date: -1 },
    map: (doc) => {
      const amount = Number(doc.feeAmount || 0) + Number(doc.lateFeeCollected || 0);
      const date = doc.date
        ? new Date(doc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      return {
        title: `Receipt ${doc.receiptNo}`,
        subtitle: join([
          doc.studentSnapshot?.name,
          classLabel(doc.studentSnapshot?.class, doc.studentSnapshot?.section),
          `₹${amount.toLocaleString('en-IN')}`,
          date
        ]),
        path: `/cpitl/students/${doc.student}`,
        badge: doc.status === 'cancelled' ? 'Cancelled' : undefined
      };
    }
  },
  {
    type: 'asset',
    label: 'Assets',
    modelKey: 'Asset',
    enabled: ({ toggles, can }) => on(toggles, 'asets_dashboard') && can('asets.assets.view'),
    baseFilter: { isArchived: { $ne: true } },
    fields: {
      prefixUpper: ['assetId'],
      prefix: ['assetTag', 'serialNumber', 'barcode'],
      contains: ['name', 'brand', 'model']
    },
    select: 'assetId assetTag name brand model status roomLabel locationPath',
    map: (doc) => ({
      title: doc.name,
      subtitle: join([doc.assetId, join([doc.brand, doc.model], ' '), doc.roomLabel || doc.locationPath]),
      path: `/asets/assets/${doc._id}`,
      badge: doc.status ? humanize(doc.status) : undefined
    })
  },
  {
    type: 'subject',
    label: 'Subjects',
    modelKey: 'Subject',
    enabled: ({ toggles, can }) => (on(toggles, 'stdnt_subjects') || on(toggles, 'subjects')) && can('core.subjects.read'),
    fields: {
      prefix: ['code'],
      contains: ['name']
    },
    select: 'name code class',
    map: (doc, { toggles, q }) => ({
      title: doc.name,
      subtitle: join([doc.code && `Code ${doc.code}`, doc.class && `Class ${doc.class}`]),
      path: withQuery(on(toggles, 'stdnt_subjects') ? '/stdnt/subjects' : '/subjects', doc.code || q)
    })
  },
  {
    type: 'room',
    label: 'Rooms',
    modelKey: 'Room',
    enabled: ({ toggles, can }) => on(toggles, 'examrooms') && can('exam.setup.read'),
    fields: {
      prefix: ['roomNo'],
      contains: ['roomName']
    },
    select: 'roomNo roomName floor capacity',
    map: (doc) => ({
      title: join([doc.roomNo && `Room ${doc.roomNo}`, doc.roomName], ' — '),
      subtitle: join([doc.floor, doc.capacity ? `${doc.capacity} seats` : '']),
      path: '/examrooms'
    })
  },
  {
    type: 'alumni',
    label: 'Alumni',
    modelKey: 'Alumni',
    enabled: ({ toggles, can }) => on(toggles, 'almni_directory') && can('stdnt.alumni.read'),
    fields: {
      prefix: ['rollNumber', 'phone'],
      contains: ['name']
    },
    select: 'name rollNumber batchSession passedOutClass occupation currentCity',
    map: (doc) => ({
      title: doc.name,
      subtitle: join([
        doc.batchSession && `Batch ${doc.batchSession}`,
        doc.passedOutClass && `Class ${doc.passedOutClass}`,
        doc.occupation,
        doc.currentCity
      ]),
      path: withQuery('/stdnt/alumni', doc.name)
    })
  },
  {
    type: 'appointment',
    label: 'Appointments',
    modelKey: 'Appointment',
    // Hosts without the view permission only see their own appointments in the module itself.
    enabled: ({ toggles, can }) => on(toggles, 'appnt_desk') && can('appnt.appointments.view'),
    fields: {
      prefix: ['refNo', 'visitor.phone'],
      contains: ['visitor.name', 'studentSnapshot.name']
    },
    select: 'refNo date startTime hostName status visitor.name studentSnapshot.name',
    map: (doc) => ({
      title: doc.visitor?.name || doc.refNo,
      subtitle: join([doc.refNo, doc.date, doc.hostName && `with ${doc.hostName}`, doc.studentSnapshot?.name]),
      path: withQuery('/appnt/appointments', doc.refNo),
      badge: humanize(doc.status)
    })
  },
  {
    type: 'candidate',
    label: 'Exam candidates',
    modelKey: 'Candidate',
    enabled: ({ toggles, can }) => on(toggles, 'candidates') && can('exam.candidates.read'),
    fields: {
      prefix: ['rollNumber', 'schoolCode'],
      contains: ['name', 'fatherName']
    },
    select: 'name rollNumber class schoolName schoolCode fatherName',
    map: (doc) => ({
      title: doc.name,
      subtitle: join([
        doc.rollNumber && `Roll ${doc.rollNumber}`,
        doc.class && `Class ${doc.class}`,
        doc.fatherName && `F: ${doc.fatherName}`,
        doc.schoolName
      ]),
      path: `/candidate-details/${doc._id}`
    })
  }
];

module.exports = { PROVIDERS };
