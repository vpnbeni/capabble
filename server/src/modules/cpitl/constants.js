const CPITL_PERMISSIONS = Object.freeze({
  VIEW: 'cpitl:view',
  COLLECT: 'cpitl:collect',
  MANAGE_STRUCTURES: 'cpitl:manage_structures',
  MANAGE_ACCOUNTS: 'cpitl:manage_accounts',
  CANCEL_RECEIPT: 'cpitl:cancel_receipt',
  SETTINGS: 'cpitl:settings',
  EXPENSE_LOG: 'cpitl:expense_log',
  EXPENSE_VOID: 'cpitl:expense_void',
  BUDGETS: 'cpitl:budgets',
  PAYROLL: 'cpitl:payroll',
});

const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.values(CPITL_PERMISSIONS),
  data_entry_operator: [CPITL_PERMISSIONS.VIEW, CPITL_PERMISSIONS.COLLECT, CPITL_PERMISSIONS.EXPENSE_LOG],
});

const roleHasPermission = (role, permission) => (ROLE_PERMISSIONS[role] || []).includes(permission);

const FEE_HEAD_CATEGORIES = Object.freeze(['academic', 'admission', 'transport', 'activity', 'examination', 'facility', 'misc']);

const PAYMENT_MODES = Object.freeze(['cash', 'upi', 'cheque', 'dd', 'bank_transfer', 'card']);

// Typical heads used by CBSE/State board schools in India.
const DEFAULT_FEE_HEADS = Object.freeze([
  { name: 'Registration Fee', code: 'REG', category: 'admission', frequency: 'one_time', sortOrder: 1 },
  { name: 'Admission Fee', code: 'ADM', category: 'admission', frequency: 'one_time', sortOrder: 2 },
  { name: 'Caution Money', code: 'CAUTION', category: 'admission', frequency: 'one_time', isRefundable: true, sortOrder: 3 },
  { name: 'Tuition Fee', code: 'TUITION', category: 'academic', frequency: 'monthly', sortOrder: 10 },
  { name: 'Annual Charges', code: 'ANNUAL', category: 'academic', frequency: 'annual', sortOrder: 11 },
  { name: 'Development Fee', code: 'DEV', category: 'facility', frequency: 'annual', sortOrder: 12 },
  { name: 'Examination Fee', code: 'EXAM', category: 'examination', frequency: 'half_yearly', sortOrder: 20 },
  { name: 'Computer / Lab Fee', code: 'LAB', category: 'facility', frequency: 'quarterly', sortOrder: 21 },
  { name: 'Smart Class Fee', code: 'SMART', category: 'facility', frequency: 'quarterly', sortOrder: 22 },
  { name: 'Sports & Activity Fee', code: 'ACTIVITY', category: 'activity', frequency: 'annual', sortOrder: 30 },
  { name: 'Transport Fee', code: 'TRANSPORT', category: 'transport', frequency: 'monthly', isOptional: true, sortOrder: 40 },
]);

const DEFAULT_CONCESSION_PRESETS = Object.freeze([
  { name: 'Sibling', type: 'percent', value: 10, feeHeadCode: 'TUITION' },
  { name: 'Staff Ward', type: 'percent', value: 50, feeHeadCode: 'TUITION' },
  { name: 'RTE / EWS', type: 'percent', value: 100, feeHeadCode: '' },
  { name: 'Merit Scholarship', type: 'percent', value: 25, feeHeadCode: 'TUITION' },
]);

const EXPENSE_KINDS = Object.freeze(['salary', 'fuel', 'electricity', 'operating', 'infra']);

// Icon keys map to the curated lucide set in client/src/components/cpitl/IconPicker.tsx.
const DEFAULT_EXPENSE_CATEGORIES = Object.freeze([
  { name: 'Stationery', icon: 'pencil', color: '#6366f1' },
  { name: 'Printing', icon: 'printer', color: '#0ea5e9' },
  { name: 'Housekeeping', icon: 'spray-can', color: '#14b8a6' },
  { name: 'Repairs & Maintenance', icon: 'wrench', color: '#f59e0b' },
  { name: 'Internet & Phone', icon: 'wifi', color: '#8b5cf6' },
  { name: 'Water', icon: 'droplets', color: '#06b6d4' },
  { name: 'Events', icon: 'party-popper', color: '#ec4899' },
  { name: 'Travel', icon: 'plane', color: '#3b82f6' },
  { name: 'Bank Charges', icon: 'landmark', color: '#64748b' },
  { name: 'Professional Fees', icon: 'briefcase', color: '#0f766e' },
  { name: 'Marketing', icon: 'megaphone', color: '#f97316' },
  { name: 'Canteen', icon: 'utensils', color: '#84cc16' },
  { name: 'Miscellaneous', icon: 'shapes', color: '#94a3b8' },
]);

const DEFAULT_SALARY_COMPONENTS = Object.freeze([
  { name: 'Basic', code: 'BASIC', type: 'earning', calc: 'fixed', sortOrder: 1 },
  { name: 'Dearness Allowance', code: 'DA', type: 'earning', calc: 'percent_of_basic', defaultValue: 0, sortOrder: 2 },
  { name: 'House Rent Allowance', code: 'HRA', type: 'earning', calc: 'percent_of_basic', defaultValue: 40, sortOrder: 3 },
  { name: 'Conveyance', code: 'CONV', type: 'earning', calc: 'fixed', defaultValue: 1600, sortOrder: 4 },
  { name: 'Special Allowance', code: 'SPECIAL', type: 'earning', calc: 'fixed', defaultValue: 0, sortOrder: 5 },
  { name: 'Loan / Advance Recovery', code: 'LOAN', type: 'deduction', calc: 'fixed', defaultValue: 0, sortOrder: 20 },
]);

module.exports = {
  EXPENSE_KINDS,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_SALARY_COMPONENTS,
  CPITL_PERMISSIONS,
  ROLE_PERMISSIONS,
  roleHasPermission,
  FEE_HEAD_CATEGORIES,
  PAYMENT_MODES,
  DEFAULT_FEE_HEADS,
  DEFAULT_CONCESSION_PRESETS,
};
