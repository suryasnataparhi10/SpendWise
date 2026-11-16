// MongoDB adapter: the application database. Converts stored documents (ObjectId, Decimal128,
// Date) to and from the portable model.
const { ObjectId, Decimal128 } = require('mongodb');
const mongo = require('../../db');
const { ENTITY, ENTITY_NAMES, normalize } = require('../model');
const { toCents } = require('../../db/records');

const COLLECTION = {
  users: 'users',
  expenses: 'expenses',
  incomes: 'incomes',
  budgets: 'budgets',
  reminders: 'reminders',
  passwordVaults: 'passwordvaults',
  scheduledMessages: 'scheduledmessages',
  hiddenRecoveryEmails: 'hiddenexpenserecoveryemails',
  auditLog: 'migrationauditlog',
};

const moneyText = (value) => {
  const c = toCents(value);
  const negative = c < 0n;
  const abs = negative ? -c : c;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};

function toStored(spec, value) {
  if (value === null || value === undefined) return null;
  switch (spec.type) {
    case 'id':
      return ObjectId.createFromHexString(value);
    case 'money':
      return Decimal128.fromString(value);
    case 'date':
      return new Date(value);
    case 'array':
      return value.map((item) => {
        const child = {};
        for (const [name, childSpec] of Object.entries(spec.of))
          child[name === 'id' ? '_id' : name] = toStored(childSpec, item[name]);
        return child;
      });
    default:
      return value;
  }
}

function fromStored(spec, value) {
  if (value === null || value === undefined) return null;
  switch (spec.type) {
    case 'id':
      return value instanceof ObjectId ? value.toHexString() : String(value);
    case 'money':
      return moneyText(value);
    case 'date':
      return new Date(value).toISOString();
    case 'int':
      return Number(value);
    case 'array':
      return (value || []).map((item) => {
        const child = {};
        for (const [name, childSpec] of Object.entries(spec.of))
          child[name] = fromStored(childSpec, item[name === 'id' ? '_id' : name]);
        return child;
      });
    default:
      return value;
  }
}

function toDocument(entity, record) {
  const doc = {};
  for (const [name, spec] of Object.entries(entity.fields)) {
    const stored = toStored(spec, record[name]);
    if (name === 'id') doc._id = stored;
    else doc[name] = stored;
  }
  return doc;
}

function fromDocument(entity, doc) {
  const record = {};
  for (const [name, spec] of Object.entries(entity.fields))
    record[name] = fromStored(spec, name === 'id' ? doc._id : doc[name]);
  return normalize(entity, record);
}

const keyFilter = (entity, key) =>
  entity.key === 'id' ? { _id: ObjectId.createFromHexString(key) } : { [entity.key]: ObjectId.createFromHexString(key) };

function createMongoAdapter() {
  const collection = (name) => mongo.db().collection(COLLECTION[name]);
  return {
    key: 'application',
    type: 'mongodb',
    typeLabel: 'MongoDB',
    role: 'Application database',
    atomic: false,
    supports: (name) => Boolean(COLLECTION[name]),
    async info() {
      const db = mongo.db();
      let version = null;
      try {
        version = (await db.admin().serverInfo()).version;
      } catch {}
      return {
        key: 'application',
        type: 'mongodb',
        typeLabel: 'MongoDB',
        role: 'Application database',
        database: db.databaseName,
        version,
        transactions: mongo.transactionsSupported(),
      };
    },
    async counts() {
      const out = {};
      for (const name of ENTITY_NAMES) out[name] = await collection(name).estimatedDocumentCount();
      return out;
    },
    async exportAll(names = ENTITY_NAMES) {
      const out = {};
      for (const name of names) {
        const entity = ENTITY[name];
        const docs = await collection(name).find({}).toArray();
        out[name] = docs.map((doc) => fromDocument(entity, doc)).sort((a, b) => (a[entity.key] < b[entity.key] ? -1 : 1));
      }
      return out;
    },
    // Insert or fully replace records by their key.
    async upsert(name, records) {
      if (!records.length) return;
      const entity = ENTITY[name];
      const operations = records.map((record) => {
        const doc = toDocument(entity, record);
        if (entity.appendOnly)
          return { updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } };
        if (entity.key !== 'id') {
          const { _id, ...replacement } = doc;
          return { replaceOne: { filter: keyFilter(entity, record[entity.key]), replacement, upsert: true } };
        }
        return { replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } };
      });
      await collection(name).bulkWrite(operations, { ordered: true });
    },
    async remove(name, keys) {
      if (!keys.length) return 0;
      const entity = ENTITY[name];
      const field = entity.key === 'id' ? '_id' : entity.key;
      const result = await collection(name).deleteMany({ [field]: { $in: keys.map((k) => ObjectId.createFromHexString(k)) } });
      return result.deletedCount;
    },
    async removeOwnedBy(name, userIds) {
      if (!userIds.length) return 0;
      const result = await collection(name).deleteMany({ userId: { $in: userIds.map((k) => ObjectId.createFromHexString(k)) } });
      return result.deletedCount;
    },
    async removeAll(name) {
      return (await collection(name).deleteMany({})).deletedCount;
    },
    async runAtomic(work) {
      return work();
    },
  };
}

module.exports = { createMongoAdapter, COLLECTION };
