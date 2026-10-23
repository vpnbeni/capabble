/**
 * Cntr module — Exam Centre Management.
 *
 * CBSE examination centre operations: datesheet import, candidate management,
 * seating plans, duty assignment, answer sheet tracking, Form 66 attendance,
 * dispatch, guidelines, undertakings, CBSE circulars, and remuneration.
 */
const { mountRoutes } = require('./routes');
const calendar = require('./calendar');
const models = require('./models');
const listeners = require('./listeners');

module.exports = {
  key: 'cntr',
  label: 'Cntr — Exam Centre Management',
  mountRoutes,
  models,
  listeners,
  calendar,
};
