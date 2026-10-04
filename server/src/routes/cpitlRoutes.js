const express = require('express');
const { protect } = require('../middleware/auth');
const { requireTenantFeature, requireAnyTenantFeature } = require('../middleware/tenantFeatureAccess');
const { requireCpitlPermission, CPITL_PERMISSIONS: P } = require('../middleware/cpitlPermissions');
const fee = require('../controllers/cpitl/feeController');
const collection = require('../controllers/cpitl/collectionController');
const dashboard = require('../controllers/cpitl/dashboardController');
const expense = require('../controllers/cpitl/expenseController');
const fuel = require('../controllers/cpitl/fuelController');
const facility = require('../controllers/cpitl/facilityController');
const payroll = require('../controllers/cpitl/payrollController');

const router = express.Router();
router.use(protect);
router.use(requireAnyTenantFeature('cpitl_dashboard', 'cpitl_fees', 'cpitl_expenses', 'cpitl_payroll'));
router.use(requireCpitlPermission(P.VIEW));

const fees = requireTenantFeature('cpitl_fees');
const expenses = requireTenantFeature('cpitl_expenses');
const payrollFeature = requireTenantFeature('cpitl_payroll');
const can = requireCpitlPermission;

router.get('/meta', fee.getMeta);
router.get('/classes', fee.listClasses);
router.get('/dashboard', requireTenantFeature('cpitl_dashboard'), dashboard.getDashboard);

// Fee heads
router.get('/fee-heads', fees, fee.listFeeHeads);
router.post('/fee-heads', fees, can(P.MANAGE_STRUCTURES), fee.createFeeHead);
router.put('/fee-heads/:id', fees, can(P.MANAGE_STRUCTURES), fee.updateFeeHead);
router.delete('/fee-heads/:id', fees, can(P.MANAGE_STRUCTURES), fee.deleteFeeHead);

// Fee structures
router.get('/fee-structures', fees, fee.listStructures);
router.post('/fee-structures', fees, can(P.MANAGE_STRUCTURES), fee.createStructure);
router.get('/fee-structures/:id', fees, fee.getStructure);
router.put('/fee-structures/:id', fees, can(P.MANAGE_STRUCTURES), fee.updateStructure);
router.post('/fee-structures/:id/duplicate', fees, can(P.MANAGE_STRUCTURES), fee.duplicateStructure);
router.post('/fee-structures/:id/archive', fees, can(P.MANAGE_STRUCTURES), fee.archiveStructure);
router.post('/fee-structures/:id/assign', fees, can(P.MANAGE_STRUCTURES), fee.assignStructureHandler);
router.post('/fee-structures/:id/reapply', fees, can(P.MANAGE_STRUCTURES), fee.reapplyStructure);
router.get('/fee-structures/:id/revisions', fees, fee.listRevisions);
router.get('/fee-structures/:id/revisions/:version', fees, fee.getRevision);

// Students, collection, receipts, slips
router.get('/students', fees, collection.searchStudents);
router.get('/students/:studentId/account', fees, collection.getStudentAccount);
router.put('/students/:studentId/account', fees, can(P.MANAGE_ACCOUNTS), collection.updateStudentAccount);
router.post('/students/:studentId/payments', fees, can(P.COLLECT), collection.createPayment);
router.get('/students/:studentId/fee-slip.pdf', fees, collection.studentFeeSlipPdf);
router.post('/demands/:demandId/waive', fees, can(P.MANAGE_ACCOUNTS), collection.waiveDemand);
router.get('/payments', fees, collection.listPayments);
router.get('/payments/:id/receipt.pdf', fees, collection.receiptPdf);
router.post('/payments/:id/cancel', fees, can(P.CANCEL_RECEIPT), collection.cancelPaymentHandler);
router.post('/payments/:id/cheque-status', fees, can(P.MANAGE_ACCOUNTS), collection.updateChequeStatus);
router.get('/fee-slips.pdf', fees, collection.bulkFeeSlipsPdf);

// Settings
router.get('/settings', fees, fee.getSettingsHandler);
router.put('/settings', fees, can(P.SETTINGS), fee.updateSettings);

// ── Phase 2: expenses ──────────────────────────────────────────────
router.post('/attachments', requireAnyTenantFeature('cpitl_expenses', 'cpitl_payroll'), can(P.EXPENSE_LOG), expense.uploadAttachment);
router.get('/locations', expenses, facility.listLocations);

router.get('/expense-categories', expenses, expense.listCategories);
router.post('/expense-categories', expenses, can(P.EXPENSE_LOG), expense.createCategory);
router.put('/expense-categories/:id', expenses, can(P.EXPENSE_LOG), expense.updateCategory);
router.delete('/expense-categories/:id', expenses, can(P.EXPENSE_VOID), expense.archiveCategory);

