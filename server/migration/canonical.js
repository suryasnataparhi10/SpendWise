// The canonical, database-independent model of SpendWise data.
// Every adapter converts its native storage (PostgreSQL rows, MongoDB documents, ...) to and from
// these records, so the engine never needs to know which database is on either side.
//
// Canonical values are JSON-safe: ids are 24-hex strings, dates are ISO-8601 strings, money is a
// string with exactly two decimals, JSON settings are plain objects.

const FORMAT = 'spendwise-migration';
const FORMAT_VERSION = 1;
const APP_SCHEMA_VERSION = 3;

const MESSAGE_TYPES = ['love', 'greeting', 'celebration', 'custom'];
const FREQUENCIES = ['once', 'daily', 'weekly', 'monthly', 'custom'];

// Field spec: [type, options]. Types: id, ref, string, money, date, int, bool, json, subtypes.
const ENTITIES = {
  users: {
    label: 'User accounts',
    fields: {
      _id: ['id'],
      name: ['string'],
      avatar: ['string', { default: '' }],
      email: ['string', { required: true, lower: true, maxLength: 320 }],
      password: ['string', { required: true, sensitive: true }],
      passwordResetTokenHash: ['string', { sensitive: true }],
      passwordResetExpires: ['date'],
      hiddenExpenseKeyHash: ['string', { sensitive: true }],
      hiddenExpenseOtpHash: ['string', { sensitive: true }],
      hiddenExpenseOtpExpires: ['date'],
      hiddenExpenseOtpSentAt: ['date'],
      hiddenExpenseOtpAttempts: ['int', { min: 0 }],
      // Sources without this setting (e.g. older MongoDB data) leave it empty; that keeps the
      // destination's value instead of counting as a change.
      themePreferences: ['json', { keepWhenMissing: true }],
      createdAt: ['date', { required: true }],
      updatedAt: ['date', { required: true }],
      sourceDocument: ['json', { sensitive: true, ignoreInCompare: true }],
    },
    unique: [{ name: 'email', key: (r) => r.email }],
    describe: (r) => r.email || r._id,
  },
  expenses: {
    label: 'Expenses',
    fields: {
      _id: ['id'],
      userId: ['ref', { required: true, refEntity: 'users' }],
      date: ['date', { required: true }],
      amount: ['money', { required: true, min: 0.01 }],
      item: ['string'],
      category: ['string', { default: 'Other' }],
      subcategory: ['string'],
      hasSubtypes: ['bool', { default: false }],
      description: ['string'],
      paymentMethod: ['string', { default: 'Cash' }],
      notes: ['string'],
      isLocked: ['bool', { default: false }],
      deletedAt: ['date'],
      subtypes: ['subtypes'],
      createdAt: ['date', { required: true }],
      updatedAt: ['date', { required: true }],
      sourceDocument: ['json', { sensitive: true, ignoreInCompare: true }],
    },
    describe: (r) =>
      `${r.isLocked ? 'Hidden expense' : r.item || r.description || 'Expense'} · ${r.amount} · ${String(r.date).slice(0, 10)}`,
  },
  incomes: {
    label: 'Income',
    fields: {
      _id: ['id'],
      userId: ['ref', { required: true, refEntity: 'users' }],
      date: ['date', { required: true }],
      amount: ['money', { required: true, min: 0.01 }],
      source: ['string', { required: true }],
      createdAt: ['date', { required: true }],
      updatedAt: ['date', { required: true }],
      sourceDocument: ['json', { sensitive: true, ignoreInCompare: true }],
    },
    describe: (r) => `${r.source} · ${r.amount} · ${String(r.date).slice(0, 10)}`,
  },
  budgets: {
    label: 'Budgets',
    fields: {
      _id: ['id'],
      userId: ['ref', { required: true, refEntity: 'users' }],
      month: ['int', { required: true, min: 1, max: 12 }],
      year: ['int', { required: true, min: 1900, max: 9999 }],
      limit: ['money', { required: true, min: 0.01 }],
      createdAt: ['date', { required: true }],
      updatedAt: ['date', { required: true }],
      sourceDocument: ['json', { sensitive: true, ignoreInCompare: true }],
    },
    unique: [{ name: 'month', key: (r) => `${r.userId}:${r.year}:${r.month}` }],
    describe: (r) => `Budget ${r.year}-${String(r.month).padStart(2, '0')} · ${r.limit}`,
  },
  reminders: {
    label: 'Reminders',
    fields: {
      _id: ['id'],
      userId: ['ref', { required: true, refEntity: 'users' }],
      title: ['string', { required: true }],
      dueDate: ['date', { required: true }],
      amount: ['money', { min: 0 }],
      paidAmount: ['money', { default: '0.00', min: 0 }],
      completed: ['bool', { default: false }],
      createdAt: ['date', { required: true }],
      updatedAt: ['date', { required: true }],
      sourceDocument: ['json', { sensitive: true, ignoreInCompare: true }],
    },
    check: (r) =>
      r.amount != null && Number(r.paidAmount) > Number(r.amount)
        ? 'paidAmount cannot be greater than amount'
        : null,
    describe: (r) => `${r.title} · due ${String(r.dueDate).slice(0, 10)}`,
  },
  reminderPayments: {
    label: 'Reminder payments',
    fields: {
      _id: ['id'],
      reminderId: ['ref', { required: true, refEntity: 'reminders' }],
      amount: ['money', { required: true, min: 0.01 }],
      paidAt: ['date', { required: true }],
      createdAt: ['date', { required: true }],
      sourceDocument: ['json', { sensitive: true, ignoreInCompare: true }],
    },
    describe: (r) => `Payment ${r.amount} · ${String(r.paidAt).slice(0, 10)}`,
  },
  passwordVaults: {
    label: 'Password vaults (encrypted)',
    // One vault per user; the vault id is the owner's user id.
    fields: {
      _id: ['id'],
      userId: ['ref', { required: true, refEntity: 'users' }],
      salt: ['string', { required: true, sensitive: true }],
      iv: ['string', { required: true, sensitive: true }],
      ciphertext: ['string', { required: true, sensitive: true }],
      updatedAt: ['date', { required: true }],
    },
    check: (r) => (r._id !== r.userId ? 'vault id must equal its owner userId' : null),
    describe: () => 'Encrypted password vault',
  },
  scheduledMessages: {
    label: 'Scheduled messages',
    fields: {
      _id: ['id'],
      userId: ['ref', { required: true, refEntity: 'users' }],
      contactName: ['string', { required: true }],
      email: ['string'],
      recipientConsented: ['bool', { default: false }],
      channel: ['string', { default: 'email', enum: ['email'] }],
      messageType: ['string', { default: 'greeting', enum: MESSAGE_TYPES }],
      message: ['string', { required: true, maxLength: 1500 }],
      frequency: ['string', { default: 'once', enum: FREQUENCIES }],
      intervalDays: ['int', { min: 1, max: 365 }],
      timeZone: ['string', { default: 'Asia/Kolkata' }],
      scheduledAt: ['date', { required: true }],
      nextSendAt: ['date', { required: true }],
      endAt: ['date'],
      active: ['bool', { default: true }],
      lockedAt: ['date'],
      lastSentAt: ['date'],
      lastError: ['string'],
      createdAt: ['date', { required: true }],
      updatedAt: ['date', { required: true }],
      sourceDocument: ['json', { sensitive: true, ignoreInCompare: true }],
    },
    describe: (r) => `Message to ${r.contactName}`,
  },
  hiddenExpenseRecoveryEmails: {
    label: 'Hidden-expense recovery emails',
    fields: {
      _id: ['id'],
      userId: ['ref', { required: true, refEntity: 'users' }],
      to: ['string', { required: true }],
      token: ['string', { required: true, sensitive: true }],
      tokenHash: ['string', { required: true, sensitive: true }],
      expiresAt: ['date', { required: true }],
      sentAt: ['date'],
      attempts: ['int', { default: 0, min: 0 }],
      createdAt: ['date', { required: true }],
      updatedAt: ['date', { required: true }],
      sourceDocument: ['json', { sensitive: true, ignoreInCompare: true }],
    },
    describe: (r) => `Recovery email · ${String(r.createdAt).slice(0, 10)}`,
  },
  auditLogs: {
    label: 'Migration audit log',
    // Append-only: imported entries are added when missing and never deleted or overwritten.
    appendOnly: true,
    fields: {
      _id: ['id'],
      createdAt: ['date', { required: true }],
      adminId: ['string'],
      adminEmail: ['string'],
      action: ['string', { required: true }],
      target: ['string'],
      details: ['json'],
      ip: ['string'],
    },
    describe: (r) => `${r.action} · ${String(r.createdAt).slice(0, 19)}`,
  },
};

