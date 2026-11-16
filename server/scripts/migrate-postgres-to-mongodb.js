// One-time copy of every SpendWise PostgreSQL record into MongoDB.
//
//   DATABASE_URL  source PostgreSQL database (read-only snapshot; never modified)
//   MONGODB_URI   destination MongoDB database (every SpendWise collection must be empty)
//   MIGRATION_EXPORT_DIR  optional; defaults to server/migration-data (gitignored)
//
// Writes a lossless JSON export of PostgreSQL and a verification report next to it.
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool, types } = require('pg');
const { ObjectId, Decimal128 } = require('mongodb');
const mongo = require('../db');
const { ensureSchema } = require('../db/schema');

const ARCHIVE = 'pgmigrationarchive';
const exportDirectory = path.resolve(
  process.env.MIGRATION_EXPORT_DIR || path.join(__dirname, '..', 'migration-data'),
);
const tables = [
  'users',
  'expenses',
  'expense_subtypes',
  'incomes',
  'budgets',
  'reminders',
  'reminder_payments',
  'password_vaults',
  'scheduled_messages',
  'hidden_expense_recovery_emails',
  'migration_imported_records',
];

// Keep timestamps and numerics as the exact text PostgreSQL returns so the export is lossless.
const parseTimestampText = types.getTypeParser(1184);
const rawText = (value) => value;

const oid = (hex, where) => {
  if (typeof hex !== 'string' || !/^[a-f\d]{24}$/i.test(hex)) throw new Error(`${where}: invalid id ${hex}`);
  return ObjectId.createFromHexString(hex);
};
const dec = (text) => (text == null ? null : Decimal128.fromString(text));
const ts = (text) => (text == null ? null : parseTimestampText(text));
const iso = (value) => (value == null ? null : new Date(value).toISOString());