router.get('/expenses/summary', requireAnyTenantFeature('cpitl_expenses', 'cpitl_dashboard'), expense.getSummary);
router.get('/expenses', expenses, expense.listExpenses);
router.post('/expenses', expenses, can(P.EXPENSE_LOG), expense.createExpense);
router.put('/expenses/:id', expenses, can(P.EXPENSE_LOG), expense.updateExpense);
router.post('/expenses/:id/void', expenses, can(P.EXPENSE_VOID), expense.voidExpense);

router.get('/budgets', expenses, expense.getBudgets);
router.put('/budgets', expenses, can(P.BUDGETS), expense.saveBudgets);
router.post('/budgets/copy-from-actuals', expenses, can(P.BUDGETS), expense.copyBudgetsFromActuals);

router.get('/fuel/vehicles', expenses, fuel.listVehicles);
router.get('/fuel/analytics', expenses, fuel.getAnalytics);
router.get('/fuel/projection.xlsx', expenses, fuel.projectionXlsx);
router.get('/fuel-logs', expenses, fuel.listLogs);
router.post('/fuel-logs', expenses, can(P.EXPENSE_LOG), fuel.createLog);
router.put('/fuel-logs/:id', expenses, can(P.EXPENSE_LOG), fuel.updateLog);
router.post('/fuel-logs/:id/remove', expenses, can(P.EXPENSE_VOID), fuel.removeLog);

router.get('/electricity/connections', expenses, facility.listConnections);
router.post('/electricity/connections', expenses, can(P.EXPENSE_LOG), facility.saveConnection);
router.put('/electricity/connections/:id', expenses, can(P.EXPENSE_LOG), facility.saveConnection);
router.delete('/electricity/connections/:id', expenses, can(P.EXPENSE_VOID), facility.archiveConnection);
router.get('/electricity/analytics', expenses, facility.electricityAnalytics);
router.get('/electricity/bills', expenses, facility.listBills);
router.post('/electricity/bills', expenses, can(P.EXPENSE_LOG), facility.createBill);
router.put('/electricity/bills/:id', expenses, can(P.EXPENSE_LOG), facility.updateBill);
router.post('/electricity/bills/:id/pay', expenses, can(P.EXPENSE_LOG), facility.payBill);
router.post('/electricity/bills/:id/remove', expenses, can(P.EXPENSE_VOID), facility.removeBill);

router.get('/infra/projects', expenses, facility.listProjects);
router.post('/infra/projects', expenses, can(P.EXPENSE_LOG), facility.saveProject);
router.get('/infra/projects/:id', expenses, facility.getProject);
router.put('/infra/projects/:id', expenses, can(P.EXPENSE_LOG), facility.saveProject);
router.post('/infra/projects/:id/payments', expenses, can(P.EXPENSE_LOG), facility.addProjectPayment);

// ── Phase 2: salary & payroll ──────────────────────────────────────
router.get('/salary/summary/:teacherId', payrollFeature, can(P.PAYROLL), payroll.getSalarySummary);
router.get('/salary/components', payrollFeature, payroll.listComponents);
router.post('/salary/components', payrollFeature, can(P.PAYROLL), payroll.saveComponent);
router.put('/salary/components/:id', payrollFeature, can(P.PAYROLL), payroll.saveComponent);
router.delete('/salary/components/:id', payrollFeature, can(P.PAYROLL), payroll.archiveComponent);
router.get('/salary/settings', payrollFeature, payroll.getPayrollSettings);
router.put('/salary/settings', payrollFeature, can(P.PAYROLL), payroll.updatePayrollSettings);
router.post('/salary/preview', payrollFeature, payroll.previewSalary);
router.get('/salary/staff', payrollFeature, can(P.PAYROLL), payroll.listStaffSalaries);
router.get('/salary/staff/:teacherId', payrollFeature, can(P.PAYROLL), payroll.getStaffSalary);
router.put('/salary/staff/:teacherId', payrollFeature, can(P.PAYROLL), payroll.saveStaffSalary);

router.get('/payroll/runs', payrollFeature, can(P.PAYROLL), payroll.listRuns);
router.post('/payroll/runs', payrollFeature, can(P.PAYROLL), payroll.createRun);
router.get('/payroll/runs/:month', payrollFeature, can(P.PAYROLL), payroll.getRun);
router.put('/payroll/runs/:month', payrollFeature, can(P.PAYROLL), payroll.updateRun);
router.delete('/payroll/runs/:month', payrollFeature, can(P.PAYROLL), payroll.deleteRun);
router.post('/payroll/runs/:month/finalize', payrollFeature, can(P.PAYROLL), payroll.finalizeRun);
router.post('/payroll/runs/:month/pay', payrollFeature, can(P.PAYROLL), payroll.payRun);
router.post('/payroll/runs/:month/reopen', payrollFeature, can(P.PAYROLL), payroll.reopenRun);
router.get('/payroll/runs/:month/payslips.pdf', payrollFeature, can(P.PAYROLL), payroll.payslipsPdf);
router.get('/payroll/runs/:month/bank-sheet.xlsx', payrollFeature, can(P.PAYROLL), payroll.bankSheetXlsx);

module.exports = router;
