// Translation between this application's portable model (./model.js) and the shared,
// database-independent package model (./canonical.js, identical to the PostgreSQL edition's).
//
// Packages exchanged between SpendWise installations always carry the shared model, so a package
// exported by the PostgreSQL edition imports here and vice versa. Differences handled here:
//   - record ids are `_id` in the shared model and `id` here
//   - reminder payments are a separate `reminderPayments` data set in the shared model and are
//     embedded as `reminders[].payments` here
//   - recovery emails / audit log use different data set names and audit entries use a different
//     shape (adminId/adminEmail/target/ip vs actor/details)
// Values with no counterpart on the other side are kept under details.__interchange so a round
// trip (A -> B -> A) restores them.
const canonical = require('./canonical');
const { ENTITY } = require('./model');

const SHARED_TO_LOCAL_NAME = {
  users: 'users',
  expenses: 'expenses',
  incomes: 'incomes',
  budgets: 'budgets',
  reminders: 'reminders',
  passwordVaults: 'passwordVaults',
  scheduledMessages: 'scheduledMessages',
  hiddenExpenseRecoveryEmails: 'hiddenRecoveryEmails',
  auditLogs: 'auditLog',
  // reminderPayments: embedded into reminders
};
const EXTRA = '__interchange';

const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const jsonCopy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const idOf = (record) => (record?._id ?? record?.id ?? null);

// Same policy as the PostgreSQL edition's exports: valid records are canonicalised, records that
// fail validation are kept as they are so the importer reports them instead of losing them.
function canonicalise(entity, raw) {
  const { record, errors } = canonical.normalize(entity, raw);
  return errors.length ? jsonCopy(raw) : record;
}

// Builds a record holding exactly the fields this application's model defines.
function pickLocal(localName, source, overrides = {}) {
  const out = {};
  for (const field of Object.keys(ENTITY[localName].fields)) {
    if (Object.prototype.hasOwnProperty.call(overrides, field)) out[field] = overrides[field];
    else if (field === 'id') out.id = idOf(source);
    else out[field] = source?.[field] ?? null;
  }
  return out;
}

// --------------------------------------------------------------- shared -> local (import)

function auditToLocal(record) {
  let details = record.details;
  const extra = {};
  if (details == null) details = {};
  else if (!isPlainObject(details)) {
    extra.detailsValue = details;
    details = {};
  } else details = { ...details };
  if (record.target != null) extra.target = record.target;
  if (record.ip != null) extra.ip = record.ip;
  const carried = isPlainObject(details[EXTRA]) ? details[EXTRA] : null;
  delete details[EXTRA];
  const actorName = carried?.actorName ?? null;
  if (Object.keys(extra).length) details[EXTRA] = extra;
  return pickLocal('auditLog', record, {
    at: record.createdAt ?? null,
    actor: { id: record.adminId ?? null, email: record.adminEmail ?? null, name: actorName },
    details,
  });
}