function transform(rows) {
  const issues = [];
  const warnings = [];
  const byId = (list) => new Map(list.map((row) => [row.id, row]));
  const users = byId(rows.users);
  const expenses = byId(rows.expenses);
  const reminders = byId(rows.reminders);
  const requireUser = (table, row) => {
    if (!users.has(row.user_id)) issues.push(`${table} ${row.id || row.user_id}: owner ${row.user_id} not found`);
  };

  let precisionTrimmed = 0;
  const countPrecision = (text) => {
    const fraction = /\.(\d+)/.exec(text || '')?.[1] || '';
    if (fraction.slice(3).replace(/0/g, '')) precisionTrimmed += 1;
  };
  for (const table of tables)
    for (const row of rows[table])
      for (const [column, value] of Object.entries(row))
        if (/(_at|_expires|^date|due_date)$/.test(column) && typeof value === 'string') countPrecision(value);

  const subtypes = new Map();
  for (const row of rows.expense_subtypes) {
    if (!expenses.has(row.expense_id)) issues.push(`expense_subtypes ${row.id}: expense ${row.expense_id} not found`);
    if (!subtypes.has(row.expense_id)) subtypes.set(row.expense_id, []);
    subtypes.get(row.expense_id).push(row);
  }
  const payments = new Map();
  for (const row of rows.reminder_payments) {
    if (!reminders.has(row.reminder_id)) issues.push(`reminder_payments ${row.id}: reminder ${row.reminder_id} not found`);
    if (!payments.has(row.reminder_id)) payments.set(row.reminder_id, []);
    payments.get(row.reminder_id).push(row);
  }

  const archive = [];
  const keepSource = (table, recordId, sourceDocument) => {
    if (sourceDocument && Object.keys(sourceDocument).length)
      archive.push({
        _id: `${table}:${recordId}`,
        kind: 'source_document',
        table,
        recordId,
        documentJson: JSON.stringify(sourceDocument),
      });
  };

  const docs = {};
  docs.users = rows.users.map((r) => {
    keepSource('users', r.id, r.source_document);
    return {
      _id: oid(r.id, 'users'),
      name: r.name,
      avatar: r.avatar,
      email: r.email,
      password: r.password,
      passwordResetTokenHash: r.password_reset_token_hash,
      passwordResetExpires: ts(r.password_reset_expires),
      hiddenExpenseKeyHash: r.hidden_expense_key_hash,
      hiddenExpenseOtpHash: r.hidden_expense_otp_hash,
      hiddenExpenseOtpExpires: ts(r.hidden_expense_otp_expires),
      hiddenExpenseOtpSentAt: ts(r.hidden_expense_otp_sent_at),
      hiddenExpenseOtpAttempts: r.hidden_expense_otp_attempts,
      createdAt: ts(r.created_at),
      updatedAt: ts(r.updated_at),
      themePreferences: r.theme_preferences,
    };
  });
  docs.expenses = rows.expenses.map((r) => {
    requireUser('expenses', r);
    keepSource('expenses', r.id, r.source_document);
    const children = (subtypes.get(r.id) || []).sort((a, b) => a.ordinal - b.ordinal);
    if (children.some((s, index) => s.ordinal !== index))
      warnings.push(`expense ${r.id}: subtype ordinals were not contiguous; array order preserves them`);
    return {
      _id: oid(r.id, 'expenses'),
      userId: oid(r.user_id, 'expenses.user_id'),
      date: ts(r.date),
      amount: dec(r.amount),
      item: r.item,
      category: r.category,
      subcategory: r.subcategory,
      hasSubtypes: r.has_subtypes,
      subtypes: children.map((s) => {
        keepSource('expense_subtypes', s.id, s.source_document);
        return {
          _id: oid(s.id, 'expense_subtypes'),
          type: s.type,
          amount: dec(s.amount),
          paymentMethod: s.payment_method,
        };
      }),
      description: r.description,
      paymentMethod: r.payment_method,
      notes: r.notes,
      isLocked: r.is_locked,
      deletedAt: ts(r.deleted_at),
      createdAt: ts(r.created_at),
      updatedAt: ts(r.updated_at),
    };
  });
  docs.incomes = rows.incomes.map((r) => {
    requireUser('incomes', r);
    keepSource('incomes', r.id, r.source_document);
    return {
      _id: oid(r.id, 'incomes'),
      userId: oid(r.user_id, 'incomes.user_id'),
      date: ts(r.date),
      amount: dec(r.amount),
      source: r.source,
      createdAt: ts(r.created_at),
      updatedAt: ts(r.updated_at),
    };
  });
  docs.budgets = rows.budgets.map((r) => {
    requireUser('budgets', r);
    keepSource('budgets', r.id, r.source_document);
    return {
      _id: oid(r.id, 'budgets'),
      userId: oid(r.user_id, 'budgets.user_id'),
      month: r.month,
      year: r.year,
      limit: dec(r.limit),
      createdAt: ts(r.created_at),
      updatedAt: ts(r.updated_at),
    };
  });
  docs.reminders = rows.reminders.map((r) => {
    requireUser('reminders', r);
    keepSource('reminders', r.id, r.source_document);
    const children = (payments.get(r.id) || []).sort(
      (a, b) => ts(a.paid_at) - ts(b.paid_at) || ts(a.created_at) - ts(b.created_at) || (a.id < b.id ? -1 : 1),
    );
    return {
      _id: oid(r.id, 'reminders'),
      userId: oid(r.user_id, 'reminders.user_id'),
      title: r.title,
      dueDate: ts(r.due_date),
      amount: dec(r.amount),
      paidAmount: dec(r.paid_amount),
      completed: r.completed,
      payments: children.map((p) => {
        keepSource('reminder_payments', p.id, p.source_document);
        return {
          _id: oid(p.id, 'reminder_payments'),
          amount: dec(p.amount),
          paidAt: ts(p.paid_at),
          createdAt: ts(p.created_at),
        };
      }),
      createdAt: ts(r.created_at),
      updatedAt: ts(r.updated_at),
    };
  });
  docs.passwordvaults = rows.password_vaults.map((r) => {
    requireUser('password_vaults', r);
    return {
      _id: oid(r.user_id, 'password_vaults.user_id'),
      userId: oid(r.user_id, 'password_vaults.user_id'),
      salt: r.salt,
      iv: r.iv,
      ciphertext: r.ciphertext,
      updatedAt: ts(r.updated_at),
    };
  });
  docs.scheduledmessages = rows.scheduled_messages.map((r) => {
    requireUser('scheduled_messages', r);
    keepSource('scheduled_messages', r.id, r.source_document);
    return {
      _id: oid(r.id, 'scheduled_messages'),
      userId: oid(r.user_id, 'scheduled_messages.user_id'),
      contactName: r.contact_name,
      email: r.email,
      recipientConsented: r.recipient_consented,
      channel: r.channel,
      messageType: r.message_type,
      message: r.message,
      frequency: r.frequency,
      intervalDays: r.interval_days,
      timeZone: r.time_zone,
      scheduledAt: ts(r.scheduled_at),
      nextSendAt: ts(r.next_send_at),
      endAt: ts(r.end_at),
      active: r.active,
      lockedAt: ts(r.locked_at),
      lastSentAt: ts(r.last_sent_at),
      lastError: r.last_error,
      createdAt: ts(r.created_at),
      updatedAt: ts(r.updated_at),
    };
  });
  docs.hiddenexpenserecoveryemails = rows.hidden_expense_recovery_emails.map((r) => {
    requireUser('hidden_expense_recovery_emails', r);
    keepSource('hidden_expense_recovery_emails', r.id, r.source_document);
    return {
      _id: oid(r.id, 'hidden_expense_recovery_emails'),
      userId: oid(r.user_id, 'hidden_expense_recovery_emails.user_id'),
      to: r.to,
      token: r.token,
      tokenHash: r.token_hash,
      expiresAt: ts(r.expires_at),
      sentAt: ts(r.sent_at),
      attempts: r.attempts,
      createdAt: ts(r.created_at),
      updatedAt: ts(r.updated_at),
    };
  });
  for (const r of rows.migration_imported_records)
    archive.push({
      _id: `imported:${r.collection}:${r.source_id}`,
      kind: 'imported_record',
      collection: r.collection,
      sourceId: r.source_id,
      importedAt: ts(r.imported_at),
    });
  docs[ARCHIVE] = archive;
  if (precisionTrimmed)
    warnings.push(
      `${precisionTrimmed} timestamps had sub-millisecond digits; MongoDB dates keep millisecond precision (the API always returned milliseconds)`,
    );
  return { docs, issues, warnings };
}

