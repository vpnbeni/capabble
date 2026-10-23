const { getRequestContext } = require('../../tenancy/requestContext');

/**
 * Mongoose plugin that:
 * 1. Adds an `academicSession` field (e.g. "2025-2026") to the schema.
 * 2. Installs pre-hooks on query/save operations so that, when an academic
 *    session is set in the AsyncLocalStorage request context, it is
 *    automatically injected into queries and new documents.
 *
 * This avoids the need to touch every controller.  Controllers can still
 * explicitly set `academicSession` in a query/body and it will be honoured;
 * the auto-injection only kicks in when the field is not already present.
 *
 * Usage:
 *   schema.plugin(academicSessionPlugin);
 *   schema.plugin(academicSessionPlugin, { required: true });
 */
const academicSessionPlugin = (schema, options = {}) => {
  const isRequired = Boolean(options.required);

  // ── 1. Add the field ──────────────────────────────────────────────
  schema.add({
    academicSession: {
      type: String,
      trim: true,
      match: [/^\d{4}-\d{4}$/, 'Academic session must be in YYYY-YYYY format'],
      index: true,
      ...(isRequired ? { required: [true, 'Academic session is required'] } : {}),
    },
  });

  schema.index({ academicSession: 1, createdAt: -1 });

  // ── 2. Auto-inject on queries ─────────────────────────────────────
  const queryHooks = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'countDocuments',
    'estimatedDocumentCount',
    'deleteMany',
    'deleteOne',
    'updateMany',
    'updateOne',
    'replaceOne',
  ];

  for (const method of queryHooks) {
    schema.pre(method, function () {
      const session = getSessionFromContext();
      if (!session) return;

      // Only inject if the query doesn't already constrain academicSession
      const filter = this.getFilter?.() || this.getQuery?.() || {};
      if (filter.academicSession !== undefined) return;

      this.where(sessionFilter(session));
    });
  }

  // ── 3. Auto-inject on save (new documents only) ───────────────────
  schema.pre('save', function (next) {
    if (this.isNew && !this.academicSession) {
      const session = getSessionFromContext();
      if (session) {
        this.academicSession = session;
      } else if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[academicSessionPlugin] Saving new ${this.constructor?.modelName || 'document'} without academicSession — no session in request context`
        );
      }
    }
    next();
  });

  // ── 4. Auto-inject on insertMany ──────────────────────────────────
  schema.pre('insertMany', function (next, docs) {
    const session = getSessionFromContext();
    if (Array.isArray(docs)) {
      for (const doc of docs) {
        if (!doc.academicSession) {
          if (session) {
            doc.academicSession = session;
          } else if (process.env.NODE_ENV === 'development') {
            console.warn(
              '[academicSessionPlugin] insertMany doc missing academicSession — no session in request context'
            );
          }
        }
      }
    }
    next();
  });

  // ── 5. Auto-inject on aggregate ───────────────────────────────────
  schema.pre('aggregate', function () {
    const session = getSessionFromContext();
    if (!session) return;

    const pipeline = this.pipeline();
    // Check if user already has an academicSession $match at the beginning
    const firstStage = pipeline[0];
    if (firstStage?.$match?.academicSession !== undefined) return;

    pipeline.unshift({ $match: sessionFilter(session) });
  });
};

/**
 * Records saved before the academic-session feature have no `academicSession`.
 * They belong to the tenant's first session only (`legacyAcademicSession`, set by
 * the session middleware), so they don't carry over into every later session.
 * When the first session isn't known, they're shown in every session as before.
 */
function sessionFilter(session) {
  const ctx = getRequestContext();
  const legacySession = ctx?.legacyAcademicSession;
  if (legacySession && legacySession !== session) {
    return { academicSession: session };
  }
  return {
    $or: [
      { academicSession: session },
      { academicSession: null },
      { academicSession: { $exists: false } },
    ],
  };
}

/** Read the current academic session from AsyncLocalStorage. */
function getSessionFromContext() {
  const ctx = getRequestContext();
  return ctx?.academicSession || null;
}

module.exports = academicSessionPlugin;
