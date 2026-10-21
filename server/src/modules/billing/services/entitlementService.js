// What a school may use right now. The main server caches this and enforces it.
const { eq } = require('drizzle-orm');
const { transaction } = require('../db/client');
const s = require('../db/schema');
const config = require('../config');
const accounts = require('./accountService');
const subscriptions = require('./subscriptionService');
const sm = require('../domain/stateMachine');
const { SUBSCRIPTION_STATES: S, ACCESS_MODES, CORE_ALLOWED_MODULES } = require('../domain/constants');
const { SYSTEM_ACTOR } = require('./auditService');

const ALL = ['*'];

/**
 * Entitlement contract (v2). Every v1 field keeps its meaning:
 * tenantSlug, state, accessMode, allowedModules, isReadOnly, reason, planCode,
 * trialEndsAt, graceEndsAt, computedAt, validUntil.
 * Added: entitledModules (module codes or ['*']), periodEndsAt, studentsBilled,
 * cancelAtPeriodEnd, subscriptionId.
 * v3: accessMode 'setup_required' (reason 'plan_required') until the school opts in to a
 * trial or pays; plannedModules (the chosen modules, even while everything is open); autopay.
 */
function buildEntitlement({ slug, sub, moduleCodes, coreCodes, now }) {
  const validUntil = new Date(now.getTime() + config.entitlementTtlSeconds * 1000);
  // No plan yet (or one waiting for its autopay): the school opts in to a trial first.
  const lapsedCheckout = sub && sub.state === S.CANCELED && sub.trialConsentAt && !sub.trialStartedAt && !sub.currentPeriodEnd;
  if (!sub || sm.normalizeState(sub.state) === S.INCOMPLETE || lapsedCheckout) {
    return {
      tenantSlug: slug,
      state: sub && !lapsedCheckout ? S.INCOMPLETE : null,
      accessMode: ACCESS_MODES.SETUP_REQUIRED,
      allowedModules: CORE_ALLOWED_MODULES,
      entitledModules: coreCodes,
      plannedModules: [],
      isReadOnly: false,
      reason: 'plan_required',
      planCode: null,
      trialEndsAt: null,
      graceEndsAt: null,
      periodEndsAt: null,
      studentsBilled: 0,
      cancelAtPeriodEnd: false,
      autopay: false,
      subscriptionId: sub && !lapsedCheckout ? sub.id : null,
      computedAt: now,
      validUntil
    };
  }
  const state = sm.normalizeState(sub.state);
  const accessMode = sm.accessModeFor(state);
  const everything = state === S.TRIALING || state === S.GRANDFATHERED;
  return {
    tenantSlug: slug,
    state,
    accessMode,
    allowedModules: ALL,
    entitledModules: everything ? ALL : [...new Set([...coreCodes, ...moduleCodes])].sort(),
    // What the school chose: what stays on once a trial or complimentary period ends.
    plannedModules: [...moduleCodes].sort(),
    isReadOnly: accessMode === ACCESS_MODES.READ_ONLY,
    reason: state,
    planCode: sub.bundleCode || (moduleCodes.length ? 'modules' : null),
    trialEndsAt: sub.trialEndsAt || null,
    graceEndsAt: sub.graceEndsAt || null,
    periodEndsAt: sub.currentPeriodEnd || null,
    studentsBilled: sub.billedStudents || 0,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    autopay: sub.collectionMode === 'auto_debit',
    subscriptionId: sub.id,
    computedAt: now,
    validUntil
  };
}

async function getEntitlement(slug, now = new Date()) {
  const tenantSlug = String(slug).toLowerCase();
  return transaction(async (tx) => {
    const coreCodes = (await tx.select({ code: s.modules.code }).from(s.modules).where(eq(s.modules.isCore, true))).map((r) => r.code);
    const account = await accounts.findAccountBySlug(tenantSlug, tx);
    if (!account) return buildEntitlement({ slug: tenantSlug, sub: null, moduleCodes: [], coreCodes, now });
    let sub = await subscriptions.findSubscription(tx, account.id, { lock: true });
    sub = await subscriptions.refreshState(tx, sub, SYSTEM_ACTOR, now);
    const items = sub ? await subscriptions.liveItems(tx, sub.id) : [];
    return buildEntitlement({ slug: tenantSlug, sub, moduleCodes: items.map((i) => i.moduleCode), coreCodes, now });
  });
}

module.exports = { getEntitlement, buildEntitlement };
