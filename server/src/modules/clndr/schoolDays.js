/**
 * School days: whether a date is a working day, for the whole school or for
 * one class-section. The only reader of SchoolDayRule — attendance, timetable,
 * appointments, fees and the calendar all ask here.
 *
 *   const days = await schoolDays.range(models, '2026-11-01', '2026-11-30', { className: '7', section: 'B' });
 *   days['2026-11-14'] // { working: false, kind: 'holiday', label: "Children's Day", ... }
 *
 * Precedence on one day: closure > working-day override > vacation > holiday >
 * weekly off. A half day only applies to a working day. Sunday is off unless
 * the school set its own Sunday rule (a working-day override opens a Sunday).
 */
const schoolDate = require('../../utils/schoolDate');
const { normalizeClassName, sectionKey } = require('../../rbac/scope');

const MAX_RANGE_DAYS = 400;
const OFF_KINDS = new Set(['weekly_off', 'holiday', 'vacation', 'closure']);
const RANK = { closure: 5, working_day: 4, vacation: 3, holiday: 2, weekly_off: 1 };

const IMPLICIT_SUNDAY = Object.freeze({
  _id: null,
  implicit: true,
  kind: 'weekly_off',
  title: 'Sunday',
  startDate: '0000-01-01',
  endDate: '9999-12-31',
  weekly: { weekday: 0, weeksOfMonth: [] },
  appliesTo: { scope: 'school', classes: [], sections: [] },
  status: 'active'
});

/** Normalise an `appliesTo` from user input to stored form. */
const normalizeAppliesTo = (appliesTo = {}) => {
  const classes = [...new Set((appliesTo.classes || []).map(normalizeClassName).filter(Boolean))];
  const sections = [...new Set((appliesTo.sections || [])
    .map((entry) => (typeof entry === 'string' ? entry.split('|') : [entry?.className, entry?.section]))
    .filter(([className, section]) => className && section)
    .map(([className, section]) => sectionKey(className, section)))];
  const scope = appliesTo.scope === 'classes' && (classes.length || sections.length) ? 'classes' : 'school';
  return { scope, classes: scope === 'school' ? [] : classes, sections: scope === 'school' ? [] : sections };
};

const ruleWeeklyMatches = (rule, key) => {
  const weekly = rule.weekly || {};
  if (schoolDate.weekday(key) !== weekly.weekday) return false;
  const weeks = weekly.weeksOfMonth || [];
  return !weeks.length || weeks.includes(schoolDate.weekOfMonth(key));
};

const ruleCoversDate = (rule, key) => {
  if (key < rule.startDate || key > rule.endDate) return false;
  return rule.kind !== 'weekly_off' || ruleWeeklyMatches(rule, key);
};

/**
 * Does the rule apply to this audience? `scope` is null for the whole school,
 * or { className, section } for one class-section (section optional).
 * Returns 'yes', 'no' or 'partly' (class-only rule seen school-wide).
 */
const ruleAppliesTo = (rule, scope) => {
  const appliesTo = rule.appliesTo || {};
  if (appliesTo.scope !== 'classes') return 'yes';
  if (!scope?.className) return 'partly';
  const cls = normalizeClassName(scope.className);
  if ((appliesTo.classes || []).includes(cls)) return 'yes';
  if (scope.section && (appliesTo.sections || []).includes(sectionKey(scope.className, scope.section))) return 'yes';
  return 'no';
};

const defaultTitle = (rule) => {
  switch (rule.kind) {
  case 'weekly_off': return `${schoolDate.WEEKDAY_NAMES[rule.weekly?.weekday] || 'Weekly'} off`;
  case 'holiday': return 'Holiday';
  case 'vacation': return 'Vacation';
  case 'closure': return rule.mode === 'closed' ? 'School closed' : `Classes ${rule.mode}`;
  case 'half_day': return 'Half day';
  default: return 'Working day';
  }
};

const describeRule = (rule) => ({
  id: rule._id ? String(rule._id) : null,
  kind: rule.kind,
  label: rule.title || defaultTitle(rule),
  category: rule.category,
  mode: rule.kind === 'closure' ? rule.mode : undefined,
  halfDayEndTime: rule.kind === 'half_day' ? rule.halfDayEndTime : undefined,
  tentative: Boolean(rule.tentative),
  authority: rule.authority || undefined,
  orderNo: rule.orderNo || undefined,
  appliesTo: rule.appliesTo?.scope === 'classes'
    ? { classes: rule.appliesTo.classes, sections: rule.appliesTo.sections }
    : null,
  implicit: Boolean(rule.implicit)
});

