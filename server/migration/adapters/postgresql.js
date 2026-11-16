// PostgreSQL adapter (the original SpendWise relational schema). Available when DATABASE_URL is
// configured on the server. Imports run in a single transaction, so they are all-or-nothing.
const { ENTITY, ENTITY_NAMES, normalize } = require('../model');

const TABLE = {
  users: 'users',
  expenses: 'expenses',
  incomes: 'incomes',
  budgets: 'budgets',
  reminders: 'reminders',
  passwordVaults: 'password_vaults',
  scheduledMessages: 'scheduled_messages',
  hiddenRecoveryEmails: 'hidden_expense_recovery_emails',
};
const snake = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const iso = (value) => (value == null ? null : new Date(value).toISOString());
const money = (value) => (value == null ? null : Number(value).toFixed(2));

// Column lists per table, in portable-field order (the key column first).
const COLUMNS = {
  users: ['id', 'name', 'avatar', 'email', 'password', 'passwordResetTokenHash', 'passwordResetExpires', 'hiddenExpenseKeyHash',
    'hiddenExpenseOtpHash', 'hiddenExpenseOtpExpires', 'hiddenExpenseOtpSentAt', 'hiddenExpenseOtpAttempts', 'createdAt', 'updatedAt', 'themePreferences'],
  expenses: ['id', 'userId', 'date', 'amount', 'item', 'category', 'subcategory', 'hasSubtypes', 'description', 'paymentMethod',
    'notes', 'isLocked', 'deletedAt', 'createdAt', 'updatedAt'],
  incomes: ['id', 'userId', 'date', 'amount', 'source', 'createdAt', 'updatedAt'],
  budgets: ['id', 'userId', 'month', 'year', 'limit', 'createdAt', 'updatedAt'],
  reminders: ['id', 'userId', 'title', 'dueDate', 'amount', 'paidAmount', 'completed', 'createdAt', 'updatedAt'],
  passwordVaults: ['userId', 'salt', 'iv', 'ciphertext', 'updatedAt'],
  scheduledMessages: ['id', 'userId', 'contactName', 'email', 'recipientConsented', 'channel', 'messageType', 'message', 'frequency',
    'intervalDays', 'timeZone', 'scheduledAt', 'nextSendAt', 'endAt', 'active', 'lockedAt', 'lastSentAt', 'lastError', 'createdAt', 'updatedAt'],
  hiddenRecoveryEmails: ['id', 'userId', 'to', 'token', 'tokenHash', 'expiresAt', 'sentAt', 'attempts', 'createdAt', 'updatedAt'],
};
const quote = (column) => `"${column}"`;

function rowToRecord(name, row) {
  const entity = ENTITY[name];
  const record = {};
  for (const [field, spec] of Object.entries(entity.fields)) {
    if (spec.type === 'array') continue;
    const value = row[snake(field)];
    record[field] =
      value == null ? null : spec.type === 'money' ? money(value) : spec.type === 'date' ? iso(value) : spec.type === 'int' ? Number(value) : value;
  }
  return record;
}

function recordToValues(name, record, columns) {
  const entity = ENTITY[name];
  return columns.map((field) => {
    const value = record[field];
    if (value == null) return field === 'themePreferences' ? '{}' : null;
    if (entity.fields[field].type === 'object') return JSON.stringify(value);
    return value;
  });
}

