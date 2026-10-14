/**
 * Shared runner for CPITL bulk endpoints.
 *
 * Every bulk action reuses the exact service function behind its single-record endpoint,
 * so business rules, ledger updates and audit fields stay identical. Records are processed
 * one at a time (no transactions are available, and running in sequence avoids two writes
 * racing on the same student account or bill). A record that fails is skipped with its
 * reason; the rest still go through. The response always lists what happened to each id.
 */
const mongoose = require('mongoose');
const { httpError } = require('./feeService');

const MAX_BULK = 200;

/** Validates and de-duplicates the `ids` array from a request body. */
const parseIds = (value, { field = 'ids', max = MAX_BULK } = {}) => {
  if (!Array.isArray(value) || value.length === 0) throw httpError(`Send at least one id in "${field}".`);
  const ids = [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))];
  if (ids.length > max) throw httpError(`You can change up to ${max} records at a time. Select fewer and try again.`);
  const invalid = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalid.length) throw httpError(`Some ids are not valid: ${invalid.slice(0, 3).join(', ')}.`);
  return ids;
};

/**
 * Runs `worker(id)` for each id in order. The worker returns an optional label (e.g. a
 * receipt number) used in the summary; a thrown error marks that id as skipped.
 */
const runBulk = async (ids, worker) => {
  const succeeded = [];
  const failed = [];
  for (const id of ids) {
    try {
      const label = await worker(id);
      succeeded.push({ id, label: label ? String(label) : undefined });
    } catch (error) {
      failed.push({ id, label: error?.label ? String(error.label) : undefined, error: error?.message || 'Could not update this record.' });
    }
  }
  return { succeeded: succeeded.length, failed, done: succeeded };
};

/** Standard response: 200 when anything went through, 422 when every record was skipped. */
const sendBulk = (res, result) =>
  res.status(result.succeeded === 0 && result.failed.length > 0 ? 422 : 200).json({
    success: result.succeeded > 0,
    message: `${result.succeeded} updated, ${result.failed.length} skipped.`,
    data: result,
  });

/** Attach a human label to an error so the skipped list names the record. */
const labelled = (error, label) => {
  if (error && label) error.label = label;
  return error;
};

module.exports = { MAX_BULK, parseIds, runBulk, sendBulk, labelled };
