/**
 * Permission catalog — the single list of permissions, API route mappings and
 * built-in role templates. Source of truth is
 * packages/shared/src/permissionCatalog.json (copied here by `npm run sync:shared`).
 *
 * Permission keys are `<module>.<resource>.<action>` (e.g. `stdnt.students.read`).
 */
const catalog = require('../constants/permissionCatalog.json');

const WILDCARD = '*';
const SCOPES = Object.freeze({ ALL: 'all', ASSIGNED: 'assigned' });
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const resources = new Map(catalog.resources.map((resource) => [resource.key, resource]));

const permissionIndex = new Map();
catalog.resources.forEach((resource) => {
  resource.actions.forEach((action) => {
    permissionIndex.set(`${resource.key}.${action}`, {
      key: `${resource.key}.${action}`,
      resource: resource.key,
      action,
      module: resource.module,
      scopable: Boolean(resource.scopable)
    });
  });
});

const isKnownPermission = (key) => key === WILDCARD || permissionIndex.has(key);
const isScopable = (key) => Boolean(permissionIndex.get(key)?.scopable);

/** Normalise a template/custom permission entry to `{ key, scope }`. */
const normalizeGrant = (entry) => {
  const raw = typeof entry === 'string' ? { key: entry } : entry || {};
  const key = String(raw.key || '').trim();
  if (!isKnownPermission(key)) return null;
  const scope = raw.scope === SCOPES.ASSIGNED && isScopable(key) ? SCOPES.ASSIGNED : SCOPES.ALL;
  return { key, scope };
};

const normalizeGrants = (entries = []) => {
  const byKey = new Map();
  entries.forEach((entry) => {
    const grant = normalizeGrant(entry);
    if (!grant) return;
    const existing = byKey.get(grant.key);
    // When two entries collide, the broader scope wins.
    if (!existing || existing.scope === SCOPES.ASSIGNED) byKey.set(grant.key, grant);
  });
  return [...byKey.values()];
};

const roleTemplates = new Map(
  catalog.roleTemplates.map((template) => [
    template.key,
    {
      key: template.key,
      name: template.name,
      description: template.description || '',
      locked: Boolean(template.locked),
      designations: template.designations || [],
      permissions: normalizeGrants(template.permissions),
      isSystem: true
    }
  ])
);

const ADMINISTRATOR_ROLE = 'administrator';
const LEGACY_ROLE_TEMPLATE = Object.freeze({
  admin: [ADMINISTRATOR_ROLE],
  data_entry_operator: ['office_staff']
});

/** Suggest a default role for a staff member from their free-text designation. */
const suggestRoleForDesignation = (designation = '') => {
  const text = String(designation).toLowerCase();
  if (!text) return null;
  const match = [...roleTemplates.values()]
    .find((template) => template.designations.some((word) => text.includes(word)));
  return match ? match.key : null;
};

// ---------------------------------------------------------------------------
// Route rules: map an API path under /api to the permission it requires.
// ---------------------------------------------------------------------------

const compiledRoutes = catalog.routes.map((rule, index) => ({
  ...rule,
  index,
  methods: rule.methods ? new Set(rule.methods.map((m) => m.toUpperCase())) : null,
  pathPattern: rule.path ? new RegExp(rule.path) : null
}));

const actionForMethod = (resource, method, rule) => {
  if (READ_METHODS.has(method)) {
    return resource.actions.includes('read') ? 'read' : resource.actions[0];
  }
  if (rule.writeAction) return rule.writeAction;
  if (method === 'DELETE' && resource.actions.includes('delete')) return 'delete';
  return 'write';
};

const ruleMatches = (rule, method, path) => {
  if (path !== rule.prefix && !path.startsWith(`${rule.prefix}/`)) return false;
  const rest = path.slice(rule.prefix.length) || '/';
  if (rule.pathPattern && !rule.pathPattern.test(rest)) return false;
  return !rule.methods || rule.methods.has(method);
};

/**
 * Resolve the requirement for an API request.
 * @returns {null | { staff: true } | { anyOf: string[] } | { anyOfResource: string }}
 *   null means no rule matched (deny by default).
 */
const resolveRouteRequirement = (method, path) => {
  const upperMethod = String(method || 'GET').toUpperCase();
  const rule = compiledRoutes.find((candidate) => ruleMatches(candidate, upperMethod, path));
  if (!rule) return null;

  if (rule.staff) return { staff: true, rule: rule.index };
  if (rule.permission) {
    const keys = Array.isArray(rule.permission) ? rule.permission : [rule.permission];
    return { anyOf: keys, rule: rule.index };
  }

  const resource = resources.get(rule.resource);
  if (!resource) return null;
  if (resource.enforce === 'route') {
    // Fine-grained checks live on each route; the gate only requires that the
    // user holds at least one action on the resource.
    return { anyOfResource: resource.key, rule: rule.index };
  }
  return { anyOf: [`${resource.key}.${actionForMethod(resource, upperMethod, rule)}`], rule: rule.index };
};

/** Permission required to open a client feature (sidebar page). */
const permissionForFeature = (featureKey) => catalog.features[featureKey];

module.exports = {
  catalog,
  WILDCARD,
  SCOPES,
  ADMINISTRATOR_ROLE,
  LEGACY_ROLE_TEMPLATE,
  resources,
  permissionIndex,
  roleTemplates,
  isKnownPermission,
  isScopable,
  normalizeGrants,
  suggestRoleForDesignation,
  resolveRouteRequirement,
  permissionForFeature
};
