/* eslint-disable no-console */
/**
 * Workspace archive and lifecycle jobs from the command line.
 *
 *   npm run workspace:archive -- --slug=my-school        # build an archive now and email the admin
 *   npm run workspace:lifecycle                          # run the daily workspace job now
 *   npm run workspace:lifecycle -- --now=2027-02-01      # …as if it were that date (testing only)
 *
 * --now needs WORKSPACE_CLOCK_OVERRIDE_ALLOWED=true, which must never be set in production.
 * The job never deletes anything; it opens purge requests that a platform admin approves in the
 * admin portal (Workspace data).
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { connectPlatformDB, getPlatformConnection, getCentralDbName } = require('../../src/config/platformDatabase');
const { getPlatformModels } = require('../../src/tenancy/platformModels');
const config = require('../../src/modules/dataLifecycle/config');
const { runLifecycle } = require('../../src/modules/dataLifecycle/lifecycleJob');
const { requestArchive } = require('../../src/modules/dataLifecycle/archiveService');

const [command, ...rest] = process.argv.slice(2);
const value = (name) => {
  const found = rest.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3).trim() : '';
};

const run = async () => {
  await connectPlatformDB();
  console.log(`Central database: ${getCentralDbName()}`);

  if (command === 'archive') {
    const slug = value('slug').toLowerCase();
    const tenant = await getPlatformModels().Tenant.findOne({ slug }).lean();
    if (!tenant) throw new Error(`No workspace ${slug}.`);
    const { archive } = await requestArchive({
      tenantId: tenant._id,
      slug,
      reason: 'on_demand',
      requestedBy: { id: '', email: tenant.adminEmail, name: '' },
      background: false
    });
    console.log(`Archive ${archive._id}: ${archive.status} ${archive.key} (${archive.bytes} bytes, `
      + `${archive.documentCount} records, ${archive.fileCount} files, files ${archive.filesMode})`);
    return;
  }

  if (command === 'lifecycle') {
    let now = new Date();
    if (value('now')) {
      if (!config.clockOverrideAllowed) {
        throw new Error('--now needs WORKSPACE_CLOCK_OVERRIDE_ALLOWED=true (never in production).');
      }
      now = new Date(value('now'));
      if (Number.isNaN(now.getTime())) throw new Error(`Not a date: ${value('now')}`);
      console.log(`Pretending it is ${now.toISOString()}`);
    }
    console.log(JSON.stringify(await runLifecycle({ now }), null, 2));
    return;
  }

  console.log('Usage: node scripts/backups/workspace.js archive --slug=<slug> | lifecycle [--now=<date>]');
  process.exitCode = 1;
};

run()
  .catch((error) => {
    console.error(`[workspace] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPlatformConnection().close();
    } catch {
      // not connected
    }
    process.exit(process.exitCode || 0);
  });
