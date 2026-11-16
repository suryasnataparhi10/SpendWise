// Database-independent ("portable") model of the SpendWise dataset. Every adapter converts its
// own storage format to and from these shapes, so any supported database can be exported to or
// imported from any other. Values are plain JSON: ids are 24-character hex strings, money is a
// decimal string with two places, timestamps are ISO-8601 strings.
const FORMAT = 'spendwise-migration-package';
const FORMAT_VERSION = 1;
const MODEL_VERSION = 1;

const f = (type, extra = {}) => ({ type, ...extra });
const opt = (type, extra = {}) => ({ type, optional: true, ...extra });

const ENTITIES = [
  {
    name: 'users',
    label: 'User accounts',
    key: 'id',
    unique: [['email']],
    sensitive: ['password', 'passwordResetTokenHash', 'hiddenExpenseKeyHash', 'hiddenExpenseOtpHash', 'avatar'],
    fields: {
      id: f('id'),
      name: opt('string'),
      avatar: f('string'),
      email: f('string', { min: 3 }),
      password: f('string', { min: 1 }),
      passwordResetTokenHash: opt('string'),
      passwordResetExpires: opt('date'),
      hiddenExpenseKeyHash: opt('string'),
      hiddenExpenseOtpHash: opt('string'),
      hiddenExpenseOtpExpires: opt('date'),
      hiddenExpenseOtpSentAt: opt('date'),
      hiddenExpenseOtpAttempts: opt('int'),
      themePreferences: f('object'),
      createdAt: f('date'),
      updatedAt: f('date'),
    },
  },
  {
    name: 'expenses',
    label: 'Expenses',
    key: 'id',
    owner: 'userId',
    fields: {
      id: f('id'),
      userId: f('id'),
      date: f('date'),
      amount: f('money', { minimum: '0.01' }),
      item: opt('string'),
      category: f('string'),
      subcategory: opt('string'),
      hasSubtypes: f('bool'),
      subtypes: f('array', {
        of: {
          id: f('id'),
          type: f('string'),
          amount: opt('money', { minimum: '0.01' }),
          paymentMethod: f('string'),
        },
      }),
      description: opt('string'),
      paymentMethod: f('string'),
      notes: opt('string'),
      isLocked: f('bool'),
      deletedAt: opt('date'),
      createdAt: f('date'),
      updatedAt: f('date'),
    },
  },
  {
    name: 'incomes',
    label: 'Income entries',
    key: 'id',
    owner: 'userId',
    fields: {
      id: f('id'),
      userId: f('id'),
      date: f('date'),
      amount: f('money', { minimum: '0.01' }),
      source: f('string', { min: 1 }),
      createdAt: f('date'),
      updatedAt: f('date'),
    },
  },
  {
    name: 'budgets',
    label: 'Monthly budgets',
    key: 'id',
    owner: 'userId',
    unique: [['userId', 'year', 'month']],
    fields: {
      id: f('id'),
      userId: f('id'),
      month: f('int', { minimum: 1, maximum: 12 }),
      year: f('int'),
      limit: f('money', { minimum: '0.01' }),
      createdAt: f('date'),
      updatedAt: f('date'),
    },
  },
  {
    name: 'reminders',
    label: 'Bill reminders and payments',
    key: 'id',
    owner: 'userId',
    fields: {
      id: f('id'),
      userId: f('id'),
      title: f('string', { min: 1 }),
      dueDate: f('date'),
      amount: opt('money', { minimum: '0.00' }),
      paidAmount: f('money', { minimum: '0.00' }),
      completed: f('bool'),
      payments: f('array', {
        of: { id: f('id'), amount: f('money', { minimum: '0.01' }), paidAt: f('date'), createdAt: f('date') },
      }),
      createdAt: f('date'),
      updatedAt: f('date'),
    },
  },
  {
    name: 'passwordVaults',
    label: 'Encrypted password vaults',
    key: 'userId',
    owner: 'userId',
    sensitive: ['salt', 'iv', 'ciphertext'],
    fields: {
      userId: f('id'),
      salt: f('string'),
      iv: f('string'),
      ciphertext: f('string'),
      updatedAt: f('date'),
    },
  },
  {
    name: 'scheduledMessages',
    label: 'Scheduled messages',
    key: 'id',
    owner: 'userId',
    fields: {
      id: f('id'),
      userId: f('id'),
      contactName: f('string'),
      email: opt('string'),
      recipientConsented: f('bool'),
      channel: f('enum', { values: ['email'] }),
      messageType: f('enum', { values: ['love', 'greeting', 'celebration', 'custom'] }),
      message: f('string', { max: 1500 }),
      frequency: f('enum', { values: ['once', 'daily', 'weekly', 'monthly', 'custom'] }),
      intervalDays: opt('int', { minimum: 1, maximum: 365 }),
      timeZone: f('string'),
      scheduledAt: f('date'),
      nextSendAt: f('date'),
      endAt: opt('date'),
      active: f('bool'),
      lockedAt: opt('date'),
      lastSentAt: opt('date'),
      lastError: opt('string'),
      createdAt: f('date'),
      updatedAt: f('date'),
    },
  },
  {
    name: 'hiddenRecoveryEmails',
    label: 'Pending PIN-recovery emails',
    key: 'id',
    owner: 'userId',
    sensitive: ['token', 'tokenHash'],
    fields: {
      id: f('id'),
      userId: f('id'),
      to: f('string'),
      token: f('string'),
      tokenHash: f('string'),
      expiresAt: f('date'),
      sentAt: opt('date'),
      attempts: f('int', { minimum: 0 }),
      createdAt: f('date'),
      updatedAt: f('date'),
    },
  },
  {
    // Administrative audit trail. Append-only: imports add missing entries and never delete or
    // overwrite existing ones.
    name: 'auditLog',
    label: 'Administrative audit log',
    key: 'id',
    appendOnly: true,
    fields: {
      id: f('id'),
      at: f('date'),
      actor: f('object'),
      action: f('string'),
      details: f('object'),
    },
  },
];

