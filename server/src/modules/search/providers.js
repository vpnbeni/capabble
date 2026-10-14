/**
 * Record providers for the global search (command palette).
 *
 * Each provider describes one searchable collection:
 * - `enabled(ctx)`  — feature-toggle / role gate; disabled providers never query.
 * - `fields`        — which fields to match and how:
 *     prefixUpper: anchored, case-sensitive prefix on fields stored uppercase (index-friendly)
 *     prefix:      anchored, case-insensitive prefix (codes, phone numbers)
 *     contains:    case-insensitive substring (names)
 * - `map(doc, ctx)` — shape a lean document into a palette item.
 */
const { roleHasPermission: cpitlRoleHas, CPITL_PERMISSIONS } = require('../cpitl/constants');
const { roleHasPermission: asetsRoleHas, ASETS_PERMISSIONS } = require('../asets/lifecycle');

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
    enabled: ({ toggles }) => on(toggles, 'stdnt_students') || on(toggles, 'cpitl_fees'),
    fields: {
      prefixUpper: ['rollNumber'],
      prefix: ['guardianPhone', 'phone', 'penNumber'],
      contains: ['name', 'fatherName']
    },
    select: 'name rollNumber class section classRollNo fatherName guardianPhone isActive profileImage',
    map: (doc, { toggles }) => ({
      title: doc.name,
      subtitle: join([
        classLabel(doc.class, doc.section),
        doc.rollNumber && `Adm ${doc.rollNumber}`,
        doc.fatherName && `F: ${doc.fatherName}`
      ]),
      path: on(toggles, 'stdnt_students') ? `/stdnt/students/${doc._id}` : `/cpitl/students/${doc._id}`,
      badge: doc.isActive === false ? 'Inactive' : undefined,
      image: doc.profileImage || undefined
    })
  },
  {
    type: 'staff',
    label: 'Staff',
    modelKey: 'Teacher',
    enabled: ({ toggles }) => on(toggles, 'staaf_staff_members') || on(toggles, 'exam_functionaries'),
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
    enabled: ({ toggles, role }) => on(toggles, 'cpitl_fees') && cpitlRoleHas(role, CPITL_PERMISSIONS.VIEW),
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
    enabled: ({ toggles, role }) => on(toggles, 'asets_dashboard') && asetsRoleHas(role, ASETS_PERMISSIONS.ASETS_VIEW),
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
    enabled: ({ toggles }) => on(toggles, 'stdnt_subjects') || on(toggles, 'subjects'),
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
    enabled: ({ toggles }) => on(toggles, 'examrooms'),
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
    enabled: ({ toggles }) => on(toggles, 'almni_directory'),
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
    type: 'candidate',
    label: 'Exam candidates',
    modelKey: 'Candidate',
    enabled: ({ toggles }) => on(toggles, 'candidates'),
    fields: {
      prefix: ['rollNumber', 'schoolCode'],
      contains: ['name', 'fatherName']
    },
    select: 'name rollNumber class schoolName schoolCode',
    map: (doc) => ({
      title: doc.name,
      subtitle: join([doc.rollNumber && `Roll ${doc.rollNumber}`, doc.class && `Class ${doc.class}`, doc.schoolName]),
      path: `/candidate-details/${doc._id}`
    })
  }
];

module.exports = { PROVIDERS };
