/**
 * Centralized event name constants for the in-process event bus.
 *
 * Naming convention: "<module>:<entity>:<action>"
 *   - core   → shared kernel entities (Teacher, Student, Subject, Room)
 *   - exam   → exam / centre management bounded context
 *   - timetable → timetable bounded context
 */
module.exports = Object.freeze({
  // ── Core module ────────────────────────────────────────────────────────────
  TEACHER_DEACTIVATED: 'core:teacher:deactivated',
  TEACHER_DELETED: 'core:teacher:deleted',
  TEACHER_UPDATED: 'core:teacher:updated',
  SUBJECT_UPDATED: 'core:subject:updated',
  // { userId, change: created | roles_changed | reactivated | students_linked
  //   | password_reset | password_changed | signed_out_everywhere, ...details }
  USER_ACCOUNT_CHANGED: 'core:user:account_changed',
  ROLE_PERMISSIONS_CHANGED: 'core:role:permissions_changed',

  // ── Exam module ────────────────────────────────────────────────────────────
  SEATING_PLAN_GENERATED: 'exam:seatingplan:generated',
  DUTY_ASSIGNED: 'exam:duty:assigned',
  EXAM_RESULTS_PUBLISHED: 'exam:results:published',
  EXAM_NOTICE_PUBLISHED: 'exam:circular:published',

  // ── Timetable module ──────────────────────────────────────────────────────
  TIMETABLE_GENERATED: 'timetable:generated',
  TIMETABLE_PUBLISHED: 'timetable:published',

  // ── Appointments module ───────────────────────────────────────────────────
  APPOINTMENT_BOOKED: 'appnt:appointment:booked',
  APPOINTMENT_STATUS_CHANGED: 'appnt:appointment:status_changed',

  // ── Transport module ──────────────────────────────────────────────────────
  TRANSPORT_TRIP_STARTED: 'trnst:trip:started',
  TRANSPORT_TRIP_ENDED: 'trnst:trip:ended',
  TRANSPORT_STUDENT_BOARDED: 'trnst:student:boarded',
  TRANSPORT_STUDENT_DROPPED: 'trnst:student:dropped',

  // ── Finance module ────────────────────────────────────────────────────────
  FEE_PAYMENT_RECORDED: 'cpitl:payment:recorded',
  FEE_PAYMENT_CANCELLED: 'cpitl:payment:cancelled',
  PAYROLL_FINALIZED: 'cpitl:payroll:finalized',
  PAYROLL_PAID: 'cpitl:payroll:paid',

  // ── Attendance module ─────────────────────────────────────────────────────
  STUDENTS_MARKED_ABSENT: 'attnd:students:absent',

  // ── Assets module ─────────────────────────────────────────────────────────
  ASSET_ALLOCATED: 'asets:asset:allocated'
});
