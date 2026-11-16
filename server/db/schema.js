const { Decimal128 } = require('mongodb');
const { COLLECTIONS } = require('./index');

// Collection validators reproduce the PostgreSQL NOT NULL, CHECK and enum constraints, and the
// indexes reproduce its primary keys, unique constraints and query indexes. Applied on every API
// start (idempotent) and by `npm run db:setup`.
const D = (value) => Decimal128.fromString(value);
const nullable = (bsonType) => ({ bsonType: [bsonType, 'null'] });
const string = { bsonType: 'string' };
const date = { bsonType: 'date' };
const bool = { bsonType: 'bool' };
const id = { bsonType: 'objectId' };
const money = { bsonType: 'decimal' };
const integer = { bsonType: ['int', 'long'] };

const definitions = {
  [COLLECTIONS.users]: {
    schema: {
      required: ['_id', 'avatar', 'email', 'password', 'createdAt', 'updatedAt', 'themePreferences'],
      properties: {
        _id: id,
        name: nullable('string'),
        avatar: string,
        email: string,
        password: string,
        passwordResetTokenHash: nullable('string'),
        passwordResetExpires: nullable('date'),
        hiddenExpenseKeyHash: nullable('string'),
        hiddenExpenseOtpHash: nullable('string'),
        hiddenExpenseOtpExpires: nullable('date'),
        hiddenExpenseOtpSentAt: nullable('date'),
        hiddenExpenseOtpAttempts: { bsonType: ['int', 'long', 'null'] },
        createdAt: date,
        updatedAt: date,
        themePreferences: { bsonType: 'object' },
      },
    },
    indexes: [{ key: { email: 1 }, name: 'users_email_unique', unique: true }],
  },
  [COLLECTIONS.expenses]: {
    schema: {
      required: [
        '_id', 'userId', 'date', 'amount', 'category', 'hasSubtypes', 'subtypes',
        'paymentMethod', 'isLocked', 'createdAt', 'updatedAt',
      ],
      properties: {
        _id: id,
        userId: id,
        date,
        amount: money,
        item: nullable('string'),
        category: string,
        subcategory: nullable('string'),
        hasSubtypes: bool,
        subtypes: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['_id', 'type', 'paymentMethod'],
            properties: {
              _id: id,
              type: string,
              amount: nullable('decimal'),
              paymentMethod: string,
            },
          },
        },
        description: nullable('string'),
        paymentMethod: string,
        notes: nullable('string'),
        isLocked: bool,
        deletedAt: nullable('date'),
        createdAt: date,
        updatedAt: date,
      },
    },
    rules: {
      amount: { $gte: D('0.01') },
      subtypes: { $not: { $elemMatch: { amount: { $lt: D('0.01') } } } },
    },
    indexes: [
      { key: { userId: 1, date: -1 }, name: 'expenses_user_date' },
      { key: { userId: 1, category: 1 }, name: 'expenses_user_category' },
      {
        key: { userId: 1, deletedAt: 1 },
        name: 'expenses_user_deleted',
        partialFilterExpression: { deletedAt: { $type: 'date' } },
      },
    ],
  },
  [COLLECTIONS.incomes]: {
    schema: {
      required: ['_id', 'userId', 'date', 'amount', 'source', 'createdAt', 'updatedAt'],
      properties: { _id: id, userId: id, date, amount: money, source: string, createdAt: date, updatedAt: date },
    },
    rules: { amount: { $gte: D('0.01') } },
    indexes: [{ key: { userId: 1, date: -1 }, name: 'incomes_user_date' }],
  },
  [COLLECTIONS.budgets]: {
    schema: {
      required: ['_id', 'userId', 'month', 'year', 'limit', 'createdAt', 'updatedAt'],
      properties: {
        _id: id,
        userId: id,
        month: { bsonType: ['int', 'long'], minimum: 1, maximum: 12 },
        year: integer,
        limit: money,
        createdAt: date,
        updatedAt: date,
      },
    },
    rules: { limit: { $gte: D('0.01') } },
    indexes: [
      { key: { userId: 1, year: 1, month: 1 }, name: 'budgets_user_year_month_unique', unique: true },
    ],
  },
  [COLLECTIONS.reminders]: {
    schema: {
      required: ['_id', 'userId', 'title', 'dueDate', 'paidAmount', 'completed', 'payments', 'createdAt', 'updatedAt'],
      properties: {
        _id: id,
        userId: id,
        title: string,
        dueDate: date,
        amount: nullable('decimal'),
        paidAmount: money,
        completed: bool,
        payments: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['_id', 'amount', 'paidAt', 'createdAt'],
            properties: { _id: id, amount: money, paidAt: date, createdAt: date },
          },
        },
        createdAt: date,
        updatedAt: date,
      },
    },
    rules: {
      $and: [
        { $or: [{ amount: null }, { amount: { $gte: D('0') } }] },
        { paidAmount: { $gte: D('0') } },
        { payments: { $not: { $elemMatch: { amount: { $lt: D('0.01') } } } } },
        {
          $expr: {
            $or: [
              { $in: [{ $type: '$amount' }, ['null', 'missing']] },
              { $lte: ['$paidAmount', '$amount'] },
            ],
          },
        },
      ],
    },
    indexes: [
      { key: { userId: 1, dueDate: 1 }, name: 'reminders_user_due' },
      { key: { userId: 1, 'payments.paidAt': -1 }, name: 'reminders_user_payment_date' },
    ],
  },
  [COLLECTIONS.passwordVaults]: {
    schema: {
      required: ['_id', 'userId', 'salt', 'iv', 'ciphertext', 'updatedAt'],
      properties: { _id: id, userId: id, salt: string, iv: string, ciphertext: string, updatedAt: date },
    },
    indexes: [{ key: { userId: 1 }, name: 'passwordvaults_user_unique', unique: true }],
  },
  [COLLECTIONS.scheduledMessages]: {
    schema: {
      required: [
        '_id', 'userId', 'contactName', 'recipientConsented', 'channel', 'messageType', 'message',
        'frequency', 'timeZone', 'scheduledAt', 'nextSendAt', 'active', 'createdAt', 'updatedAt',
      ],
      properties: {
        _id: id,
        userId: id,
        contactName: string,
        email: nullable('string'),
        recipientConsented: bool,
        channel: { enum: ['email'] },
        messageType: { enum: ['love', 'greeting', 'celebration', 'custom'] },
        message: { bsonType: 'string', maxLength: 1500 },
        frequency: { enum: ['once', 'daily', 'weekly', 'monthly', 'custom'] },
        intervalDays: { bsonType: ['int', 'long', 'null'], minimum: 1, maximum: 365 },
        timeZone: string,
        scheduledAt: date,
        nextSendAt: date,
        endAt: nullable('date'),
        active: bool,
        lockedAt: nullable('date'),
        lastSentAt: nullable('date'),
        lastError: nullable('string'),
        createdAt: date,
        updatedAt: date,
      },
    },
    indexes: [
      { key: { active: 1, nextSendAt: 1 }, name: 'scheduledmessages_due' },
      { key: { userId: 1 }, name: 'scheduledmessages_user' },
    ],
  },
  [COLLECTIONS.hiddenRecoveryEmails]: {
    schema: {
      required: ['_id', 'userId', 'to', 'token', 'tokenHash', 'expiresAt', 'attempts', 'createdAt', 'updatedAt'],
      properties: {
        _id: id,
        userId: id,
        to: string,
        token: string,
        tokenHash: string,
        expiresAt: date,
        sentAt: nullable('date'),
        attempts: integer,
        createdAt: date,
        updatedAt: date,
      },
    },
    indexes: [
      { key: { userId: 1 }, name: 'hiddenrecovery_user' },
      { key: { tokenHash: 1 }, name: 'hiddenrecovery_token_hash' },
      // Expired links are also deleted by the scheduler; the TTL index is a safety net.
      { key: { expiresAt: 1 }, name: 'hiddenrecovery_expires_ttl', expireAfterSeconds: 0 },
    ],
  },
};

function validatorFor({ schema, rules }) {
  const jsonSchema = { $jsonSchema: { bsonType: 'object', ...schema } };
  return rules ? { ...jsonSchema, ...rules } : jsonSchema;
}

async function ensureSchema(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, definition] of Object.entries(definitions)) {
    const options = {
      validator: validatorFor(definition),
      validationLevel: 'strict',
      validationAction: 'error',
    };
    if (existing.has(name)) await db.command({ collMod: name, ...options });
    else await db.createCollection(name, options);
    await db.collection(name).createIndexes(definition.indexes);
  }
}

module.exports = { ensureSchema, definitions };
