const mongoose = require('mongoose');

let connectionPromise = null;

const getMongoUri = () => process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const getDbName = () => process.env.CENTRAL_DB_NAME || 'capabble_central';

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(getMongoUri(), {
    dbName: getDbName(),
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
  }).then((conn) => {
    console.log(`[billing-service] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn.connection;
  }).finally(() => {
    connectionPromise = null;
  });

  return connectionPromise;
}

module.exports = {
  connectDatabase,
  getDbName,
};
