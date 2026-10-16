const COPY_STATUS_TRANSITIONS = Object.freeze({
  available: ['issued', 'reserved', 'inspection', 'lost', 'damaged', 'withdrawn'],
  issued: ['available', 'inspection', 'lost', 'damaged'],
  reserved: ['available', 'issued', 'inspection', 'lost', 'damaged'],
  inspection: ['available', 'damaged', 'withdrawn'],
  lost: ['available', 'withdrawn'],
  damaged: ['available', 'withdrawn'],
  withdrawn: [],
});

const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const assertCopyTransition = (from, to) => {
  if (from === to) return;
  if (!COPY_STATUS_TRANSITIONS[from]?.includes(to)) throw error(`Invalid copy status transition: ${from} → ${to}.`);
};

const calculateDueAt = (issuedAt, loanDays) => {
  const days = Number(loanDays);
  if (!Number.isInteger(days) || days < 1) throw error('Loan duration must be at least one day.');
  const due = new Date(issuedAt);
  if (Number.isNaN(due.getTime())) throw error('Invalid issue date.');
  due.setUTCDate(due.getUTCDate() + days);
  return due;
};

const assertBorrowingEligibility = ({ member, policy, activeLoans }) => {
  if (!member || member.status !== 'active' || member.isActive === false) throw error('Member is not active.');
  if (!policy || policy.isActive === false) throw error(`No active lending policy exists for ${member.memberType}s.`);
  if (Number(activeLoans) >= Number(policy.maxActiveLoans)) throw error('This member has reached their borrowing limit.');
};

const calculateFine = ({ overdueDays, graceDays = 0, dailyRate, maximum = null }) => {
  const chargeableDays = Math.max(0, Number(overdueDays) - Number(graceDays));
  const amount = chargeableDays * Number(dailyRate || 0);
  return maximum === null || maximum === undefined ? amount : Math.min(amount, Number(maximum));
};

const orderReservations = (reservations) => [...reservations].filter((row) => row.status === 'queued').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

module.exports = { COPY_STATUS_TRANSITIONS, assertCopyTransition, calculateDueAt, assertBorrowingEligibility, calculateFine, orderReservations };
