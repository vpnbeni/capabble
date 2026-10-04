const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const academicSessionPlugin = require('./plugins/academicSessionPlugin');
const { FEE_FREQUENCIES } = require('../modules/cpitl/feeSchedule');
const { FEE_HEAD_CATEGORIES, PAYMENT_MODES, EXPENSE_KINDS } = require('../modules/cpitl/constants');

const { ObjectId } = mongoose.Schema.Types;

const auditUserSchema = {
  userId: { type: ObjectId, ref: 'User', default: null },
  name: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
};

const attachmentSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  url: { type: String, trim: true, default: '' },
  mimeType: { type: String, trim: true, default: '' },
  size: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const withMeta = (definition, options = {}) => new mongoose.Schema({
  ...definition,
  isActive: { type: Boolean, default: true },
  createdBy: auditUserSchema,
  updatedBy: auditUserSchema,
}, { timestamps: true, ...options });

const concessionRuleSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  feeHead: { type: ObjectId, ref: 'FeeHead', default: null }, // null = all heads
  type: { type: String, enum: ['percent', 'flat'], default: 'percent' },
  value: { type: Number, min: 0, default: 0 },
  reason: { type: String, trim: true, default: '' },
  approvedBy: { type: String, trim: true, default: '' },
}, { _id: true });

const lateFeeSchema = new mongoose.Schema({
  type: { type: String, enum: ['none', 'flat', 'per_day'], default: 'none' },
  amount: { type: Number, min: 0, default: 0 },
  graceDays: { type: Number, min: 0, default: 0 },
  cap: { type: Number, min: 0, default: 0 },
}, { _id: false });

const installmentPlanSchema = new mongoose.Schema({
  dueDay: { type: Number, min: 1, max: 28, default: 10 },
  oneTimeMonth: { type: Number, min: 1, max: 12, default: 4 },
  annualMonth: { type: Number, min: 1, max: 12, default: 4 },
  halfYearlyMonths: { type: [Number], default: [4, 10] },
  quarterlyMonths: { type: [Number], default: [4, 7, 10, 1] },
}, { _id: false });

// ── Fee heads ───────────────────────────────────────────────────────
const feeHeadSchema = withMeta({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  category: { type: String, enum: FEE_HEAD_CATEGORIES, default: 'academic' },
  frequency: { type: String, enum: FEE_FREQUENCIES, default: 'monthly' },
  isRefundable: { type: Boolean, default: false },
  isOptional: { type: Boolean, default: false },
  description: { type: String, trim: true, default: '' },
  sortOrder: { type: Number, default: 0 },
});
feeHeadSchema.plugin(academicSessionPlugin);
feeHeadSchema.index({ academicSession: 1, code: 1 }, { unique: true });

// ── Fee structures ──────────────────────────────────────────────────
const structureComponentSchema = new mongoose.Schema({
  feeHead: { type: ObjectId, ref: 'FeeHead', required: true },
  name: { type: String, trim: true, default: '' },
  code: { type: String, trim: true, default: '' },
  amount: { type: Number, min: 0, required: true },
  frequency: { type: String, enum: FEE_FREQUENCIES, required: true },
  isOptional: { type: Boolean, default: false },
}, { _id: false });

const feeStructureSchema = withMeta({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  applicableClasses: [{ type: String, trim: true }],
  components: { type: [structureComponentSchema], default: [] },
  installmentPlan: { type: installmentPlanSchema, default: () => ({}) },
  lateFee: { type: lateFeeSchema, default: () => ({}) },
  status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
  version: { type: Number, default: 1 },
});
feeStructureSchema.plugin(academicSessionPlugin);
feeStructureSchema.index({ status: 1, name: 1 });

