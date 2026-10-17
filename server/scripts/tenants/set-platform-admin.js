/* eslint-disable no-console */
/**
 * Change a platform admin's login email and/or password.
 *
 * Dry run by default: shows which admin would change and what. Add --apply to write.
 *
 *   npm run platform:admin -- --email new@capabble.cloud                 # dry run
 *   npm run platform:admin -- --email new@capabble.cloud --password --apply
 *   npm run platform:admin -- --current old@x.com --password --apply     # password only
 *
 * --current <login>  admin to change (needed only when there is more than one)
 * --email <login>    new email or username
 * --password         prompt for a new password (hidden, asked twice). Never pass it as an argument.
 * --apply            write the change
 *
 * For non-interactive use, set PLATFORM_ADMIN_NEW_PASSWORD instead of --password's prompt.
 * Uses MONGODB_URI and CENTRAL_DB_NAME from server/.env, so check the database it prints.
 */
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { connectPlatformDB } = require('../../src/config/platformDatabase');
const { getPlatformModels } = require('../../src/tenancy/platformModels');
const { PLATFORM_ADMIN_LOGIN_REGEX } = require('../../src/constants/platformAdminAuth');

const MIN_PASSWORD = 8;

const parseArgs = (argv) => {
  const args = { apply: false, password: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--password') args.password = true;
    else if (arg === '--email') { args.email = argv[i + 1]; i += 1; }
    else if (arg === '--current') { args.current = argv[i + 1]; i += 1; }
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
};

/** Reads a line from the terminal without echoing it. */
const promptHidden = (question) => new Promise((resolve, reject) => {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    reject(new Error('No terminal to prompt for the password. Set PLATFORM_ADMIN_NEW_PASSWORD instead.'));
    return;
  }
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  let value = '';
  const onData = (chunk) => {
    [...chunk].forEach((char) => {
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (char === '\u0003') {
        stdout.write('\n');
        process.exit(130);
      } else if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    });
  };
  stdin.on('data', onData);
});

const readNewPassword = async () => {
  const fromEnv = process.env.PLATFORM_ADMIN_NEW_PASSWORD;
  if (fromEnv) return fromEnv;
  const first = await promptHidden('New password: ');
  const second = await promptHidden('Repeat new password: ');
  if (first !== second) throw new Error('The passwords did not match. Nothing was changed.');
  return first;
};

const describeTarget = () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017';
  let host = uri;
  try {
    host = new URL(uri).host;
  } catch (error) {
    host = uri.replace(/\/\/[^@]*@/, '//***@');
  }
  return `${host} / ${process.env.CENTRAL_DB_NAME || 'capabble_central'}`;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const wantsPassword = args.password || Boolean(process.env.PLATFORM_ADMIN_NEW_PASSWORD);
  if (!args.email && !wantsPassword) {
    throw new Error('Nothing to change. Pass --email <new login> and/or --password.');
  }

  const newEmail = args.email ? String(args.email).trim().toLowerCase() : null;
  if (newEmail && !PLATFORM_ADMIN_LOGIN_REGEX.test(newEmail)) {
    throw new Error(`"${newEmail}" is not a valid email or username.`);
  }

  console.log(`Database: ${describeTarget()}`);
  await connectPlatformDB();
  const { PlatformAdmin } = getPlatformModels();

  let admin;
  if (args.current) {
    admin = await PlatformAdmin.findOne({ email: String(args.current).trim().toLowerCase() }).select('+password');
    if (!admin) throw new Error(`No platform admin with login "${args.current}".`);
  } else {
    const admins = await PlatformAdmin.find({}).select('+password');
    if (admins.length === 0) throw new Error('No platform admin exists. Run npm run bootstrap:platform first.');
    if (admins.length > 1) {
      throw new Error(`There are ${admins.length} platform admins (${admins.map((a) => a.email).join(', ')}). Choose one with --current <login>.`);
    }
    [admin] = admins;
  }

  if (newEmail && newEmail !== admin.email) {
    const taken = await PlatformAdmin.exists({ email: newEmail, _id: { $ne: admin._id } });
    if (taken) throw new Error(`Another platform admin already uses "${newEmail}".`);
  }

  console.log(`Admin:    ${admin.email}${admin.isActive ? '' : ' (inactive)'}`);
  if (newEmail) console.log(`Email:    ${admin.email} -> ${newEmail}`);
  if (wantsPassword) console.log('Password: will be replaced');

  if (!args.apply) {
    console.log('\nDry run. Nothing was changed. Add --apply to save.');
    return;
  }

  if (wantsPassword) {
    const password = await readNewPassword();
    if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters. Nothing was changed.`);
    admin.password = password; // hashed by the model's pre-save hook
  }
  if (newEmail) admin.email = newEmail;
  await admin.save();

  console.log(`\nSaved. Sign in to the admin portal as ${admin.email}.`);
  console.log('Sessions that are already signed in stay valid until they expire (PLATFORM_JWT_EXPIRE).');
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
