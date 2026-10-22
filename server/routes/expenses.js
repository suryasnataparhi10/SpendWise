const express = require('express');
const Expense = require('../models/Expense');
const Income = require('../models/Income');
const auth = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const User = require('../models/User');
const RecoveryEmail = require('../models/HiddenExpenseRecoveryEmail');
const { ok, fail, wrap } = require('../utils/http');
const router = express.Router();
const recoveryEmail = process.env.HIDDEN_EXPENSE_RECOVERY_EMAIL || '';
const validKey = (key) => /^[a-z0-9]{4,64}$/i.test(key);
const maskEmail = (email) => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}â€¢â€¢â€¢@${domain}`;
};
router.post('/lock-key/request-link', auth, wrap(async (req, res) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail))
    throw fail(503, 'Set HIDDEN_EXPENSE_RECOVERY_EMAIL to a valid email address');
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS)
    throw fail(503, 'Email recovery is not configured on the server');
  const user = await User.findById(req.uid).select(
    '+hiddenExpenseKeyHash +hiddenExpenseOtpHash +hiddenExpenseOtpExpires +hiddenExpenseOtpSentAt +hiddenExpenseOtpAttempts',
  );
  if (!user?.hiddenExpenseKeyHash) throw fail(409, 'Set a PIN first');
  if (user.hiddenExpenseOtpSentAt && Date.now() - user.hiddenExpenseOtpSentAt.getTime() < 60000)
    throw fail(429, 'Wait one minute before requesting another reset link');
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await RecoveryEmail.deleteMany({ userId: user._id });
  user.hiddenExpenseOtpHash = tokenHash;
  user.hiddenExpenseOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.hiddenExpenseOtpSentAt = new Date();
  user.hiddenExpenseOtpAttempts = 0;
  await user.save();
  await RecoveryEmail.create({ userId: user._id, to: recoveryEmail, token, tokenHash, expiresAt: user.hiddenExpenseOtpExpires });
  ok(res, { sentTo: maskEmail(recoveryEmail), queued: true });
}));
router.post('/lock-key/reset-link', wrap(async (req, res) => {
  const token = String(req.body.token || ''), key = String(req.body.key || '');
  if (!/^[a-f\d]{64}$/i.test(token)) throw fail(400, 'Reset link is invalid or expired');
  if (!validKey(key)) throw fail(400, 'New PIN must be 4 to 64 letters or numbers');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const recovery = await RecoveryEmail.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
  });
  const fields =
    '+hiddenExpenseKeyHash +hiddenExpenseOtpHash +hiddenExpenseOtpExpires +hiddenExpenseOtpSentAt +hiddenExpenseOtpAttempts';
  const user = recovery
    ? await User.findById(recovery.userId).select(fields)
    : await User.findOne({
        hiddenExpenseOtpHash: tokenHash,
        hiddenExpenseOtpExpires: { $gt: new Date() },
      }).select(fields);
  if (!user) throw fail(400, 'Reset link is invalid or expired');
  user.hiddenExpenseKeyHash = await bcrypt.hash(key, 12);
  user.hiddenExpenseOtpHash = undefined;
  user.hiddenExpenseOtpExpires = undefined;
  user.hiddenExpenseOtpSentAt = undefined;
  user.hiddenExpenseOtpAttempts = 0;
  await user.save();
  await RecoveryEmail.deleteMany({ userId: user._id });
  ok(res, { configured: true }, 'PIN updated');
}));
router.use(auth);
const lockKeyRoutes = express.Router();
lockKeyRoutes.use(auth);
lockKeyRoutes.post('/status', wrap(async (req, res) => {
  const user = await User.findById(req.uid).select('+hiddenExpenseKeyHash');
  ok(res, { configured: Boolean(user?.hiddenExpenseKeyHash) });
}));
lockKeyRoutes.post('/set', wrap(async (req, res) => {
  const key = String(req.body.key || '');
  if (!validKey(key)) throw fail(400, 'PIN must be 4 to 64 letters or numbers');
  const user = await User.findById(req.uid).select('+hiddenExpenseKeyHash');
  if (!user) throw fail(404, 'Account not found');
  if (user.hiddenExpenseKeyHash) throw fail(409, 'A PIN is already set. Use Reset PIN or Forgot PIN.');
  user.hiddenExpenseKeyHash = await bcrypt.hash(key, 12);
  await user.save();
  ok(res, { configured: true }, 'Key saved');
}));
lockKeyRoutes.post('/unlock', wrap(async (req, res) => {
  const user = await User.findById(req.uid).select('+hiddenExpenseKeyHash');
  if (!user?.hiddenExpenseKeyHash) throw fail(409, 'Set a key first');
  if (!(await bcrypt.compare(String(req.body.key || ''), user.hiddenExpenseKeyHash)))
    throw fail(401, 'Incorrect key');
  ok(res, { token: jwt.sign({ id: req.uid, hiddenExpenses: true }, process.env.JWT_SECRET, { expiresIn: '15m' }) });
}));
lockKeyRoutes.post('/change', wrap(async (req, res) => {
  const currentKey = String(req.body.currentKey || ''), newKey = String(req.body.newKey || '');
  if (!validKey(newKey)) throw fail(400, 'New PIN must be 4 to 64 letters or numbers');
  const user = await User.findById(req.uid).select('+hiddenExpenseKeyHash');
  if (!user?.hiddenExpenseKeyHash) throw fail(409, 'Set a PIN first');
  if (!(await bcrypt.compare(currentKey, user.hiddenExpenseKeyHash))) throw fail(401, 'Current PIN is incorrect');
  user.hiddenExpenseKeyHash = await bcrypt.hash(newKey, 12);
  await user.save();
  ok(res, { configured: true }, 'PIN updated');
}));
router.use('/lock-key', lockKeyRoutes);
const verifyHiddenAccess = (req, res, next) => {
  if (req.query.locked !== 'true') return next();
  try {
    const claims = jwt.verify(req.get('x-hidden-expense-token'), process.env.JWT_SECRET);
    if (claims.hiddenExpenses !== true || claims.id !== String(req.uid)) throw new Error('Invalid token');
    next();
  } catch {
    next(fail(401, 'Unlock hidden expenses with your key first'));
  }
};
const dashboard = express.Router();
dashboard.use(auth);
const range = (month, year) => ({
  $gte: new Date(Date.UTC(year, month - 1, 1)),
  $lt: new Date(Date.UTC(year, month, 1)),
});
const pick = (b) => ({
  date: b.date,
  amount: b.amount,
  item: String(b.item || b.description || '').trim(),
  category: b.category || 'Other',
  subcategory: b.subcategory,
  hasSubtypes: Boolean(b.hasSubtypes),
  subtypes: Array.isArray(b.subtypes)
    ? b.subtypes.map((s) => ({
        type: String(s.type || '').trim(),
        amount: Number(s.amount),
        paymentMethod: s.paymentMethod || 'Cash',
      }))
    : [],
  description: String(b.item || b.description || '').trim(),
  paymentMethod: b.paymentMethod || 'Cash',
  isLocked: Boolean(b.isLocked),
});

router.get(
  '/insights',
  wrap(async (req, res) => {
    const month = Number(req.query.month), year = Number(req.query.year);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year))
      throw fail(400, 'Choose a valid month and year');
    const dateRange = range(month, year);
    const match = { userId: req.uid, isLocked: { $ne: true }, date: dateRange };
    const [totalRows, categoryRows, itemRows] = await Promise.all([
      Expense.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Expense.aggregate([
        { $match: match },
        { $group: { _id: { $ifNull: ['$category', 'Other'] }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      Expense.aggregate([
        { $match: match },
        { $group: { _id: { $ifNull: ['$item', '$description'] }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 100 },
      ]),
    ]);
    ok(res, { total: totalRows[0]?.total || 0, count: totalRows[0]?.count || 0, categories: categoryRows, items: itemRows });
  }),
);
router.get(
  '/yearly',
  wrap(async (req, res) => {
    const year = +req.query.year || new Date().getUTCFullYear();
    ok(
      res,
      await Expense.aggregate([
        {
          $match: {
            userId: req.uid,
            isLocked: { $ne: true },
            date: { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) },
          },
        },
        { $group: { _id: { $month: '$date' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    );
  }),
);
router.post(
  '/bulk',
  wrap(async (req, res) => {
    const entries = req.body.expenses;
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100)
      throw fail(400, 'Add between 1 and 100 expenses');
    const records = entries.map(pick);
    if (
      records.some(
        (e) => !e.date || !e.item || !Number.isFinite(Number(e.amount)) || Number(e.amount) <= 0,
      )
    )
      throw fail(400, 'Each expense needs an item, date, and amount greater than zero');
    ok(
      res,
      await Expense.insertMany(records.map((e) => ({ ...e, userId: req.uid }))),
      'Expenses created successfully',
      201,
    );
  }),
);
router.get(
  '/suggestions',
  wrap(async (req, res) => {
    const [items, subtypes] = await Promise.all([
      Expense.distinct('item', { userId: req.uid, isLocked: { $ne: true } }),
      Expense.distinct('subtypes.type', { userId: req.uid, isLocked: { $ne: true } }),
    ]);
    ok(res, { items: items.filter(Boolean), subtypes: subtypes.filter(Boolean) });
  }),
);
router.get(
  '/',
  verifyHiddenAccess,
  wrap(async (req, res) => {
    const { category, paymentMethod, search, from, to, min, max, month, year, locked } = req.query,
      q = { userId: req.uid };
    if (locked === 'true') q.isLocked = true;
    else if (locked !== 'all') q.isLocked = { $ne: true };
    if (category) q.category = String(category);
    if (paymentMethod) q.paymentMethod = String(paymentMethod);
    if (month && year) q.date = range(+month, +year);
    else if (from || to)
      q.date = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
    if (min || max) q.amount = { ...(min && { $gte: +min }), ...(max && { $lte: +max }) };
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        pattern = new RegExp(escaped, 'i');
      q.$or = ['item', 'description', 'category', 'subcategory', 'subtypes.type'].map((key) => ({
        [key]: pattern,
      }));
    }
    ok(res, await Expense.find(q).sort({ date: -1, createdAt: -1 }).limit(1000));
  }),
);
router.post(
  '/',
  wrap(async (req, res) =>
    ok(
      res,
      await Expense.create({ ...pick(req.body), userId: req.uid }),
      'Expense created successfully',
      201,
    ),
  ),
);
router.get(
  '/:id',
  wrap(async (req, res) => {
    const expense = await Expense.findOne({ _id: req.params.id, userId: req.uid, isLocked: { $ne: true } });
    if (!expense) throw fail(404, 'Expense not found');
    ok(res, expense);
  }),
);
router.delete(
  '/bulk',
  wrap(async (req, res) => {
    if (!Array.isArray(req.body.ids)) throw fail(400, 'Expense ids must be an array');
    const ids = [...new Set(req.body.ids || [])];
    if (
      !ids.length ||
      ids.length > 1000 ||
      ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
    )
      throw fail(400, 'Select between 1 and 1000 valid expenses');
    const result = await Expense.deleteMany({ userId: req.uid, _id: { $in: ids } });
    ok(res, { deletedCount: result.deletedCount }, 'Selected expenses deleted');
  }),
);
router.patch(
  '/bulk/lock',
  wrap(async (req, res) => {
    if (!Array.isArray(req.body.ids) || typeof req.body.isLocked !== 'boolean')
      throw fail(400, 'Expense ids and lock state are required');
    const ids = [...new Set(req.body.ids)];
    if (!ids.length || ids.length > 1000 || ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)))
      throw fail(400, 'Select between 1 and 1000 valid expenses');
    const result = await Expense.updateMany(
      { userId: req.uid, _id: { $in: ids } },
      { $set: { isLocked: req.body.isLocked } },
    );
    ok(res, { modifiedCount: result.modifiedCount }, 'Expenses updated');
  }),
);
router.put(
  '/:id',
  wrap(async (req, res) => {
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, userId: req.uid },
      pick(req.body),
      { new: true, runValidators: true },
    );
    if (!expense) throw fail(404, 'Expense not found');
    ok(res, expense, 'Expense updated successfully');
  }),
);
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.uid });
    if (!expense) throw fail(404, 'Expense not found');
    ok(res, {}, 'Expense deleted successfully');
  }),
);

dashboard.get(
  '/summary',
  wrap(async (req, res) => {
    const now = new Date(),
      month = +req.query.month || now.getUTCMonth() + 1,
      year = +req.query.year || now.getUTCFullYear(),
      userId = req.uid,
      match = { userId, isLocked: { $ne: true }, date: range(month, year) };
    const sum = (id) => [
      { $match: match },
      { $group: { _id: id, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ];
    const periodStart = range(month, year).$gte;
    const [daily, categories, items, recent, today, income, priorIncome, priorExpense] = await Promise.all([
      Expense.aggregate([
        ...sum({ $dateToString: { format: '%Y-%m-%d', date: '$date' } }),
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([...sum('$category'), { $sort: { total: -1 } }]),
      Expense.aggregate([...sum({ $ifNull: ['$item', '$description'] }), { $sort: { total: -1 } }]),
      Expense.find(match).sort({ date: -1, createdAt: -1 }).limit(10),
      Expense.aggregate([
        {
          $match: {
            userId,
            isLocked: { $ne: true },
            date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Income.aggregate([
        { $match: { userId, date: range(month, year) } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Income.aggregate([
        { $match: { userId, date: { $lt: periodStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { userId, isLocked: { $ne: true }, date: { $lt: periodStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    const total = daily.reduce((n, day) => n + day.total, 0),
      openingBalance = (priorIncome[0]?.total || 0) - (priorExpense[0]?.total || 0),
      monthIncome = income[0]?.total || 0,
      current = month === now.getUTCMonth() + 1 && year === now.getUTCFullYear(),
      days = current ? now.getUTCDate() : new Date(Date.UTC(year, month, 0)).getUTCDate();
    ok(res, {
      month,
      year,
      totalMonthExpense: total,
      totalMonthIncome: monthIncome,
      openingBalance,
      availableFunds: openingBalance + monthIncome,
      remainingBalance: openingBalance + monthIncome - total,
      todayExpense: today[0]?.total || 0,
      averageDailyExpense: total / days,
      highestSpendingDay: daily.reduce(
        (best, day) => (!best || day.total > best.total ? day : best),
        null,
      ),
      categoryBreakdown: categories,
      itemBreakdown: items,
      dailyBreakdown: daily,
      recentExpenses: recent,
    });
  }),
);
module.exports = { router, dashboard };