const feeStructureRevisionSchema = new mongoose.Schema({
  structureId: { type: ObjectId, ref: 'FeeStructure', required: true, index: true },
  version: { type: Number, required: true },
  changeNote: { type: String, trim: true, default: '' },
  changedBy: auditUserSchema,
  snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  diff: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
feeStructureRevisionSchema.plugin(academicSessionPlugin);
feeStructureRevisionSchema.index({ structureId: 1, version: -1 });

// ── Student accounts, demands and payments ──────────────────────────
const studentFeeAccountSchema = withMeta({
  student: { type: ObjectId, ref: 'Student', required: true },
  studentSnapshot: {
    name: { type: String, trim: true, default: '' },
    rollNumber: { type: String, trim: true, default: '' },
    class: { type: String, trim: true, default: '' },
    section: { type: String, trim: true, default: '' },
    fatherName: { type: String, trim: true, default: '' },
    guardianPhone: { type: String, trim: true, default: '' },
  },
  structureId: { type: ObjectId, ref: 'FeeStructure', default: null },
  structureVersion: { type: Number, default: 0 },
  optedOptionalHeads: [{ type: ObjectId, ref: 'FeeHead' }],
  concessions: { type: [concessionRuleSchema], default: [] },
  openingBalance: { type: Number, default: 0 },
  totals: {
    gross: { type: Number, default: 0 },
    concession: { type: Number, default: 0 },
    demanded: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
  },
});
studentFeeAccountSchema.plugin(academicSessionPlugin);
studentFeeAccountSchema.index({ academicSession: 1, student: 1 }, { unique: true });
studentFeeAccountSchema.index({ 'studentSnapshot.class': 1, 'studentSnapshot.section': 1 });

const demandLineSchema = new mongoose.Schema({
  feeHead: { type: ObjectId, ref: 'FeeHead', default: null },
  name: { type: String, trim: true, default: '' },
  code: { type: String, trim: true, default: '' },
  frequency: { type: String, trim: true, default: '' },
  gross: { type: Number, default: 0 },
  concession: { type: Number, default: 0 },
  net: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
}, { _id: false });

const feeDemandSchema = new mongoose.Schema({
  accountId: { type: ObjectId, ref: 'StudentFeeAccount', required: true },
  student: { type: ObjectId, ref: 'Student', required: true },
  class: { type: String, trim: true, default: '' },
  section: { type: String, trim: true, default: '' },
  periodKey: { type: String, required: true, trim: true }, // YYYY-MM or OPENING
  label: { type: String, trim: true, default: '' },
  dueDate: { type: Date, required: true },
  lines: { type: [demandLineSchema], default: [] },
  gross: { type: Number, default: 0 },
  concession: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  lateFeePaid: { type: Number, default: 0 },
  status: { type: String, enum: ['due', 'partial', 'paid', 'waived'], default: 'due' },
}, { timestamps: true });
feeDemandSchema.plugin(academicSessionPlugin);
feeDemandSchema.index({ accountId: 1, periodKey: 1 }, { unique: true });
feeDemandSchema.index({ class: 1, section: 1, dueDate: 1 });
feeDemandSchema.index({ status: 1, dueDate: 1 });

const paymentAllocationSchema = new mongoose.Schema({
  demandId: { type: ObjectId, ref: 'FeeDemand', required: true },
  periodLabel: { type: String, trim: true, default: '' },
  lineIndex: { type: Number, default: 0 },
  feeHead: { type: ObjectId, ref: 'FeeHead', default: null },
  name: { type: String, trim: true, default: '' },
  amount: { type: Number, default: 0 },
}, { _id: false });

const feePaymentSchema = new mongoose.Schema({
  receiptNo: { type: String, required: true, trim: true },
  accountId: { type: ObjectId, ref: 'StudentFeeAccount', required: true, index: true },
  student: { type: ObjectId, ref: 'Student', required: true, index: true },
  studentSnapshot: {
    name: { type: String, trim: true, default: '' },
    rollNumber: { type: String, trim: true, default: '' },
    class: { type: String, trim: true, default: '' },
    section: { type: String, trim: true, default: '' },
    fatherName: { type: String, trim: true, default: '' },
  },
  date: { type: Date, default: Date.now },
  mode: { type: String, enum: PAYMENT_MODES, default: 'cash' },
  reference: { type: String, trim: true, default: '' },
  cheque: {
    number: { type: String, trim: true, default: '' },
    bank: { type: String, trim: true, default: '' },
    date: { type: Date, default: null },
    status: { type: String, enum: ['', 'pending', 'cleared', 'bounced'], default: '' },
  },
  allocations: { type: [paymentAllocationSchema], default: [] },
  feeAmount: { type: Number, default: 0 },
  lateFeeCollected: { type: Number, default: 0 },
  lateFeeAllocations: {
    type: [{ demandId: { type: ObjectId, ref: 'FeeDemand' }, amount: { type: Number, default: 0 } }],
    default: [],
  },
  total: { type: Number, default: 0 },
  amountInWords: { type: String, trim: true, default: '' },
  remarks: { type: String, trim: true, default: '' },
  collectedBy: auditUserSchema,
  status: { type: String, enum: ['valid', 'cancelled'], default: 'valid' },
  cancellation: {
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, default: null },
    by: auditUserSchema,
  },
}, { timestamps: true });
feePaymentSchema.plugin(academicSessionPlugin);
feePaymentSchema.index({ receiptNo: 1 }, { unique: true });
feePaymentSchema.index({ date: -1, status: 1 });

// ── Tenant-wide settings and counters ───────────────────────────────
const capitalSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  receiptPrefix: { type: String, trim: true, default: 'RCPT' },
  gstin: { type: String, trim: true, default: '' },
  pan: { type: String, trim: true, default: '' },
  slipFooterNote: {
    type: String,
    trim: true,
    default: 'Fee once paid is non-refundable except caution money. Please retain this slip for your records.',
  },
  bankDetails: { type: String, trim: true, default: '' },
  defaultDueDay: { type: Number, min: 1, max: 28, default: 10 },
  defaultLateFee: { type: lateFeeSchema, default: () => ({}) },
  payroll: {
    pfRate: { type: Number, default: 12 },
    pfWageCeiling: { type: Number, default: 15000 },
    esiEmployee: { type: Number, default: 0.75 },
    esiEmployer: { type: Number, default: 3.25 },
    esiGrossLimit: { type: Number, default: 21000 },
    ptSlabs: {
      type: [{ min: { type: Number, default: 0 }, max: { type: Number, default: null }, amount: { type: Number, default: 0 } }],
      default: [],
    },
  },
  concessionPresets: {
    type: [{
      name: { type: String, trim: true },
      type: { type: String, enum: ['percent', 'flat'], default: 'percent' },
      value: { type: Number, min: 0, default: 0 },
      feeHeadCode: { type: String, trim: true, default: '' }, // '' = all heads
    }],
    default: [],
  },
  updatedBy: auditUserSchema,
}, { timestamps: true });

const capitalCounterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});


// ── Phase 2: expenses ───────────────────────────────────────────────
const sourceRefSchema = new mongoose.Schema({
  model: { type: String, trim: true, default: '' },
  id: { type: ObjectId, default: null },
}, { _id: false });

const capitalExpenseSchema = new mongoose.Schema({
  kind: { type: String, enum: EXPENSE_KINDS, required: true },
  date: { type: Date, required: true },
  amount: { type: Number, min: 0, required: true },
  mode: { type: String, enum: [...PAYMENT_MODES, ''], default: 'cash' },
  payee: { type: String, trim: true, default: '' },
  reference: { type: String, trim: true, default: '' },
  title: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  categoryId: { type: ObjectId, ref: 'ExpenseCategory', default: null },
  attachments: { type: [attachmentSchema], default: [] },
  sourceRef: { type: sourceRefSchema, default: () => ({}) },
  status: { type: String, enum: ['valid', 'void'], default: 'valid' },
  voidReason: { type: String, trim: true, default: '' },
  voidedAt: { type: Date, default: null },
  createdBy: auditUserSchema,
  updatedBy: auditUserSchema,
}, { timestamps: true });
capitalExpenseSchema.plugin(academicSessionPlugin);
capitalExpenseSchema.index({ kind: 1, date: -1 });
capitalExpenseSchema.index({ 'sourceRef.id': 1 });
capitalExpenseSchema.index({ categoryId: 1, date: -1 });

