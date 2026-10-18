// Billing tests run on PGlite (in-memory Postgres), which needs Node's
// --experimental-vm-modules; under that flag other suites can't load Puppeteer.
// So the two groups run separately: `npm test` (everything else) and `npm run test:billing`.
const vmModules = process.execArgv.includes('--experimental-vm-modules')
  || /--experimental-vm-modules/.test(process.env.NODE_OPTIONS || '');

module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/helpers/',
    ...(vmModules ? [] : ['/src/modules/billing/']),
  ],
  ...(vmModules ? { roots: ['<rootDir>/src/modules/billing'] } : {}),
};