// entities: shared-model data sets (as found in a package). Returns local-model data sets.
// Throws (before anything is written) if a reminder payment refers to a reminder that is not in
// the package, because such a payment cannot be represented here and would otherwise be lost.
function fromShared(entities) {
  const shared = {};
  for (const name of canonical.ENTITY_ORDER) {
    shared[name] = (Array.isArray(entities?.[name]) ? entities[name] : []).map((raw) => canonicalise(name, raw));
  }

  const paymentsByReminder = new Map();
  for (const payment of shared.reminderPayments) {
    const reminderId = payment?.reminderId == null ? null : String(payment.reminderId).toLowerCase();
    if (!paymentsByReminder.has(reminderId)) paymentsByReminder.set(reminderId, []);
    paymentsByReminder.get(reminderId).push(payment);
  }
  const reminderIds = new Set(shared.reminders.map((r) => (idOf(r) == null ? null : String(idOf(r)).toLowerCase())));
  const orphans = [...paymentsByReminder.entries()].filter(([id]) => !reminderIds.has(id));
  if (orphans.length) {
    const count = orphans.reduce((sum, [, list]) => sum + list.length, 0);
    throw Object.assign(
      new Error(`The package contains ${count} reminder payment(s) whose reminder is not in the package`),
      { status: 400 },
    );
  }
  const byTime = (a, b) =>
    String(a.paidAt).localeCompare(String(b.paidAt)) ||
    String(a.createdAt).localeCompare(String(b.createdAt)) ||
    String(idOf(a)).localeCompare(String(idOf(b)));

  return {
    users: shared.users.map((r) =>
      pickLocal('users', r, {
        avatar: r.avatar ?? '',
        themePreferences: isPlainObject(r.themePreferences) ? r.themePreferences : {},
      }),
    ),
    expenses: shared.expenses.map((r) =>
      pickLocal('expenses', r, {
        subtypes: Array.isArray(r.subtypes)
          ? r.subtypes.map((s) => ({ id: idOf(s), type: s?.type ?? '', amount: s?.amount ?? null, paymentMethod: s?.paymentMethod ?? 'Cash' }))
          : r.subtypes ?? [],
      }),
    ),
    incomes: shared.incomes.map((r) => pickLocal('incomes', r)),
    budgets: shared.budgets.map((r) => pickLocal('budgets', r)),
    reminders: shared.reminders.map((r) =>
      pickLocal('reminders', r, {
        payments: (paymentsByReminder.get(idOf(r) == null ? null : String(idOf(r)).toLowerCase()) || [])
          .slice()
          .sort(byTime)
          .map((p) => ({ id: idOf(p), amount: p.amount ?? null, paidAt: p.paidAt ?? null, createdAt: p.createdAt ?? null })),
      }),
    ),
    passwordVaults: shared.passwordVaults.map((r) => pickLocal('passwordVaults', r, { userId: r.userId ?? idOf(r) })),
    scheduledMessages: shared.scheduledMessages.map((r) => pickLocal('scheduledMessages', r)),
    hiddenRecoveryEmails: shared.hiddenExpenseRecoveryEmails.map((r) => pickLocal('hiddenRecoveryEmails', r)),
    auditLog: shared.auditLogs.map(auditToLocal),
  };
}

// --------------------------------------------------------------- local -> shared (export)

function auditToShared(record) {
  const details = isPlainObject(record.details) ? { ...record.details } : {};
  const carried = isPlainObject(details[EXTRA]) ? details[EXTRA] : {};
  delete details[EXTRA];
  const actor = isPlainObject(record.actor) ? record.actor : {};
  const extra = actor.name != null ? { actorName: actor.name } : null;
  let sharedDetails = Object.prototype.hasOwnProperty.call(carried, 'detailsValue') ? carried.detailsValue : details;
  if (extra) sharedDetails = isPlainObject(sharedDetails) ? { ...sharedDetails, [EXTRA]: extra } : { value: sharedDetails, [EXTRA]: extra };
  return {
    _id: record.id,
    createdAt: record.at,
    adminId: actor.id ?? null,
    adminEmail: actor.email ?? null,
    action: record.action,
    target: carried.target ?? null,
    details: sharedDetails,
    ip: carried.ip ?? null,
  };
}

// entities: local-model data sets (from the adapters). Returns shared-model data sets with every
// shared data set present (empty when this database has none).
function toShared(entities) {
  const list = (name) => (Array.isArray(entities?.[name]) ? entities[name] : []);
  const renameId = ({ id, ...rest }) => ({ _id: id, ...rest });
  const raw = {
    users: list('users').map(renameId),
    expenses: list('expenses').map(({ subtypes, ...rest }) => ({
      ...renameId(rest),
      subtypes: (subtypes || []).map(renameId),
    })),
    incomes: list('incomes').map(renameId),
    budgets: list('budgets').map(renameId),
    reminders: list('reminders').map(({ payments, ...rest }) => renameId(rest)),
    reminderPayments: list('reminders').flatMap((reminder) =>
      (reminder.payments || []).map((p) => ({
        _id: p.id,
        reminderId: reminder.id,
        amount: p.amount,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
    ),
    passwordVaults: list('passwordVaults').map((v) => ({ _id: v.userId, ...v })),
    scheduledMessages: list('scheduledMessages').map(renameId),
    hiddenExpenseRecoveryEmails: list('hiddenRecoveryEmails').map(renameId),
    auditLogs: list('auditLog').map(auditToShared),
  };
  const out = {};
  for (const name of canonical.ENTITY_ORDER) out[name] = raw[name].map((record) => canonicalise(name, record));
  return out;
}

// Manifest record counts expressed with this application's data set names (for display).
function localCounts(sharedEntities) {
  const out = {};
  for (const [sharedName, info] of Object.entries(sharedEntities || {})) {
    const localName = SHARED_TO_LOCAL_NAME[sharedName];
    if (localName && ENTITY[localName]) out[localName] = { label: ENTITY[localName].label, count: info.count };
  }
  return out;
}

module.exports = { fromShared, toShared, localCounts };
