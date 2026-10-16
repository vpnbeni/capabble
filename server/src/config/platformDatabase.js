const mongoose = require('mongoose');
require('colors');

let platformConnection = null;
let connectionPromise = null;

const getMongoUri = () => {
  return process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017';
};

const getCentralDbName = () => process.env.CENTRAL_DB_NAME || 'capabble_central';

const connectPlatformDB = async () => {
  if (platformConnection && platformConnection.readyState === 1) {
    return platformConnection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const mongoUri = getMongoUri();
  const dbName = getCentralDbName();

  connectionPromise = new Promise((resolve, reject) => {
    const connection = mongoose.createConnection(mongoUri, {
      dbName,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    connection.once('open', () => {
      platformConnection = connection;
      console.log(`Platform DB Connected: ${connection.host}/${connection.name}`.cyan.underline.bold);
      resolve(platformConnection);
    });

    connection.on('error', (error) => {
      console.error(`Platform DB connection error: ${error.message}`.red.bold);
    });

    connection.on('disconnected', () => {
      console.log('Platform DB disconnected'.yellow.bold);
    });

    connection.on('reconnected', () => {
      console.log('Platform DB reconnected'.green.bold);
    });

    connection.once('error', (error) => {
      reject(error);
    });
  });

  try {
    await connectionPromise;
    return platformConnection;
  } finally {
    connectionPromise = null;
  }
};

const getPlatformConnection = () => {
  if (!platformConnection) {
    throw new Error('Platform database not initialized. Call connectPlatformDB() first.');
  }

  return platformConnection;
};

module.exports = {
  connectPlatformDB,
  getPlatformConnection,
  getCentralDbName,
  getMongoUri,
};
