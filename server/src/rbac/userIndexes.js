/**
 * One-time index repair for a tenant's `users` collection, run lazily the first
 * time a tenant database is used by this process (and by the RBAC migration).
 *
 * - `refreshTokens.createdAt_1` was a TTL index (from `expires` on an array
 *   field). MongoDB applies TTL to the whole document, so it deleted users 30
 *   days after their first stored refresh token. It must not exist.
 * - `email_1` was a plain unique index; students may now have no email, so it is
 *   replaced by the partial `email_unique_present` index declared on the schema.
 */
const repairedDatabases = new Map();

const LEGACY_INDEXES = ['refreshTokens.createdAt_1', 'email_1'];

const repairUserIndexes = async (UserModel) => {
  const { collection } = UserModel;
  const indexes = await collection.indexes();
  const names = new Set(indexes.map((index) => index.name));

  const dropped = [];
  await Promise.all(LEGACY_INDEXES.filter((name) => names.has(name)).map(async (name) => {
    await collection.dropIndex(name);
    dropped.push(name);
  }));

  // Create the schema's current indexes (partial unique email/username, etc.).
  await UserModel.createIndexes();
  return dropped;
};

/** Fire-and-forget per database; failures are logged and retried next process start. */
const ensureUserIndexes = (UserModel) => {
  const dbName = UserModel?.db?.name;
  if (!dbName || repairedDatabases.has(dbName)) return repairedDatabases.get(dbName) || Promise.resolve([]);

  const task = repairUserIndexes(UserModel)
    .then((dropped) => {
      if (dropped.length) console.info(`[user-indexes] ${dbName}: removed legacy indexes ${dropped.join(', ')}`);
      return dropped;
    })
    .catch((error) => {
      repairedDatabases.delete(dbName);
      console.error(`[user-indexes] ${dbName}: repair failed: ${error.message}`);
      return [];
    });
  repairedDatabases.set(dbName, task);
  return task;
};

module.exports = { ensureUserIndexes, repairUserIndexes, LEGACY_INDEXES };
