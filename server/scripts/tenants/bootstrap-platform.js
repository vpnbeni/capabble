/* eslint-disable no-console */
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { connectPlatformDB } = require('../../src/config/platformDatabase');
const { getPlatformModels } = require('../../src/tenancy/platformModels');
const { DEFAULT_PLATFORM_ADMIN_LOGIN } = require('../../src/constants/platformAdminAuth');

const bootstrapPlatform = async () => {
  const email = (process.env.PLATFORM_ADMIN_EMAIL || DEFAULT_PLATFORM_ADMIN_LOGIN).trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD || email;

  await connectPlatformDB();

  const { PlatformAdmin } = getPlatformModels();

  const existing = await PlatformAdmin.findOne({ email }).lean();
  if (existing) {
    console.log(`Platform admin already exists for ${email}`);
    return;
  }

  await PlatformAdmin.create({
    email,
    password,
    name: 'Platform Admin',
    isActive: true,
  });

  console.log(`Platform admin created for ${email}`);
};

bootstrapPlatform()
  .then(() => {
    console.log('Platform bootstrap completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Platform bootstrap failed:', error.message);
    process.exit(1);
  });