// Order matters: parents before children (writes), reversed for deletes.
const ENTITY_ORDER = [
  'users',
  'expenses',
  'incomes',
  'budgets',
  'reminders',
  'reminderPayments',
  'passwordVaults',
  'scheduledMessages',
  'hiddenExpenseRecoveryEmails',
  'auditLogs',
];

const ID_RE = /^[a-f0-9]{24}$/;

function toId(value) {
  if (value == null) return null;
  const text =
    typeof value === 'object' && typeof value.toHexString === 'function'
      ? value.toHexString()
      : typeof value === 'object' && value.$oid
        ? value.$oid
        : String(value);
  return text.toLowerCase();
}

function toDate(value) {
  if (value == null || value === '') return null;
  const raw = typeof value === 'object' && value.$date ? value.$date : value;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function toMoney(value) {
  if (value == null || value === '') return null;
  const raw =
    typeof value === 'object' && value.$numberDecimal ? value.$numberDecimal : value.toString();
  if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(raw.trim())) return undefined;
  const number = Number(raw);
  if (!Number.isFinite(number) || Math.abs(number) >= 1e16) return undefined;
  const cents = Math.round(number * 100);
  if (Math.abs(number * 100 - cents) > 1e-6) return undefined;
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function toInt(value) {
  if (value == null || value === '') return null;
  const number = Number(typeof value === 'object' && value.$numberInt ? value.$numberInt : value);
  return Number.isInteger(number) ? number : undefined;
}

function toBool(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return undefined;
}

function toJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (typeof value !== 'object') return undefined;
  return JSON.parse(JSON.stringify(value));
}