const expenseCategorySchema = withMeta({
  name: { type: String, required: true, trim: true },
  icon: { type: String, trim: true, default: 'shapes' },
  color: { type: String, trim: true, default: '#6366f1' },
  parentId: { type: ObjectId, ref: 'ExpenseCategory', default: null },
  isSystem: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
});
expenseCategorySchema.index({ parentId: 1, sortOrder: 1 });

const capitalBudgetSchema = new mongoose.Schema({
  kind: { type: String, enum: EXPENSE_KINDS, required: true },
  targetKey: { type: String, default: 'all' }, // 'all' | categoryId | vehicleId | connectionId
  targetLabel: { type: String, trim: true, default: '' },
  amount: { type: Number, min: 0, default: 0 },
  updatedBy: auditUserSchema,
}, { timestamps: true });
capitalBudgetSchema.plugin(academicSessionPlugin);
capitalBudgetSchema.index({ academicSession: 1, kind: 1, targetKey: 1 }, { unique: true });

// Salary & payroll
const salaryComponentSchema = withMeta({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  type: { type: String, enum: ['earning', 'deduction'], default: 'earning' },
  calc: { type: String, enum: ['fixed', 'percent_of_basic', 'percent_of_gross'], default: 'fixed' },
  defaultValue: { type: Number, default: 0 },
  sortOrder: { type: Number, default: 0 },
});
salaryComponentSchema.index({ code: 1 }, { unique: true });

const salaryLineSchema = new mongoose.Schema({
  componentId: { type: ObjectId, ref: 'SalaryComponent', default: null },
  code: { type: String, trim: true, default: '' },
  name: { type: String, trim: true, default: '' },
  type: { type: String, enum: ['earning', 'deduction'], default: 'earning' },
  calc: { type: String, enum: ['fixed', 'percent_of_basic', 'percent_of_gross'], default: 'fixed' },
  value: { type: Number, default: 0 },
}, { _id: false });

const staffSnapshotSchema = {
  name: { type: String, trim: true, default: '' },
  employeeId: { type: String, trim: true, default: '' },
  designation: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  dutyType: { type: String, trim: true, default: '' },
  bankName: { type: String, trim: true, default: '' },
  accountNumber: { type: String, trim: true, default: '' },
  ifscCode: { type: String, trim: true, default: '' },
};

const staffSalaryStructureSchema = withMeta({
  staffKey: { type: String, required: true, trim: true },
  teacherId: { type: ObjectId, ref: 'Teacher', default: null },
  employeeId: { type: String, trim: true, default: '' },
  staffSnapshot: staffSnapshotSchema,
  components: { type: [salaryLineSchema], default: [] },
  options: {
    pf: { type: Boolean, default: true },
    pfWageCap: { type: Boolean, default: true },
    esi: { type: String, enum: ['auto', 'off'], default: 'auto' },
    tdsMonthly: { type: Number, default: 0 },
  },
  effectiveFrom: { type: Date, default: Date.now },
  gross: { type: Number, default: 0 },
  deductions: { type: Number, default: 0 },
  net: { type: Number, default: 0 },
  employerCost: { type: Number, default: 0 },
  revisions: {
    type: [{
      effectiveFrom: { type: Date },
      fromGross: { type: Number, default: 0 },
      toGross: { type: Number, default: 0 },
      toNet: { type: Number, default: 0 },
      note: { type: String, trim: true, default: '' },
      by: auditUserSchema,
      at: { type: Date, default: Date.now },
    }],
    default: [],
  },
});
staffSalaryStructureSchema.index({ staffKey: 1 }, { unique: true });
staffSalaryStructureSchema.index({ teacherId: 1 });

