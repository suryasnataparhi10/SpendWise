const { MongoClient } = require('mongodb');

// Collection names follow the original Mongoose naming so the data layout stays familiar.
const COLLECTIONS = {
  users: 'users',
  expenses: 'expenses',
  incomes: 'incomes',
  budgets: 'budgets',
  reminders: 'reminders',
  passwordVaults: 'passwordvaults',
  scheduledMessages: 'scheduledmessages',
  hiddenRecoveryEmails: 'hiddenexpenserecoveryemails',
};

let client = null;
let database = null;
let connecting = null;
let supportsTransactions = false;

function connectionSettings() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI must be configured before starting the API');
  let nameFromUri = '';
  try {
    nameFromUri = decodeURIComponent(
      new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.replace(/^\/+/, ''),
    );
  } catch {
    throw new Error('MONGODB_URI is not a valid MongoDB connection string');
  }
  const dbName = process.env.MONGODB_DB || nameFromUri;
  if (!dbName) {
    throw new Error('Add the database name to MONGODB_URI (…/spendwise_app) or set MONGODB_DB');
  }
  return { uri, dbName };
}

// One MongoClient per process. The driver keeps a connection pool and transparently
// reconnects (with retryable reads/writes) when the server becomes reachable again.
async function connect() {
  if (database) return database;
  if (!connecting) {
    connecting = (async () => {
      const { uri, dbName } = connectionSettings();
      const mongo = new MongoClient(uri, {
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 20,
        retryWrites: true,
        retryReads: true,
      });
      await mongo.connect();
      const db = mongo.db(dbName);
      const hello = await db.admin().command({ hello: 1 });
      supportsTransactions = Boolean(hello.setName || hello.msg === 'isdbgrid');
      client = mongo;
      database = db;
      return db;
    })().catch((error) => {
      connecting = null;
      throw error;
    });
  }
  return connecting;
}

function db() {
  if (!database) throw new Error('MongoDB is not connected yet');
  return database;
}

function collection(name) {
  return db().collection(COLLECTIONS[name] || name);
}

// Runs `work(session)` atomically when the deployment supports multi-document transactions
// (replica sets, Atlas). On a standalone server `session` is undefined and callers rely on
// single-document atomic updates plus compensating cleanup.
async function withTransaction(work) {
  if (!supportsTransactions) return work(undefined);
  const session = client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function close() {
  if (client) await client.close();
  client = null;
  database = null;
  connecting = null;
}

module.exports = {
  COLLECTIONS,
  connect,
  db,
  collection,
  withTransaction,
  close,
  transactionsSupported: () => supportsTransactions,
};
