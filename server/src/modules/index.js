/**
 * Module registry.
 *
 * Central entry point for all tenant-scoped modules. Each module exports a
 * `mountRoutes(router)` function that registers its routes on the shared
 * tenant-scoped Express router.
 *
 * To add a new module:
 * 1. Create a directory under modules/ with index.js, routes.js, models.js, listeners.js
 * 2. Add it to the `modules` array below
 * 3. Add its model keys to constants/moduleModelKeys.js
 * 4. Add its features to constants/tenantFeatureCatalog.json
 */
const coreModule = require('./core');
const cntrModule = require('./cntr');
const timetableModule = require('./timetable');
const attndModule = require('./attnd');
const almniModule = require('./almni');
const trnstModule = require('./trnst');
const acdmcModule = require('./acdmc');
const actvtModule = require('./actvt');
const mdclModule = require('./mdcl');
const asetsModule = require('./asets');

const modules = [coreModule, cntrModule, timetableModule, attndModule, almniModule, trnstModule, acdmcModule, actvtModule, mdclModule, asetsModule];

/**
 * Mount all tenant-scoped module routes on the given Express router.
 * Called from app.js after applying tenantContextMiddleware, billingEntitlementMiddleware,
 * and academicSessionMiddleware.
 *
 * @param {import('express').Router} tenantScopedRouter
 */
const mountAll = (tenantScopedRouter) => {
  modules.forEach((mod) => mod.mountRoutes(tenantScopedRouter));
};

module.exports = { mountAll, modules };