const ENTITY = Object.fromEntries(ENTITIES.map((entity) => [entity.name, entity]));
const ENTITY_NAMES = ENTITIES.map((entity) => entity.name);

const HEX_ID = /^[a-f\d]{24}$/;
const MONEY = /^\d{1,16}\.\d{2}$/;
const cents = (money) => BigInt(money.replace('.', ''));

function checkField(spec, value, path, problems) {
  if (value === null || value === undefined) {
    if (!spec.optional) problems.push(`${path} is required`);
    return;
  }
  switch (spec.type) {
    case 'id':
      if (typeof value !== 'string' || !HEX_ID.test(value)) problems.push(`${path} must be a 24-character id`);
      break;
    case 'string':
      if (typeof value !== 'string') problems.push(`${path} must be text`);
      else if (spec.min && value.length < spec.min) problems.push(`${path} is too short`);
      else if (spec.max && value.length > spec.max) problems.push(`${path} is too long`);
      break;
    case 'date':
      if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) problems.push(`${path} must be a date`);
      break;
    case 'money':
      if (typeof value !== 'string' || !MONEY.test(value)) problems.push(`${path} must be an amount like 12.50`);
      else if (spec.minimum && cents(value) < cents(spec.minimum)) problems.push(`${path} must be at least ${spec.minimum}`);
      break;
    case 'bool':
      if (typeof value !== 'boolean') problems.push(`${path} must be true or false`);
      break;
    case 'int':
      if (!Number.isSafeInteger(value)) problems.push(`${path} must be a whole number`);
      else if ((spec.minimum != null && value < spec.minimum) || (spec.maximum != null && value > spec.maximum))
        problems.push(`${path} is out of range`);
      break;
    case 'enum':
      if (!spec.values.includes(value)) problems.push(`${path} must be one of ${spec.values.join(', ')}`);
      break;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) problems.push(`${path} must be an object`);
      break;
    case 'array':
      if (!Array.isArray(value)) problems.push(`${path} must be a list`);
      else
        value.forEach((item, index) => {
          if (!item || typeof item !== 'object') problems.push(`${path}[${index}] must be an object`);
          else for (const [name, child] of Object.entries(spec.of)) checkField(child, item[name], `${path}[${index}].${name}`, problems);
        });
      break;
    default:
      problems.push(`${path} has an unknown type`);
  }
}

// Returns a list of human-readable problems ([] when the record is valid).
function validateRecord(entity, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['record must be an object'];
  const problems = [];
  for (const [name, spec] of Object.entries(entity.fields)) checkField(spec, record[name], name, problems);
  const unknown = Object.keys(record).filter((name) => !entity.fields[name]);
  if (unknown.length) problems.push(`unexpected fields: ${unknown.join(', ')}`);
  if (entity.name === 'reminders' && !problems.length && record.amount != null && cents(record.paidAmount) > cents(record.amount))
    problems.push('paidAmount cannot exceed amount');
  return problems;
}

// Normalises a record so that equal data always serialises identically (key order, dates).
function normalize(entity, record) {
  const out = {};
  for (const [name, spec] of Object.entries(entity.fields)) {
    const value = record[name];
    if (value === undefined || value === null) out[name] = null;
    else if (spec.type === 'date') out[name] = new Date(value).toISOString();
    else if (spec.type === 'array')
      out[name] = value.map((item) => {
        const child = {};
        for (const [childName, childSpec] of Object.entries(spec.of)) {
          const v = item[childName];
          child[childName] = v == null ? null : childSpec.type === 'date' ? new Date(v).toISOString() : v;
        }
        return child;
      });
    else if (spec.type === 'object') out[name] = sortKeys(value);
    else out[name] = value;
  }
  return out;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
}

const keyOf = (entity, record) => String(record[entity.key]);
const uniqueKeyOf = (fields, record) => JSON.stringify(fields.map((name) => record[name]));
const sameRecord = (a, b) => JSON.stringify(a) === JSON.stringify(b);

module.exports = {
  FORMAT,
  FORMAT_VERSION,
  MODEL_VERSION,
  ENTITIES,
  ENTITY,
  ENTITY_NAMES,
  validateRecord,
  normalize,
  keyOf,
  uniqueKeyOf,
  sameRecord,
};
