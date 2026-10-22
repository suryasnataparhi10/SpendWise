const express = require('express');
const Budget = require('../models/Budget');
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

router.get(
  '/',
  wrap(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const budgets = await Budget.find({ userId: req.uid, year }).sort({ month: 1 });
    const spending = await Expense.aggregate([
      {
        $match: {
          userId: req.uid,
          isLocked: { $ne: true },
          date: { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) },
        },
      },
      { $group: { _id: { month: { $month: '$date' } }, spent: { $sum: '$amount' } } },
    ]);
    const spentByMonth = Object.fromEntries(
      spending.map((entry) => [entry._id.month, entry.spent]),
    );
    ok(
      res,
      budgets.map((budget) => ({ ...budget.toObject(), spent: spentByMonth[budget.month] || 0 })),
    );
  }),
);

router.put(
  '/',
  wrap(async (req, res) => {
    const month = Number(req.body.month);
    const year = Number(req.body.year);
    const limit = Number(req.body.limit);
    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year) ||
      !Number.isFinite(limit) ||
      limit <= 0
    )
      throw fail(400, 'Choose a month and enter a budget greater than zero');
    const budget = await Budget.findOneAndUpdate(
      { userId: req.uid, month, year },
      { $set: { limit } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    ok(res, budget, 'Budget saved');
  }),
);

module.exports = router;
