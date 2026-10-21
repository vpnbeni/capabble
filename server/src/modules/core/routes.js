/**
 * Core module route registrar.
 *
 * Mounts all routes that belong to the shared kernel (auth, teachers,
 * subjects, rooms, sessions, onboarding, support, dashboard, billing, export).
 *
 * These routes are available to every tenant regardless of which purchasable
 * modules are active.
 */
const { requireTenantFeature } = require('../../middleware/tenantFeatureAccess');

const authRoutes = require('../../routes/authRoutes');
const teacherRoutes = require('../../routes/teacherRoutes');
const subjectRoutes = require('../../routes/subjectRoutes');
const roomRoutes = require('../../routes/roomRoutes');
const sessionRoutes = require('../../routes/sessionRoutes');
const onboardingRoutes = require('../../routes/onboardingRoutes');
const supportRoutes = require('../../routes/supportRoutes');
const dashboardRoutes = require('../../routes/dashboardRoutes');
const billingRoutes = require('../../routes/billingRoutes');
const exportRoutes = require('../../routes/exportRoutes');
const userRoutes = require('../../routes/userRoutes');
const roleRoutes = require('../../routes/roleRoutes');
const portalRoutes = require('../../routes/portalRoutes');
const idCardRoutes = require('../../routes/idCardRoutes');
const notificationRoutes = require('../../routes/notificationRoutes');
const accountRoutes = require('../../routes/accountRoutes');

const mountRoutes = (router) => {
  router.use('/auth', authRoutes);
  router.use('/users', userRoutes);
  router.use('/account', accountRoutes);
  router.use('/roles', roleRoutes);
  router.use('/portal', portalRoutes);
  router.use('/notifications', notificationRoutes);
  router.use('/teachers', requireTenantFeature('exam_functionaries'), teacherRoutes);
  router.use('/subjects', requireTenantFeature('subjects'), subjectRoutes);
  router.use('/rooms', requireTenantFeature('examrooms'), roomRoutes);
  router.use('/sessions', sessionRoutes);
  router.use('/onboarding', onboardingRoutes);
  router.use('/support', requireTenantFeature('help_support'), supportRoutes);
  router.use('/dashboard', requireTenantFeature('dashboard'), dashboardRoutes);
  router.use('/billing', requireTenantFeature('billing'), billingRoutes);
  router.use('/export', exportRoutes);
  router.use('/id-cards', requireTenantFeature('stdnt_id_cards'), idCardRoutes);
};

module.exports = { mountRoutes };
