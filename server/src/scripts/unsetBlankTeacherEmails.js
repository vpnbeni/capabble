const mongoose = require('mongoose')

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is required')
  }

  await mongoose.connect(uri)

  // This script runs against the current DB in MONGODB_URI.
  // In Capabble, tenant DB selection is usually handled by tenancy middleware;
  // for scripted cleanup, you should point MONGODB_URI at the tenant DB you want to fix.
  const db = mongoose.connection.db
  const teachers = db.collection('teachers')

  const result = await teachers.updateMany(
    { email: { $in: ['', null] } },
    { $unset: { email: '' } }
  )

  // eslint-disable-next-line no-console
  console.log(`Unset blank teacher emails. matched=${result.matchedCount} modified=${result.modifiedCount}`)

  await mongoose.disconnect()
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})

