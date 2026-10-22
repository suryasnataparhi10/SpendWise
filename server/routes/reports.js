const express = require('express');
const Expense = require('../models/Expense');
const Income = require('../models/Income');
const auth = require('../middleware/auth');
const { ok, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

router.get(
  '/yearly',
  wrap(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const range = { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) };
    const [expenseRows, incomeRows] = await Promise.all([
      Expense.aggregate([
        { $match: { userId: req.uid, isLocked: { $ne: true }, date: range } },
        { $group: { _id: { $month: '$date' }, total: { $sum: '$amount' } } },
      ]),
      Income.aggregate([
        { $match: { userId: req.uid, date: range } },
        { $group: { _id: { $month: '$date' }, total: { $sum: '$amount' } } },
      ]),
    ]);
    const expenses = Object.fromEntries(expenseRows.map(({ _id, total }) => [_id, total]));
    const income = Object.fromEntries(incomeRows.map(({ _id, total }) => [_id, total]));
    ok(
      res,
      Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        income: income[index + 1] || 0,
        expenses: expenses[index + 1] || 0,
        net: (income[index + 1] || 0) - (expenses[index + 1] || 0),
      })),
    );
  }),
);

module.exports = router;
