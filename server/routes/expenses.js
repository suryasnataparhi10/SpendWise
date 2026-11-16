const express = require('express');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { collection, withTransaction } = require('../db');
const { financialExpenses } = require('../db/financial');
const auth = require('../middleware/auth');
const {
  parseMoney,
  decimal,
  toCents,
  fromCents,
  toApi,
  objectId,
  objectIds,
  newId,
} = require('../db/records');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
const dashboard = express.Router();
const recoveryEmail = process.env.HIDDEN_EXPENSE_RECOVERY_EMAIL || '';
const validKey = (key) => /^[a-z0-9]{4,64}$/i.test(key);
const maskEmail = (email) => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}•••@${domain}`;
};
const hiddenUserFields = {
  hiddenExpenseKeyHash: 1,
  hiddenExpenseOtpHash: 1,
  hiddenExpenseOtpExpires: 1,
  hiddenExpenseOtpSentAt: 1,
  hiddenExpenseOtpAttempts: 1,
};
const text = (value) => (value == null ? null : String(value));
// Sorts suggestion lists the way the PostgreSQL database collation (English_India) did.
const collator = new Intl.Collator('en-IN');

function range(month, year) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    throw fail(400, 'Choose a valid month and year');
  }
  return [new Date(Date.UTC(year, month - 1, 1)), new Date(Date.UTC(year, month, 1))];
}

function parseId(value, label = 'Expense') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    throw fail(400, `Invalid ${label.toLowerCase()} id`);
  }
  return objectId(value);
}

function parseDate(value, label = 'Date') {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw fail(400, `${label} is invalid`);
  return date;
}

function pick(body) {
  const date = parseDate(body.date);
  const item = String(body.item || body.description || '').trim();
  if (!item) {
    throw fail(400, 'Each expense needs an item, date, and amount greater than zero');
  }
  const amount = parseMoney(body.amount, {
    minimum: 0.01,
    message: 'Each expense needs an item, date, and amount greater than zero',
  });
  const subtypes = Array.isArray(body.subtypes)
    ? body.subtypes.map((subtype) => {
        const subtypeAmount =
          subtype.amount == null || subtype.amount === ''
            ? null
            : parseMoney(subtype.amount, {
                minimum: 0.01,
                message: 'Subtype amounts must be greater than zero',
              });
        return {
          _id: newId(),
          type: String(subtype.type || '').trim(),
          amount: subtypeAmount == null ? null : decimal(subtypeAmount),
          paymentMethod: String(subtype.paymentMethod || 'Cash'),
        };
      })
    : [];
  return {
    date,
    amount: decimal(amount),
    item,
    category: String(body.category || 'Other'),
    subcategory: text(body.subcategory),
    hasSubtypes: Boolean(body.hasSubtypes),
    subtypes,
    description: item,
    paymentMethod: String(body.paymentMethod || 'Cash'),
    notes: text(body.notes),
    isLocked: Boolean(body.isLocked),
  };
}

function expenseResponse(document) {
  const expense = toApi(document);
  expense.subtypes = (expense.subtypes || []).map(({ amount, ...subtype }) =>
    amount == null ? subtype : { ...subtype, amount },
  );
  return expense;
}

function newExpense(userId, record) {
  const now = new Date();
  return { _id: newId(), userId, ...record, deletedAt: null, createdAt: now, updatedAt: now };
}

const breakdown = (rows) =>
  rows.map(({ _id, total, count }) => ({ _id, total: Number(total.toString()), count }));
const decimalTotal = (rows) => rows[0]?.total ?? 0;

router.post(
  '/lock-key/request-link',
  auth,
  wrap(async (req, res) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail))
      throw fail(503, 'Set HIDDEN_EXPENSE_RECOVERY_EMAIL to a valid email address');
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS)
      throw fail(503, 'Email recovery is not configured on the server');
    const userId = objectId(req.uid);
    const user = await collection('users').findOne(
      { _id: userId },
      { projection: hiddenUserFields },
    );
    if (!user?.hiddenExpenseKeyHash) throw fail(409, 'Set a PIN first');
    if (
      user.hiddenExpenseOtpSentAt &&
      Date.now() - new Date(user.hiddenExpenseOtpSentAt).getTime() < 60_000
    )
      throw fail(429, 'Wait one minute before requesting another reset link');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const now = new Date();
    // Atomic on replica sets. On a standalone server the user is updated last: a queued email
    // whose token does not match the user's current hash is discarded by the scheduler.
    await withTransaction(async (session) => {
      await collection('hiddenRecoveryEmails').deleteMany({ userId }, { session });
      await collection('hiddenRecoveryEmails').insertOne(
        {
          _id: newId(),
          userId,
          to: recoveryEmail,
          token,
          tokenHash,
          expiresAt,
          sentAt: null,
          attempts: 0,
          createdAt: now,
          updatedAt: now,
        },
        { session },
      );
      await collection('users').updateOne(
        { _id: userId },
        {
          $set: {
            hiddenExpenseOtpHash: tokenHash,
            hiddenExpenseOtpExpires: expiresAt,
            hiddenExpenseOtpSentAt: now,
            hiddenExpenseOtpAttempts: 0,
            updatedAt: now,
          },
        },
        { session },
      );
    });
    ok(res, { sentTo: maskEmail(recoveryEmail), queued: true });
  }),
);

router.post(
  '/lock-key/reset-link',
  wrap(async (req, res) => {
    const token = String(req.body.token || '');
    const key = String(req.body.key || '');
    if (!/^[a-f\d]{64}$/i.test(token)) throw fail(400, 'Reset link is invalid or expired');
    if (!validKey(key)) throw fail(400, 'New PIN must be 4 to 64 letters or numbers');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const keyHash = await bcrypt.hash(key, 12);
    await withTransaction(async (session) => {
      const now = new Date();
      const recovery = await collection('hiddenRecoveryEmails').findOne(
        { tokenHash, expiresAt: { $gt: now } },
        { projection: { userId: 1 }, session },
      );
      let userId = recovery?.userId;
      if (!userId) {
        const user = await collection('users').findOne(
          { hiddenExpenseOtpHash: tokenHash, hiddenExpenseOtpExpires: { $gt: now } },
          { projection: { _id: 1 }, session },
        );
        userId = user?._id;
      }
      if (!userId) throw fail(400, 'Reset link is invalid or expired');
      await collection('users').updateOne(
        { _id: userId },
        {
          $set: {
            hiddenExpenseKeyHash: keyHash,
            hiddenExpenseOtpHash: null,
            hiddenExpenseOtpExpires: null,
            hiddenExpenseOtpSentAt: null,
            hiddenExpenseOtpAttempts: 0,
            updatedAt: now,
          },
        },
        { session },
      );
      await collection('hiddenRecoveryEmails').deleteMany({ userId }, { session });
    });
    ok(res, { configured: true }, 'PIN updated');
  }),
);

router.use(auth);
const lockKeyRoutes = express.Router();
lockKeyRoutes.use(auth);
const keyHashFor = async (uid) =>
  (
    await collection('users').findOne(
      { _id: objectId(uid) },
      { projection: { hiddenExpenseKeyHash: 1 } },
    )
  )?.hiddenExpenseKeyHash;
lockKeyRoutes.post(
  '/status',
  wrap(async (req, res) => {
    ok(res, { configured: Boolean(await keyHashFor(req.uid)) });
  }),
);
lockKeyRoutes.post(
  '/set',
  wrap(async (req, res) => {
    const key = String(req.body.key || '');
    if (!validKey(key)) throw fail(400, 'PIN must be 4 to 64 letters or numbers');
    const userId = objectId(req.uid);
    const result = await collection('users').updateOne(
      { _id: userId, hiddenExpenseKeyHash: null },
      { $set: { hiddenExpenseKeyHash: await bcrypt.hash(key, 12), updatedAt: new Date() } },
    );
    if (!result.matchedCount) {
      const exists = await collection('users').countDocuments({ _id: userId }, { limit: 1 });
      if (!exists) throw fail(404, 'Account not found');
      throw fail(409, 'A PIN is already set. Use Reset PIN or Forgot PIN.');
    }
    ok(res, { configured: true }, 'Key saved');
  }),
);
lockKeyRoutes.post(
  '/unlock',
  wrap(async (req, res) => {
    const keyHash = await keyHashFor(req.uid);
    if (!keyHash) throw fail(409, 'Set a key first');
    if (!(await bcrypt.compare(String(req.body.key || ''), keyHash)))
      throw fail(401, 'Incorrect key');
    ok(res, {
      token: jwt.sign({ id: req.uid, hiddenExpenses: true }, process.env.JWT_SECRET, {
        expiresIn: '15m',
      }),
    });
  }),
);
lockKeyRoutes.post(
  '/change',
  wrap(async (req, res) => {
    const currentKey = String(req.body.currentKey || '');
    const newKey = String(req.body.newKey || '');
    if (!validKey(newKey)) throw fail(400, 'New PIN must be 4 to 64 letters or numbers');
    const keyHash = await keyHashFor(req.uid);
    if (!keyHash) throw fail(409, 'Set a PIN first');
    if (!(await bcrypt.compare(currentKey, keyHash)))
      throw fail(401, 'Current PIN is incorrect');
    await collection('users').updateOne(
      { _id: objectId(req.uid) },
      { $set: { hiddenExpenseKeyHash: await bcrypt.hash(newKey, 12), updatedAt: new Date() } },
    );
    ok(res, { configured: true }, 'PIN updated');
  }),
);
router.use('/lock-key', lockKeyRoutes);

const verifyHiddenAccess = (req, res, next) => {
  if (req.query.locked !== 'true') return next();
  try {
    const claims = jwt.verify(req.get('x-hidden-expense-token'), process.env.JWT_SECRET);
    if (claims.hiddenExpenses !== true || claims.id !== req.uid) throw new Error('Invalid token');
    next();
  } catch {
    next(fail(401, 'Unlock hidden expenses with your key first'));
  }
};

dashboard.use(auth);

const groupBy = (key) => ({
  $group: { _id: key, total: { $sum: '$amount' }, count: { $sum: 1 } },
});
const itemKey = { $ifNull: ['$item', '$description'] };

router.get(
  '/insights',
  wrap(async (req, res) => {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    const [start, end] = range(month, year);
    const [result] = await financialExpenses(objectId(req.uid), { $gte: start, $lt: end }, [
      {
        $facet: {
          totals: [groupBy(null)],
          categories: [groupBy('$category'), { $sort: { total: -1 } }],
          items: [groupBy(itemKey), { $sort: { total: -1 } }, { $limit: 100 }],
        },
      },
    ]).toArray();
    ok(res, {
      total: Number(decimalTotal(result.totals).toString()),
      count: result.totals[0]?.count ?? 0,
      categories: breakdown(result.categories),
      items: breakdown(result.items),
    });
  }),
);

router.get(
  '/yearly',
  wrap(async (req, res) => {
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const rows = await financialExpenses(
      objectId(req.uid),
      { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) },
      [groupBy({ $month: '$date' }), { $sort: { _id: 1 } }],
    ).toArray();
    ok(res, breakdown(rows));
  }),
);

router.post(
  '/bulk',
  wrap(async (req, res) => {
    const entries = req.body.expenses;
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100)
      throw fail(400, 'Add between 1 and 100 expenses');
    const userId = objectId(req.uid);
    const documents = entries.map((entry) => newExpense(userId, pick(entry)));
    await withTransaction(async (session) => {
      try {
        await collection('expenses').insertMany(documents, { ordered: true, session });
      } catch (error) {
        // All-or-nothing without a transaction: remove any expenses this request inserted.
        if (!session)
          await collection('expenses').deleteMany({
            userId,
            _id: { $in: documents.map((document) => document._id) },
          });
        throw error;
      }
    });
    ok(res, documents.map(expenseResponse), 'Expenses created successfully', 201);
  }),
);

router.get(
  '/suggestions',
  wrap(async (req, res) => {
    const visible = { userId: objectId(req.uid), isLocked: false, deletedAt: null };
    const [items, subtypes] = await Promise.all([
      collection('expenses').distinct('item', { ...visible, item: { $nin: [null, ''] } }),
      collection('expenses').distinct('subtypes.type', visible),
    ]);
    const clean = (values) =>
      values.filter((value) => typeof value === 'string' && value !== '').sort(collator.compare);
    ok(res, { items: clean(items), subtypes: clean(subtypes) });
  }),
);

function amountBound(value) {
  try {
    return decimal(String(value));
  } catch {
    return value;
  }
}

router.get(
  '/',
  verifyHiddenAccess,
  wrap(async (req, res) => {
    const { category, paymentMethod, search, from, to, min, max, month, year, locked } = req.query;
    const filter = { userId: objectId(req.uid), deletedAt: null };
    if (locked === 'true') filter.isLocked = true;
    else if (locked !== 'all') filter.isLocked = false;
    if (category) filter.category = String(category);
    if (paymentMethod) filter.paymentMethod = String(paymentMethod);
    if (month && year) {
      const [start, end] = range(Number(month), Number(year));
      filter.date = { $gte: start, $lt: end };
    } else {
      if (from) filter.date = { ...filter.date, $gte: parseDate(from, 'From date') };
      if (to) filter.date = { ...filter.date, $lte: parseDate(to, 'To date') };
    }
    if (min || max) {
      const minValue = min ? Number(min) : null;
      const maxValue = max ? Number(max) : null;
      if ((min && !Number.isFinite(minValue)) || (max && !Number.isFinite(maxValue)))
        throw fail(400, 'Amount filter is invalid');
      filter.amount = {};
      if (min) filter.amount.$gte = amountBound(minValue);
      if (max) filter.amount.$lte = amountBound(maxValue);
    }
    if (search) {
      // Case-insensitive substring match on the same fields as the former ILIKE search.
      const pattern = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      filter.$or = [
        { item: pattern },
        { description: pattern },
        { category: pattern },
        { subcategory: pattern },
        { 'subtypes.type': pattern },
      ];
    }
    const expenses = await collection('expenses')
      .find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(1000)
      .toArray();
    ok(res, expenses.map(expenseResponse));
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const expense = newExpense(objectId(req.uid), pick(req.body));
    await collection('expenses').insertOne(expense);
    ok(res, expenseResponse(expense), 'Expense created successfully', 201);
  }),
);

function parseIds(value) {
  if (!Array.isArray(value)) throw fail(400, 'Expense ids must be an array');
  const ids = [...new Set(value)];
  if (
    !ids.length ||
    ids.length > 1000 ||
    ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
  )
    throw fail(400, 'Select between 1 and 1000 valid expenses');
  return objectIds(ids);
}

// Deleted items: hidden expenses keep their privacy here and show only date and amount.
router.get(
  '/trash',
  wrap(async (req, res) => {
    const expenses = await collection('expenses')
      .find({ userId: objectId(req.uid), deletedAt: { $ne: null } })
      .sort({ deletedAt: -1, date: -1 })
      .limit(1000)
      .toArray();
    ok(
      res,
      expenses.map((document) => {
        const expense = expenseResponse(document);
        return expense.isLocked
          ? {
              ...expense,
              item: 'Hidden expense',
              description: 'Hidden expense',
              category: 'Hidden',
              notes: null,
              subtypes: [],
            }
          : expense;
      }),
    );
  }),
);

router.patch(
  '/trash/restore',
  wrap(async (req, res) => {
    const ids = parseIds(req.body.ids);
    const { matchedCount: rowCount } = await collection('expenses').updateMany(
      { userId: objectId(req.uid), _id: { $in: ids }, deletedAt: { $ne: null } },
      { $set: { deletedAt: null, updatedAt: new Date() } },
    );
    ok(res, { restoredCount: rowCount }, `${rowCount} expense${rowCount === 1 ? '' : 's'} restored`);
  }),
);

router.delete(
  '/trash',
  wrap(async (req, res) => {
    const ids = parseIds(req.body.ids);
    const { deletedCount: rowCount } = await collection('expenses').deleteMany({
      userId: objectId(req.uid),
      _id: { $in: ids },
      deletedAt: { $ne: null },
    });
    ok(
      res,
      { deletedCount: rowCount },
      `${rowCount} expense${rowCount === 1 ? '' : 's'} permanently deleted`,
    );
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const expense = await collection('expenses').findOne({
      _id: id,
      userId: objectId(req.uid),
      isLocked: false,
      deletedAt: null,
    });
    if (!expense) throw fail(404, 'Expense not found');
    ok(res, expenseResponse(expense));
  }),
);

router.delete(
  '/bulk',
  wrap(async (req, res) => {
    if (!Array.isArray(req.body.ids)) throw fail(400, 'Expense ids must be an array');
    const ids = [...new Set(req.body.ids)];
    if (
      !ids.length ||
      ids.length > 1000 ||
      ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
    )
      throw fail(400, 'Select between 1 and 1000 valid expenses');
    const now = new Date();
    const { matchedCount } = await collection('expenses').updateMany(
      { userId: objectId(req.uid), _id: { $in: objectIds(ids) }, deletedAt: null },
      { $set: { deletedAt: now, updatedAt: now } },
    );
    ok(res, { deletedCount: matchedCount }, 'Selected expenses moved to deleted items');
  }),
);

router.patch(
  '/bulk/lock',
  wrap(async (req, res) => {
    if (!Array.isArray(req.body.ids) || typeof req.body.isLocked !== 'boolean')
      throw fail(400, 'Expense ids and lock state are required');
    const ids = [...new Set(req.body.ids)];
    if (
      !ids.length ||
      ids.length > 1000 ||
      ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
    )
      throw fail(400, 'Select between 1 and 1000 valid expenses');
    const { matchedCount } = await collection('expenses').updateMany(
      { userId: objectId(req.uid), _id: { $in: objectIds(ids) }, deletedAt: null },
      { $set: { isLocked: req.body.isLocked, updatedAt: new Date() } },
    );
    ok(res, { modifiedCount: matchedCount }, 'Expenses updated');
  }),
);

router.put(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const record = pick(req.body);
    // The expense and its subtypes are one document, so this replacement is atomic.
    const expense = await collection('expenses').findOneAndUpdate(
      { _id: id, userId: objectId(req.uid), deletedAt: null },
      { $set: { ...record, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!expense) throw fail(404, 'Expense not found');
    ok(res, expenseResponse(expense), 'Expense updated successfully');
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const now = new Date();
    const { matchedCount } = await collection('expenses').updateOne(
      { _id: id, userId: objectId(req.uid), deletedAt: null },
      { $set: { deletedAt: now, updatedAt: now } },
    );
    if (!matchedCount) throw fail(404, 'Expense not found');
    ok(res, {}, 'Expense moved to deleted items');
  }),
);

dashboard.get(
  '/summary',
  wrap(async (req, res) => {
    const now = new Date();
    const month = Number(req.query.month) || now.getUTCMonth() + 1;
    const year = Number(req.query.year) || now.getUTCFullYear();
    const [start, end] = range(month, year);
    const userId = objectId(req.uid);
    const sumAmount = [{ $group: { _id: null, total: { $sum: '$amount' } } }];
    const incomeTotal = (date) =>
      collection('incomes')
        .aggregate([{ $match: { userId, date } }, ...sumAmount])
        .toArray();
    const [[monthly], recent, today, income, priorIncome, priorExpense] = await Promise.all([
      financialExpenses(userId, { $gte: start, $lt: end }, [
        {
          $facet: {
            daily: [
              groupBy({ $dateToString: { format: '%Y-%m-%d', date: '$date' } }),
              { $sort: { _id: 1 } },
            ],
            categories: [groupBy('$category'), { $sort: { total: -1 } }],
            items: [groupBy(itemKey), { $sort: { total: -1 } }],
          },
        },
      ]).toArray(),
      collection('expenses')
        .find({ userId, isLocked: false, deletedAt: null, date: { $gte: start, $lt: end } })
        .sort({ date: -1, createdAt: -1 })
        .limit(10)
        .toArray(),
      financialExpenses(
        userId,
        {
          $gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
          $lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)),
        },
        sumAmount,
      ).toArray(),
      incomeTotal({ $gte: start, $lt: end }),
      incomeTotal({ $lt: start }),
      financialExpenses(userId, { $lt: start }, sumAmount).toArray(),
    ]);
    const dailyBreakdown = breakdown(monthly.daily);
    const totalCents = monthly.daily.reduce((sum, day) => sum + toCents(day.total), 0n);
    const total = fromCents(totalCents);
    const openingCents = toCents(decimalTotal(priorIncome)) - toCents(decimalTotal(priorExpense));
    const openingBalance = fromCents(openingCents);
    const incomeCents = toCents(decimalTotal(income));
    const totalMonthIncome = fromCents(incomeCents);
    const current = month === now.getUTCMonth() + 1 && year === now.getUTCFullYear();
    const days = current ? now.getUTCDate() : new Date(Date.UTC(year, month, 0)).getUTCDate();
    ok(res, {
      month,
      year,
      totalMonthExpense: total,
      totalMonthIncome,
      openingBalance,
      availableFunds: fromCents(openingCents + incomeCents),
      remainingBalance: fromCents(openingCents + incomeCents - totalCents),
      todayExpense: Number(decimalTotal(today).toString()),
      averageDailyExpense: total / days,
      highestSpendingDay: dailyBreakdown.reduce(
        (best, day) => (!best || day.total > best.total ? day : best),
        null,
      ),
      categoryBreakdown: breakdown(monthly.categories),
      itemBreakdown: breakdown(monthly.items),
      dailyBreakdown,
      recentExpenses: recent.map(expenseResponse),
    });
  }),
);

module.exports = { router, dashboard };
