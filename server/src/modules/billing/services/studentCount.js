// Live active-student count for a school, when its Students module is on. The server
// registers the lookup at startup (it owns the school databases); billing stays out of Mongo.
let counter = async () => null;

function setStudentCounter(fn) {
  counter = fn;
}

async function getStudentCount(tenantSlug) {
  try {
    const count = await counter(tenantSlug);
    return Number.isInteger(count) ? count : null;
  } catch (error) {
    console.warn('[billing] student count failed', tenantSlug, error.message);
    return null;
  }
}

module.exports = { setStudentCounter, getStudentCount };