// Converts a raw (adapter- or package-supplied) record into canonical form and validates it.
// Returns { record, errors }. Unknown fields are dropped.
function normalize(entity, raw) {
  const definition = ENTITIES[entity];
  const errors = [];
  const record = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { record: null, errors: ['record is not an object'] };
  }
  for (const [field, [type, options = {}]] of Object.entries(definition.fields)) {
    let value = raw[field];
    let converted;
    if (type === 'id' || type === 'ref') {
      converted = toId(value);
      if (converted != null && !ID_RE.test(converted)) {
        errors.push(`${field} is not a valid 24-character id`);
        converted = null;
      }
      if (type === 'id' && converted == null) errors.push(`${field} is missing`);
    } else if (type === 'string') {
      converted = value == null ? null : String(value);
      if (converted != null && options.lower) converted = converted.trim().toLowerCase();
      if (converted != null && options.maxLength && converted.length > options.maxLength) {
        errors.push(`${field} is longer than ${options.maxLength} characters`);
      }
      if (converted != null && options.enum && !options.enum.includes(converted)) {
        errors.push(`${field} must be one of ${options.enum.join(', ')}`);
      }
    } else if (type === 'money') converted = toMoney(value);
    else if (type === 'date') converted = toDate(value);
    else if (type === 'int') converted = toInt(value);
    else if (type === 'bool') converted = toBool(value);
    else if (type === 'json') converted = toJson(value);
    else if (type === 'subtypes') {
      converted = [];
      if (value != null && !Array.isArray(value)) errors.push(`${field} must be a list`);
      for (const [index, subtype] of (Array.isArray(value) ? value : []).entries()) {
        const id = toId(subtype?._id);
        const amount = toMoney(subtype?.amount);
        if (!id || !ID_RE.test(id)) errors.push(`subtypes.${index}._id is not a valid id`);
        if (amount === undefined || (amount != null && Number(amount) < 0.01)) {
          errors.push(`subtypes.${index}.amount is not a valid amount`);
        }
        converted.push({
          _id: id,
          type: subtype?.type == null ? '' : String(subtype.type),
          amount: amount ?? null,
          paymentMethod: subtype?.paymentMethod == null ? 'Cash' : String(subtype.paymentMethod),
        });
      }
    }
    if (converted === undefined) {
      errors.push(`${field} has an invalid ${type} value`);
      converted = null;
    }
    if (converted == null && options.default !== undefined) converted = options.default;
    if (converted == null && options.required) errors.push(`${field} is required`);
    if (converted != null && (type === 'money' || type === 'int')) {
      if (options.min != null && Number(converted) < options.min) {
        errors.push(`${field} must be at least ${options.min}`);
      }
      if (options.max != null && Number(converted) > options.max) {
        errors.push(`${field} must be at most ${options.max}`);
      }
    }
    record[field] = converted;
  }
  if (!errors.length && definition.check) {
    const problem = definition.check(record);
    if (problem) errors.push(problem);
  }
  return { record, errors };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function comparable(entity, record) {
  const out = {};
  for (const [field, [, options = {}]] of Object.entries(ENTITIES[entity].fields)) {
    if (!options.ignoreInCompare) out[field] = record[field] ?? null;
  }
  return out;
}

const sameRecord = (entity, a, b) => stable(comparable(entity, a)) === stable(comparable(entity, b));

function fieldDiff(entity, existing, incoming) {
  const diffs = [];
  for (const [field, [, options = {}]] of Object.entries(ENTITIES[entity].fields)) {
    if (options.ignoreInCompare || field === '_id') continue;
    const a = existing?.[field] ?? null;
    const b = incoming?.[field] ?? null;
    if (stable(a) === stable(b)) continue;
    const show = (value) => {
      if (value == null) return null;
      if (options.sensitive) return '•••• (protected value)';
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return text.length > 160 ? `${text.slice(0, 157)}…` : text;
    };
    diffs.push({ field, existing: show(a), incoming: show(b) });
  }
  return diffs;
}

module.exports = {
  FORMAT,
  FORMAT_VERSION,
  APP_SCHEMA_VERSION,
  ENTITIES,
  ENTITY_ORDER,
  ID_RE,
  normalize,
  sameRecord,
  fieldDiff,
  stable,
  toId,
  toDate,
  toMoney,
};
