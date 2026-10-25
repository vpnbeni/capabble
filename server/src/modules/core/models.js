/**
 * Core module model barrel.
 *
 * Re-exports all model proxies that belong to the shared kernel.
 * These models are ALWAYS registered regardless of which modules are active.
 *
 * Canonical source of truth for core model ownership.
 * Keep in sync with MODULE_MODEL_KEYS.core in constants/moduleModelKeys.js.
 */
const mailRecords = require('../../models/MailRecords');
const pushRecords = require('../../models/PushRecords');

module.exports = {
  User: require('../../models/User'),
  Teacher: require('../../models/Teacher'),
  Subject: require('../../models/Subject'),
  Room: require('../../models/Room'),
  AcademicSession: require('../../models/AcademicSession'),
  CBSEDatesheet: require('../../models/CBSEDatesheet'),
  Feedback: require('../../models/Feedback'),
  SupportTicket: require('../../models/SupportTicket'),
  OnboardingSession: require('../../models/OnboardingSession'),
  SchoolDayRule: require('../../models/SchoolDayRule'),
  CalendarEvent: require('../../models/CalendarEvent'),
  CalendarResponse: require('../../models/CalendarResponse'),
  SchoolMailSettings: mailRecords.SchoolMailSettings,
  MailOutbox: mailRecords.MailOutbox,
  MailSuppression: mailRecords.MailSuppression,
  Device: pushRecords.Device,
  PushOutbox: pushRecords.PushOutbox,
};