function createPostgresAdapter() {
  const { Pool, types } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  pool.on('error', () => {});
  // Keep numerics exact: read NUMERIC as text.
  const parsers = { getTypeParser: (oid, format) => (oid === 1700 ? (v) => v : types.getTypeParser(oid, format)) };
  let client = null; // set while an atomic import is running
  let columnsChecked = null;
  const query = (text, values) => (client || pool).query({ text, values, types: parsers });

  async function columnsFor(name) {
    if (!columnsChecked) {
      const { rows } = await query(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`,
      );
      columnsChecked = new Map();
      for (const { table_name: table, column_name: column } of rows) {
        if (!columnsChecked.has(table)) columnsChecked.set(table, new Set());
        columnsChecked.get(table).add(column);
      }
    }
    const available = columnsChecked.get(TABLE[name]);
    if (!available) throw Object.assign(new Error(`PostgreSQL table "${TABLE[name]}" does not exist`), { status: 400 });
    return COLUMNS[name].filter((field) => available.has(snake(field)));
  }

  async function upsertRow(name, record, conflictColumn) {
    const columns = await columnsFor(name);
    const values = recordToValues(name, record, columns);
    const names = columns.map((c) => quote(snake(c)));
    const updates = names.filter((c) => c !== quote(conflictColumn)).map((c) => `${c} = EXCLUDED.${c}`);
    await query(
      `INSERT INTO ${TABLE[name]} (${names.join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (${quote(conflictColumn)}) DO UPDATE SET ${updates.join(', ')}`,
      values,
    );
  }

  return {
    key: 'postgresql',
    type: 'postgresql',
    typeLabel: 'PostgreSQL',
    role: 'Connected PostgreSQL database',
    atomic: true,
    supports: (name) => Boolean(TABLE[name]),
    async info() {
      const { rows } = await query(`SELECT current_database() AS database, current_setting('server_version') AS version`);
      return { key: 'postgresql', type: 'postgresql', typeLabel: 'PostgreSQL', role: 'Connected PostgreSQL database', ...rows[0], transactions: true };
    },
    async counts() {
      const out = {};
      for (const name of ENTITY_NAMES) {
        if (!TABLE[name]) continue;
        out[name] = (await query(`SELECT count(*)::int AS n FROM ${TABLE[name]}`)).rows[0].n;
      }
      return out;
    },
    async exportAll(names = ENTITY_NAMES) {
      const out = {};
      for (const name of names.filter((n) => TABLE[n])) {
        const entity = ENTITY[name];
        const { rows } = await query(`SELECT * FROM ${TABLE[name]}`);
        const records = rows.map((row) => rowToRecord(name, row));
        if (name === 'expenses') {
          const { rows: subtypes } = await query('SELECT * FROM expense_subtypes ORDER BY expense_id, ordinal');
          const byParent = new Map();
          for (const s of subtypes) {
            if (!byParent.has(s.expense_id)) byParent.set(s.expense_id, []);
            byParent.get(s.expense_id).push({ id: s.id, type: s.type, amount: money(s.amount), paymentMethod: s.payment_method });
          }
          for (const record of records) record.subtypes = byParent.get(record.id) || [];
        }
        if (name === 'reminders') {
          const { rows: payments } = await query('SELECT * FROM reminder_payments ORDER BY reminder_id, paid_at, created_at, id');
          const byParent = new Map();
          for (const p of payments) {
            if (!byParent.has(p.reminder_id)) byParent.set(p.reminder_id, []);
            byParent.get(p.reminder_id).push({ id: p.id, amount: money(p.amount), paidAt: iso(p.paid_at), createdAt: iso(p.created_at) });
          }
          for (const record of records) record.payments = byParent.get(record.id) || [];
        }
        if (name === 'users') for (const record of records) record.themePreferences ??= {};
        out[name] = records.map((r) => normalize(entity, r)).sort((a, b) => (a[entity.key] < b[entity.key] ? -1 : 1));
      }
      return out;
    },
    async upsert(name, records) {
      const entity = ENTITY[name];
      for (const record of records) {
        await upsertRow(name, record, snake(entity.key));
        if (name === 'expenses') {
          await query('DELETE FROM expense_subtypes WHERE expense_id = $1', [record.id]);
          for (const [ordinal, s] of record.subtypes.entries())
            await query(
              'INSERT INTO expense_subtypes (id, expense_id, ordinal, type, amount, payment_method) VALUES ($1,$2,$3,$4,$5,$6)',
              [s.id, record.id, ordinal, s.type, s.amount, s.paymentMethod],
            );
        }
        if (name === 'reminders') {
          await query('DELETE FROM reminder_payments WHERE reminder_id = $1', [record.id]);
          for (const p of record.payments)
            await query('INSERT INTO reminder_payments (id, reminder_id, amount, paid_at, created_at) VALUES ($1,$2,$3,$4,$5)', [
              p.id, record.id, p.amount, p.paidAt, p.createdAt,
            ]);
        }
      }
    },
    async remove(name, keys) {
      if (!keys.length) return 0;
      const column = snake(ENTITY[name].key);
      return (await query(`DELETE FROM ${TABLE[name]} WHERE ${quote(column)} = ANY($1::text[])`, [keys])).rowCount;
    },
    async removeOwnedBy(name, userIds) {
      if (!userIds.length) return 0;
      return (await query(`DELETE FROM ${TABLE[name]} WHERE user_id = ANY($1::text[])`, [userIds])).rowCount;
    },
    async removeAll(name) {
      return (await query(`DELETE FROM ${TABLE[name]}`)).rowCount;
    },
    // Runs the whole import in one transaction; any failure rolls everything back.
    async runAtomic(work) {
      client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work();
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
        client = null;
      }
    },
  };
}

module.exports = { createPostgresAdapter, TABLE };
