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

  // ── Exam module ────────────────────────────────────────────────────────────
  SEATING_PLAN_GENERATED: 'exam:seatingplan:generated',
  DUTY_ASSIGNED: 'exam:duty:assigned',

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
});