const payLineSchema = new mongoose.Schema({
  code: { type: String, trim: true, default: '' },
  name: { type: String, trim: true, default: '' },
  amount: { type: Number, default: 0 },
}, { _id: false });

const payslipSchema = new mongoose.Schema({
  staffKey: { type: String, required: true },
  teacherId: { type: ObjectId, ref: 'Teacher', default: null },
  snapshot: staffSnapshotSchema,
  lopDays: { type: Number, default: 0 },
  lopFromAttendance: { type: Number, default: null },
  paidDays: { type: Number, default: 0 },
  arrears: { type: Number, default: 0 },
  otherDeduction: { type: Number, default: 0 },
  earnings: { type: [payLineSchema], default: [] },
  deductions: { type: [payLineSchema], default: [] },
  gross: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  net: { type: Number, default: 0 },
  employerPf: { type: Number, default: 0 },
  employerEsi: { type: Number, default: 0 },
  remarks: { type: String, trim: true, default: '' },
}, { _id: true });

const payrollRunSchema = new mongoose.Schema({
  month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  status: { type: String, enum: ['draft', 'finalized', 'paid'], default: 'draft' },
  daysInMonth: { type: Number, default: 30 },
  payslips: { type: [payslipSchema], default: [] },
  totals: {
    staff: { type: Number, default: 0 },
    gross: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    net: { type: Number, default: 0 },
    employerPf: { type: Number, default: 0 },
    employerEsi: { type: Number, default: 0 },
  },
  attendanceUsed: { type: Boolean, default: false },
  paidOn: { type: Date, default: null },
  paymentMode: { type: String, trim: true, default: '' },
  reference: { type: String, trim: true, default: '' },
  expenseId: { type: ObjectId, ref: 'CapitalExpense', default: null },
  createdBy: auditUserSchema,
  updatedBy: auditUserSchema,
}, { timestamps: true });
payrollRunSchema.plugin(academicSessionPlugin);
payrollRunSchema.index({ month: 1 }, { unique: true });

// Fuel
const fuelLogSchema = new mongoose.Schema({
  vehicleId: { type: ObjectId, ref: 'TransportVehicle', default: null },
  vehicleSnapshot: {
    busNo: { type: String, trim: true, default: '' },
    registrationNumber: { type: String, trim: true, uppercase: true, default: '' },
    vehicleType: { type: String, trim: true, default: '' },
  },
  date: { type: Date, required: true },
  fuelType: { type: String, enum: ['diesel', 'petrol', 'cng', 'ev'], default: 'diesel' },
  litres: { type: Number, min: 0, required: true },
  ratePerLitre: { type: Number, min: 0, default: 0 },
  amount: { type: Number, min: 0, required: true },
  odometer: { type: Number, min: 0, default: null },
  fullTank: { type: Boolean, default: true },
  station: { type: String, trim: true, default: '' },
  billNo: { type: String, trim: true, default: '' },
  filledBy: { type: String, trim: true, default: '' },
  mode: { type: String, enum: [...PAYMENT_MODES, ''], default: 'cash' },
  notes: { type: String, trim: true, default: '' },
  attachments: { type: [attachmentSchema], default: [] },
  expenseId: { type: ObjectId, ref: 'CapitalExpense', default: null },
  isActive: { type: Boolean, default: true },
  createdBy: auditUserSchema,
}, { timestamps: true });
fuelLogSchema.plugin(academicSessionPlugin);
fuelLogSchema.index({ vehicleId: 1, date: 1 });

// Electricity
const electricityConnectionSchema = withMeta({
  name: { type: String, required: true, trim: true },
  consumerNo: { type: String, trim: true, default: '' },
  meterNo: { type: String, trim: true, default: '' },
  provider: { type: String, trim: true, default: '' },
  locationId: { type: ObjectId, ref: 'AssetLocation', default: null },
  locationText: { type: String, trim: true, default: '' },
  sanctionedLoadKw: { type: Number, default: 0 },
  notes: { type: String, trim: true, default: '' },
});

