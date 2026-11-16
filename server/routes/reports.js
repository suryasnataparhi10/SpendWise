const express = require('express');
const { collection } = require('../db');
const { financialExpenses } = require('../db/financial');
const { toCents, fromCents, objectId } = require('../db/records');
const auth = require('../middleware/auth');
const { ok, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

router.get(
  '/yearly',
  wrap(async (req, res) => {
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const range = { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) };
    const userId = objectId(req.uid);
    const byMonth = [{ $group: { _id: { $month: '$date' }, total: { $sum: '$amount' } } }];
    const [expenseRows, incomeRows] = await Promise.all([
      financialExpenses(userId, range, byMonth).toArray(),
      collection('incomes')
        .aggregate([{ $match: { userId, date: range } }, ...byMonth])
        .toArray(),
    ]);
    const expenses = Object.fromEntries(expenseRows.map(({ _id, total }) => [_id, toCents(total)]));
    const income = Object.fromEntries(incomeRows.map(({ _id, total }) => [_id, toCents(total)]));
    ok(
      res,
      Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        income: fromCents(income[index + 1] || 0n),
        expenses: fromCents(expenses[index + 1] || 0n),
        net: fromCents((income[index + 1] || 0n) - (expenses[index + 1] || 0n)),
      })),
    );
  }),
);

module.exports = router;
