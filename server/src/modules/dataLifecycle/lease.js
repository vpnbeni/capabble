/*
 * Job leases in the central database, the same pattern as billing's job_leases table: a job runs
 * only while its instance holds an unexpired lease, so two servers never run it at once.
 * Daily jobs also record the IST day they last completed, so they run once a day.
 */
const os = require('os');
const { getModels } = require('./models');

const HOLDER = `${os.hostname()}:${process.pid}`;
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** YYYY-MM-DD in India. */
const istDay = (date = new Date()) => new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istHour = (date = new Date()) => new Date(date.getTime() + IST_OFFSET_MS).getUTCHours();

const acquireLease = async (name, minutes, now = new Date()) => {
  const { JobLease } = getModels();
  await JobLease.updateOne({ _id: name }, { $setOnInsert: { lockedUntil: new Date(0) } }, { upsert: true })
    .catch((error) => { if (error.code !== 11000) throw error; });
  const lease = await JobLease.findOneAndUpdate(
    { _id: name, lockedUntil: { $lte: now } },
    { $set: { holder: HOLDER, lockedUntil: new Date(now.getTime() + minutes * 60000) } },
    { new: true }
  ).lean();
  return lease;
};

const releaseLease = async (name, update = {}) => {
  const { JobLease } = getModels();
  await JobLease.updateOne(
    { _id: name, holder: HOLDER },
    { $set: { lockedUntil: new Date(), lastRunAt: new Date(), ...update } }
  );
};

const readLease = (name) => getModels().JobLease.findById(name).lean();

module.exports = { acquireLease, releaseLease, readLease, istDay, istHour, HOLDER };