const electricityBillSchema = new mongoose.Schema({
  connectionId: { type: ObjectId, ref: 'ElectricityConnection', required: true },
  connectionSnapshot: {
    name: { type: String, trim: true, default: '' },
    consumerNo: { type: String, trim: true, default: '' },
  },
  billMonth: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  billNo: { type: String, trim: true, default: '' },
  periodFrom: { type: Date, default: null },
  periodTo: { type: Date, default: null },
  prevReading: { type: Number, default: null },
  currReading: { type: Number, default: null },
  units: { type: Number, min: 0, default: 0 },
  amount: { type: Number, min: 0, required: true },
  dueDate: { type: Date, default: null },
  status: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
  paidOn: { type: Date, default: null },
  mode: { type: String, enum: [...PAYMENT_MODES, ''], default: '' },
  reference: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  attachments: { type: [attachmentSchema], default: [] },
  expenseId: { type: ObjectId, ref: 'CapitalExpense', default: null },
  isActive: { type: Boolean, default: true },
  createdBy: auditUserSchema,
}, { timestamps: true });
electricityBillSchema.plugin(academicSessionPlugin);
electricityBillSchema.index({ connectionId: 1, billMonth: 1 });

// Infrastructure
const infraProjectSchema = withMeta({
  title: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['construction', 'renovation', 'repair', 'furniture', 'it_infra', 'landscaping', 'other'],
    default: 'construction',
  },
  description: { type: String, trim: true, default: '' },
  locationId: { type: ObjectId, ref: 'AssetLocation', default: null },
  locationText: { type: String, trim: true, default: '' },
  vendor: { type: String, trim: true, default: '' },
  sanctionedBudget: { type: Number, min: 0, default: 0 },
  startDate: { type: Date, default: null },
  targetDate: { type: Date, default: null },
  completedDate: { type: Date, default: null },
  status: { type: String, enum: ['planned', 'in_progress', 'on_hold', 'completed', 'cancelled'], default: 'planned' },
  milestones: {
    type: [{
      title: { type: String, trim: true, default: '' },
      dueDate: { type: Date, default: null },
      done: { type: Boolean, default: false },
      doneAt: { type: Date, default: null },
    }],
    default: [],
  },
  documents: { type: [attachmentSchema], default: [] },
});
infraProjectSchema.index({ status: 1, updatedAt: -1 });

module.exports = {
  FeeHead: createContextModelProxy('FeeHead', feeHeadSchema),
  FeeStructure: createContextModelProxy('FeeStructure', feeStructureSchema),
  FeeStructureRevision: createContextModelProxy('FeeStructureRevision', feeStructureRevisionSchema),
  StudentFeeAccount: createContextModelProxy('StudentFeeAccount', studentFeeAccountSchema),
  FeeDemand: createContextModelProxy('FeeDemand', feeDemandSchema),
  FeePayment: createContextModelProxy('FeePayment', feePaymentSchema),
  CapitalSettings: createContextModelProxy('CapitalSettings', capitalSettingsSchema),
  CapitalCounter: createContextModelProxy('CapitalCounter', capitalCounterSchema),
  CapitalExpense: createContextModelProxy('CapitalExpense', capitalExpenseSchema),
  ExpenseCategory: createContextModelProxy('ExpenseCategory', expenseCategorySchema),
  CapitalBudget: createContextModelProxy('CapitalBudget', capitalBudgetSchema),
  SalaryComponent: createContextModelProxy('SalaryComponent', salaryComponentSchema),
  StaffSalaryStructure: createContextModelProxy('StaffSalaryStructure', staffSalaryStructureSchema),
  PayrollRun: createContextModelProxy('PayrollRun', payrollRunSchema),
  FuelLog: createContextModelProxy('FuelLog', fuelLogSchema),
  ElectricityConnection: createContextModelProxy('ElectricityConnection', electricityConnectionSchema),
  ElectricityBill: createContextModelProxy('ElectricityBill', electricityBillSchema),
  InfraProject: createContextModelProxy('InfraProject', infraProjectSchema),
};