/** Work out one day from the rules that cover it. Pure. */
const resolveDay = (key, rules, scope) => {
  const covering = rules.filter((rule) => ruleCoversDate(rule, key));
  const applying = [];
  const partial = [];
  covering.forEach((rule) => {
    const applies = ruleAppliesTo(rule, scope);
    if (applies === 'yes') applying.push(rule);
    else if (applies === 'partly') partial.push(rule);
  });

  const ranked = applying.filter((rule) => RANK[rule.kind]).sort((a, b) => RANK[b.kind] - RANK[a.kind]);
  const top = ranked[0];
  // A closure that keeps classes running online or hybrid is still a (remote) working day.
  const closedByTop = top && (top.kind === 'closure' ? top.mode === 'closed' : OFF_KINDS.has(top.kind));
  const working = !closedByTop;
  const halfDay = working ? applying.find((rule) => rule.kind === 'half_day') : null;

  let kind = 'working';
  if (top && top.kind !== 'working_day') kind = top.kind;
  else if (halfDay) kind = 'half_day';

  const shown = top && top.kind !== 'working_day' ? top : halfDay;
  return {
    date: key,
    weekday: schoolDate.weekday(key),
    working,
    kind,
    label: shown ? (shown.title || defaultTitle(shown)) : '',
    mode: top?.kind === 'closure' ? top.mode : undefined,
    halfDayEndTime: halfDay?.halfDayEndTime,
    tentative: Boolean(shown?.tentative),
    rules: applying.filter((rule) => !rule.implicit || rule === top).map(describeRule),
    partial: partial.map(describeRule)
  };
};

const assertRange = (from, to) => {
  if (!schoolDate.isDateKey(from) || !schoolDate.isDateKey(to)) {
    throw Object.assign(new Error('Dates must be YYYY-MM-DD'), { status: 400 });
  }
  if (to < from) throw Object.assign(new Error('The end date must be on or after the start date'), { status: 400 });
  if (schoolDate.daysBetween(from, to) > MAX_RANGE_DAYS) {
    throw Object.assign(new Error(`Ask for at most ${MAX_RANGE_DAYS} days at a time`), { status: 400 });
  }
};

/** Active rules that touch [from, to], plus the implicit Sunday when the school set no weekly off. */
const loadRules = async (models, from, to) => {
  const { SchoolDayRule } = models;
  if (!SchoolDayRule) return [IMPLICIT_SUNDAY];
  const [rules, sundayRules] = await Promise.all([
    SchoolDayRule.find({ status: 'active', startDate: { $lte: to }, endDate: { $gte: from } }).lean(),
    SchoolDayRule.countDocuments({ status: 'active', kind: 'weekly_off', 'weekly.weekday': 0 })
  ]);
  // Sunday is off unless the school set its own Sunday pattern; a Saturday rule adds to it.
  return sundayRules ? rules : [...rules, IMPLICIT_SUNDAY];
};

/** Day info for every day in [from, to] for the given audience (null = whole school). */
const range = async (models, from, to, scope = null, { rules } = {}) => {
  assertRange(from, to);
  const loaded = rules || await loadRules(models, from, to);
  const days = {};
  for (let key = from; key <= to; key = schoolDate.addDays(key, 1)) {
    days[key] = resolveDay(key, loaded, scope);
  }
  return days;
};

/** Day info for one day. */
const dayInfo = async (models, key, scope = null) => (await range(models, key, key, scope))[key];

/** Is `key` a working day for this audience? Fails open (true) when anything goes wrong. */
const isWorkingDay = async (models, key, scope = null) => {
  try {
    return (await dayInfo(models, key, scope)).working;
  } catch (error) {
    console.warn(`[clndr] school-day check failed for ${key}: ${error.message}`);
    return true;
  }
};

/** The first working day on or after `key` (looks ahead at most 60 days). */
const nextWorkingDay = async (models, key, scope = null) => {
  const to = schoolDate.addDays(key, 60);
  const days = await range(models, key, to, scope);
  const found = Object.values(days).find((day) => day.working);
  return found ? found.date : key;
};

/** Working days in [from, to] for this audience. */
const workingDays = async (models, from, to, scope = null) => Object.values(await range(models, from, to, scope))
  .filter((day) => day.working)
  .map((day) => day.date);

module.exports = {
  IMPLICIT_SUNDAY,
  normalizeAppliesTo,
  resolveDay,
  ruleAppliesTo,
  loadRules,
  range,
  dayInfo,
  isWorkingDay,
  nextWorkingDay,
  workingDays,
  defaultTitle
};