// Converts MongoDB documents back into PostgreSQL row form for a field-by-field comparison.
const hex = (value) => (value == null ? null : value.toHexString());
const decText = (value) => (value == null ? null : value.toString());
function backToRows(docs) {
  const rows = {};
  rows.users = docs.users.map((d) => ({
    id: hex(d._id), name: d.name, avatar: d.avatar, email: d.email, password: d.password,
    password_reset_token_hash: d.passwordResetTokenHash, password_reset_expires: iso(d.passwordResetExpires),
    hidden_expense_key_hash: d.hiddenExpenseKeyHash, hidden_expense_otp_hash: d.hiddenExpenseOtpHash,
    hidden_expense_otp_expires: iso(d.hiddenExpenseOtpExpires), hidden_expense_otp_sent_at: iso(d.hiddenExpenseOtpSentAt),
    hidden_expense_otp_attempts: d.hiddenExpenseOtpAttempts, created_at: iso(d.createdAt), updated_at: iso(d.updatedAt),
    theme_preferences: d.themePreferences,
  }));
  rows.expenses = docs.expenses.map((d) => ({
    id: hex(d._id), user_id: hex(d.userId), date: iso(d.date), amount: decText(d.amount), item: d.item,
    category: d.category, subcategory: d.subcategory, has_subtypes: d.hasSubtypes, description: d.description,
    payment_method: d.paymentMethod, notes: d.notes, is_locked: d.isLocked, deleted_at: iso(d.deletedAt),
    created_at: iso(d.createdAt), updated_at: iso(d.updatedAt),
  }));
  rows.expense_subtypes = docs.expenses.flatMap((d) =>
    d.subtypes.map((s, ordinal) => ({
      id: hex(s._id), expense_id: hex(d._id), ordinal, type: s.type, amount: decText(s.amount), payment_method: s.paymentMethod,
    })),
  );
  rows.incomes = docs.incomes.map((d) => ({
    id: hex(d._id), user_id: hex(d.userId), date: iso(d.date), amount: decText(d.amount), source: d.source,
    created_at: iso(d.createdAt), updated_at: iso(d.updatedAt),
  }));
  rows.budgets = docs.budgets.map((d) => ({
    id: hex(d._id), user_id: hex(d.userId), month: d.month, year: d.year, limit: decText(d.limit),
    created_at: iso(d.createdAt), updated_at: iso(d.updatedAt),
  }));
  rows.reminders = docs.reminders.map((d) => ({
    id: hex(d._id), user_id: hex(d.userId), title: d.title, due_date: iso(d.dueDate), amount: decText(d.amount),
    paid_amount: decText(d.paidAmount), completed: d.completed, created_at: iso(d.createdAt), updated_at: iso(d.updatedAt),
  }));
  rows.reminder_payments = docs.reminders.flatMap((d) =>
    d.payments.map((p) => ({
      id: hex(p._id), reminder_id: hex(d._id), amount: decText(p.amount), paid_at: iso(p.paidAt), created_at: iso(p.createdAt),
    })),
  );
  rows.password_vaults = docs.passwordvaults.map((d) => ({
    user_id: hex(d.userId), salt: d.salt, iv: d.iv, ciphertext: d.ciphertext, updated_at: iso(d.updatedAt),
  }));
  rows.scheduled_messages = docs.scheduledmessages.map((d) => ({
    id: hex(d._id), user_id: hex(d.userId), contact_name: d.contactName, email: d.email,
    recipient_consented: d.recipientConsented, channel: d.channel, message_type: d.messageType, message: d.message,
    frequency: d.frequency, interval_days: d.intervalDays, time_zone: d.timeZone, scheduled_at: iso(d.scheduledAt),
    next_send_at: iso(d.nextSendAt), end_at: iso(d.endAt), active: d.active, locked_at: iso(d.lockedAt),
    last_sent_at: iso(d.lastSentAt), last_error: d.lastError, created_at: iso(d.createdAt), updated_at: iso(d.updatedAt),
  }));
  rows.hidden_expense_recovery_emails = docs.hiddenexpenserecoveryemails.map((d) => ({
    id: hex(d._id), user_id: hex(d.userId), to: d.to, token: d.token, token_hash: d.tokenHash,
    expires_at: iso(d.expiresAt), sent_at: iso(d.sentAt), attempts: d.attempts,
    created_at: iso(d.createdAt), updated_at: iso(d.updatedAt),
  }));
  return rows;
}

