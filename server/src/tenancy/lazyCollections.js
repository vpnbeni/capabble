/**
 * School (tenant) databases create collections only when something is written.
 *
 * Mongoose normally creates every model's collection and indexes as soon as the
 * model is loaded. Each school loads ~120 models, so every school got 100+ empty
 * collections, and a shared MongoDB Atlas tier (500 collections per cluster)
 * filled up after a handful of schools.
 *
 * Instead:
 *  - tenant connections have `autoCreate` and `autoIndex` off;
 *  - a model's indexes (which also creates its collection) are built just
 *    before its first write — save, insertMany, bulkWrite or an upsert;
 *  - collections that already exist get their indexes synced in the background,
 *    so index changes in code still reach schools that use the model.
 */

const INDEX_STATE = Symbol('capabbleIndexesReady');
const PLUGIN_APPLIED = Symbol('capabbleLazyCollections');
// Re-check indexes at most this often per model. Covers a collection that was dropped
// (e.g. by drop-empty-collections) while this server was running; when the indexes
// already exist the check is a single cheap round trip.
const RECHECK_MS = 10 * 60 * 1000;

/** Builds the model's indexes before a write; once per model per RECHECK_MS. */
const ensureIndexes = (Model) => {
  if (!Model || typeof Model.createIndexes !== 'function') return Promise.resolve();
  const state = Model[INDEX_STATE];
  if (state && Date.now() - state.at < RECHECK_MS) return state.promise;
  const promise = Model.createIndexes().catch((error) => {
    // Let the next write try again; don't block the write itself.
    Model[INDEX_STATE] = null;
    console.warn(`[lazy-collections] indexes for ${Model.modelName} on ${Model.db?.name}: ${error.message}`);
  });
  Model[INDEX_STATE] = { promise, at: Date.now() };
  return promise;
};

const isUpsert = (query) => Boolean(query.getOptions?.().upsert);

/** Schema plugin: create indexes (and so the collection) right before the first write. */
const lazyCollectionsPlugin = (schema) => {
  schema.pre('save', async function preSave() {
    await ensureIndexes(this.constructor);
  });
  schema.pre('insertMany', async function preInsertMany() {
    await ensureIndexes(this);
  });
  schema.pre('bulkWrite', async function preBulkWrite() {
    await ensureIndexes(this);
  });
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'], async function preUpsert() {
    if (isUpsert(this)) await ensureIndexes(this.model);
  });
};

/** Apply the plugin to a schema once, before it is compiled on any tenant connection. */
const applyLazyCollections = (schema) => {
  if (!schema || schema[PLUGIN_APPLIED]) return;
  schema.plugin(lazyCollectionsPlugin);
  schema[PLUGIN_APPLIED] = true;
};

/** Turn off automatic collection and index creation on a tenant connection. */
const disableAutoCreate = (connection) => {
  // Write the per-connection config directly: on a useDb() child, connection.set() falls through
  // to the options object it shares with the platform connection when the key isn't already set.
  connection.config = { ...(connection.config || {}), autoCreate: false, autoIndex: false };
};

/**
 * Background: for models whose collection already exists in this school's database,
 * make sure the indexes declared in code exist. Never creates new collections.
 */
const syncExistingIndexes = async (connection, models) => {
  const list = Object.values(models || {});
  if (!list.length) return;
  try {
    await connection.asPromise?.();
    const existing = new Set(
      (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name)
    );
    // Build indexes directly instead of through ensureIndexes(): that memo is reserved for the
    // first write, so a collection dropped later (e.g. by drop-empty-collections) still gets
    // its indexes rebuilt when it is next written to.
    await Promise.all(list
      .filter((Model) => existing.has(Model.collection?.collectionName))
      .map((Model) => Model.createIndexes().catch((error) => {
        console.warn(`[lazy-collections] indexes for ${Model.modelName} on ${connection.name}: ${error.message}`);
      })));
  } catch (error) {
    console.warn(`[lazy-collections] index sync for ${connection.name}: ${error.message}`);
  }
};

module.exports = {
  applyLazyCollections,
  disableAutoCreate,
  ensureIndexes,
  lazyCollectionsPlugin,
  syncExistingIndexes,
};
