/**
 * Effective fee due dates. When the school asks for it (Finance settings →
 * "A due date on a holiday moves to the next working day"), a demand whose due
 * date falls on a day the school is closed is treated as due on the next
 * working day: in late fees, reminders, the portal and the calendar.
 *
 * The stored FeeDemand.dueDate never changes (paid demands are frozen and
 * printed slips must stay true); the shift is worked out when read.
 */
const schoolDate = require('../../utils/schoolDate');
const schoolDays = require('../clndr/schoolDays');

const MODES = Object.freeze(['keep', 'next_working_day']);

/**
 * Add `effectiveDueDate` (a Date) to each demand that moves. Demands are plain
 * objects (lean or toObject()). Returns the same array. Fails soft: on any
 * problem the stored dates are used.
 */
const withEffectiveDueDates = async (models, demands, { mode = null, settings = null } = {}) => {
  try {
    const resolvedMode = mode || settings?.holidayDueDates
      || (await models.CapitalSettings?.findOne({ key: 'default' }).select('holidayDueDates').lean())?.holidayDueDates
      || 'keep';
    if (resolvedMode !== 'next_working_day' || !demands.length) return demands;
    const keys = demands.map((d) => (d.dueDate ? schoolDate.dateKey(d.dueDate) : '')).filter(Boolean).sort();
    if (!keys.length) return demands;
    const from = keys[0];
    const to = schoolDate.addDays(keys[keys.length - 1], 120);
    // A session of instalments spans more than the 400 days one lookup allows: read it in windows.
    const rules = await schoolDays.loadRules(models, from, to);
    const days = {};
    for (let start = from; start <= to; start = schoolDate.addDays(start, 300)) {
      const end = schoolDate.addDays(start, 299) < to ? schoolDate.addDays(start, 299) : to;
      // eslint-disable-next-line no-await-in-loop
      Object.assign(days, await schoolDays.range(models, start, end, null, { rules }));
    }
    const nextWorking = (key) => {
      let cursor = key;
      // Long vacations (summer) can push a due date up to four months.
      for (let i = 0; i < 120; i += 1) {
        if (!days[cursor] || days[cursor].working) return cursor;
        cursor = schoolDate.addDays(cursor, 1);
      }
      return key;
    };
    demands.forEach((demand) => {
      if (!demand.dueDate) return;
      const key = schoolDate.dateKey(demand.dueDate);
      const moved = nextWorking(key);
      if (moved !== key) {
        // Keep the stored time-of-day convention (UTC midnight of the school day).
        demand.effectiveDueDate = new Date(`${moved}T00:00:00.000Z`);
        demand.dueDateMovedFrom = key;
      }
    });
    return demands;
  } catch (error) {
    console.warn(`[cpitl] effective due dates unavailable: ${error.message}`);
    return demands;
  }
};

const dueDateOf = (demand) => demand?.effectiveDueDate || demand?.dueDate;

module.exports = { MODES, withEffectiveDueDates, dueDateOf };