// PostgreSQL row in comparable form: timestamps at millisecond precision, numerics as text.
function normalizePgRow(row) {
  const result = {};
  for (const [column, value] of Object.entries(row)) {
    if (column === 'source_document') continue;
    result[column] =
      typeof value === 'string' && /(_at|_expires|^date|due_date)$/.test(column) ? iso(ts(value)) : value;
  }
  return result;
}

const stable = (value) =>
  JSON.stringify(value, (key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.keys(entry).sort().map((k) => [k, entry[k]]))
      : entry,
  );

const report = { startedAt: new Date().toISOString(), status: 'failed' };

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must point to the source PostgreSQL database');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI must point to the destination MongoDB database');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  // 1. Destination safety checks: never overwrite existing MongoDB data.
  const db = await mongo.connect();
  report.destinationDatabase = db.databaseName;
  if (process.env.MONGO_URI) {
    const legacy = new URL(process.env.MONGO_URI.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.replace(/^\/+/, '');
    const target = new URL(process.env.MONGODB_URI.replace(/^mongodb(\+srv)?:/, 'http:'));
    const legacyHost = new URL(process.env.MONGO_URI.replace(/^mongodb(\+srv)?:/, 'http:')).host;
    if (legacy && legacy === db.databaseName && legacyHost === target.host)
      throw new Error(`Refusing to import into "${db.databaseName}": it is the legacy MONGO_URI database`);
  }
  const targetNames = [...Object.values(mongo.COLLECTIONS), ARCHIVE];
  for (const name of targetNames) {
    const count = await db.collection(name).countDocuments({}, { limit: 1 });
    if (count) throw new Error(`Refusing to import: destination collection "${name}" already contains documents`);
  }

  // 2. Consistent read-only snapshot of PostgreSQL.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const rows = {};
  const sourceTotals = {};
  try {
    const parsers = {
      getTypeParser: (oidType, format) =>
        oidType === 1184 || oidType === 1700 ? rawText : types.getTypeParser(oidType, format),
    };
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const table of tables) {
      const order = table === 'password_vaults' ? 'user_id' : table === 'migration_imported_records' ? 'collection, source_id' : 'id';
      const result = await client.query({ text: `SELECT * FROM ${table} ORDER BY ${order}`, types: parsers });
      rows[table] = result.rows;
    }
    const totals = await client.query({
      text: `SELECT u.id,
        (SELECT COALESCE(sum(amount),0)::text FROM expenses WHERE user_id = u.id) expenses,
        (SELECT COALESCE(sum(s.amount),0)::text FROM expense_subtypes s JOIN expenses e ON e.id = s.expense_id WHERE e.user_id = u.id) subtypes,
        (SELECT COALESCE(sum(amount),0)::text FROM incomes WHERE user_id = u.id) incomes,
        (SELECT COALESCE(sum("limit"),0)::text FROM budgets WHERE user_id = u.id) budgets,
        (SELECT COALESCE(sum(amount),0)::text FROM reminders WHERE user_id = u.id) reminders,
        (SELECT COALESCE(sum(paid_amount),0)::text FROM reminders WHERE user_id = u.id) reminders_paid,
        (SELECT COALESCE(sum(p.amount),0)::text FROM reminder_payments p JOIN reminders r ON r.id = p.reminder_id WHERE r.user_id = u.id) payments
        FROM users u ORDER BY u.id`,
    });
    for (const row of totals.rows) {
      const { id, ...sums } = row;
      sourceTotals[id] = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, Number(v).toFixed(2)]));
    }
    await client.query('COMMIT');
  } finally {
    client.release();
    await pool.end();
  }
  report.sourceCounts = Object.fromEntries(tables.map((t) => [t, rows[t].length]));

  // 3. Lossless export before anything is written.
  await fs.mkdir(exportDirectory, { recursive: true });
  const exportFile = path.join(exportDirectory, `postgres-export-${stamp}.json`);
  const exportText = `${JSON.stringify({ exportedAt: report.startedAt, tables: rows }, null, 1)}\n`;
  await fs.writeFile(exportFile, exportText, { flag: 'wx' });
  report.export = {
    file: path.basename(exportFile),
    bytes: Buffer.byteLength(exportText),
    sha256: crypto.createHash('sha256').update(exportText).digest('hex'),
  };

  // 4. Transform and validate relationships.
  const { docs, issues, warnings } = transform(rows);
  report.warnings = warnings;
  if (issues.length) {
    report.issues = issues;
    throw new Error(`Source data has ${issues.length} integrity issue(s); nothing was imported`);
  }

  // 5. Create validators and indexes first so every document is checked on insert.
  await ensureSchema(db);
  const inserted = {};
  const order = ['users', 'expenses', 'incomes', 'budgets', 'reminders', 'passwordvaults', 'scheduledmessages', 'hiddenexpenserecoveryemails', ARCHIVE];
  try {
    for (const name of order) {
      inserted[name] = [];
      if (!docs[name].length) continue;
      const result = await db.collection(name).insertMany(docs[name], { ordered: true });
      inserted[name] = Object.values(result.insertedIds);
    }
  } catch (error) {
    for (const [name, ids] of Object.entries(inserted))
      if (ids.length) await db.collection(name).deleteMany({ _id: { $in: ids } });
    report.importError = error.errInfo ? JSON.stringify(error.errInfo).slice(0, 4000) : error.message;
    throw new Error(`Import failed and was rolled back: ${error.message}`);
  }

  // 6. Verification: counts, identifiers, every field of every record, totals, indexes.
  const readBack = {};
  for (const name of order) readBack[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
  const roundTrip = backToRows(readBack);
  const verification = { counts: {}, fieldMismatches: [], totals: {}, indexes: {} };
  for (const table of tables.filter((t) => t !== 'migration_imported_records')) {
    const key = table === 'password_vaults' ? 'user_id' : 'id';
    const source = new Map(rows[table].map((r) => [r[key], stable(normalizePgRow(r))]));
    const target = new Map(roundTrip[table].map((r) => [r[key], stable(r)]));
    const missing = [...source.keys()].filter((id) => !target.has(id));
    const extra = [...target.keys()].filter((id) => !source.has(id));
    let mismatched = 0;
    for (const [id, value] of source)
      if (target.has(id) && target.get(id) !== value) {
        mismatched += 1;
        verification.fieldMismatches.push({ table, id, postgres: value, mongodb: target.get(id) });
      }
    verification.counts[table] = { postgres: source.size, mongodb: target.size, missing: missing.length, extra: extra.length, mismatched };
  }
  const archiveExpected = docs[ARCHIVE].length;
  verification.counts[ARCHIVE] = { expected: archiveExpected, mongodb: readBack[ARCHIVE].length };

  const sum = (values) => values.reduce((acc, v) => acc + (v == null ? 0 : Number(v.toString())), 0);
  for (const user of readBack.users) {
    const id = user._id.toHexString();
    const mine = (list) => list.filter((d) => d.userId.equals(user._id));
    const reminders = mine(readBack.reminders);
    const target = {
      expenses: sum(mine(readBack.expenses).map((d) => d.amount)),
      subtypes: sum(mine(readBack.expenses).flatMap((d) => d.subtypes.map((s) => s.amount))),
      incomes: sum(mine(readBack.incomes).map((d) => d.amount)),
      budgets: sum(mine(readBack.budgets).map((d) => d.limit)),
      reminders: sum(reminders.map((d) => d.amount)),
      reminders_paid: sum(reminders.map((d) => d.paidAmount)),
      payments: sum(reminders.flatMap((d) => d.payments.map((p) => p.amount))),
    };
    const fixed = Object.fromEntries(Object.entries(target).map(([k, v]) => [k, v.toFixed(2)]));
    verification.totals[id] = { postgres: sourceTotals[id], mongodb: fixed, match: stable(fixed) === stable(sourceTotals[id]) };
  }
  for (const name of Object.values(mongo.COLLECTIONS))
    verification.indexes[name] = (await db.collection(name).indexes()).map((i) => `${i.name}${i.unique ? ' (unique)' : ''}`);
  report.verification = verification;

  const countsOk = Object.values(verification.counts).every(
    (c) => (c.expected ?? c.postgres) === c.mongodb && !c.missing && !c.extra && !c.mismatched,
  );
  const totalsOk = Object.values(verification.totals).every((t) => t.match);
  if (!countsOk || !totalsOk) {
    report.status = 'verification_failed';
    throw new Error('Verification failed: see the report. Imported data was left in place for inspection.');
  }
  report.status = 'success';
  report.finishedAt = new Date().toISOString();
  return report;
}

let finalReport = report;
main()
  .catch((error) => {
    if (report.status !== 'verification_failed') report.status = 'failed';
    report.error = error.message;
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongo.close();
    if (finalReport) {
      const file = path.join(exportDirectory, `mongodb-import-report-${Date.now()}.json`);
      await fs.mkdir(exportDirectory, { recursive: true });
      await fs.writeFile(file, `${JSON.stringify(finalReport, null, 2)}\n`);
      const { verification, ...summary } = finalReport;
      console.log(JSON.stringify({ ...summary, counts: verification?.counts }, null, 2));
      console.log(`Report: ${file}`);
    }
  });
