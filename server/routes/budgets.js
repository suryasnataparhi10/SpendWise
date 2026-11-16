const express = require('express');
const { collection } = require('../db');
const { financialExpenses } = require('../db/financial');
const auth = require('../middleware/auth');
const { parseMoney, decimal, toApi, objectId, newId } = require('../db/records');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

router.get(
  '/',
  wrap(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const userId = objectId(req.uid);
    const [budgets, spending] = await Promise.all([
      collection('budgets').find({ userId, year }).sort({ month: 1 }).toArray(),
      financialExpenses(userId, { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) }, [
        { $group: { _id: { $month: '$date' }, spent: { $sum: '$amount' } } },
      ]).toArray(),
    ]);
    const spentByMonth = new Map(spending.map(({ _id, spent }) => [_id, Number(spent.toString())]));
    ok(
      res,
      budgets.map((budget) => ({ ...toApi(budget), spent: spentByMonth.get(budget.month) || 0 })),
    );
  }),
);

router.put(
  '/',
  wrap(async (req, res) => {
    const month = Number(req.body.month);
    const year = Number(req.body.year);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year))
      throw fail(400, 'Choose a month and enter a budget greater than zero');
    const limit = parseMoney(req.body.limit, {
      minimum: 0.01,
      message: 'Choose a month and enter a budget greater than zero',
    });
    const userId = objectId(req.uid);
    const now = new Date();
    const upsert = () =>
      collection('budgets').findOneAndUpdate(
        { userId, year, month },
        {
          $set: { limit: decimal(limit), updatedAt: now },
          $setOnInsert: { _id: newId(), createdAt: now },
        },
        { upsert: true, returnDocument: 'after' },
      );
    let budget;
    try {
      budget = await upsert();
    } catch (error) {
      // Two concurrent first saves for the same month: the unique index admits one insert,
      // and the retry updates it, matching INSERT ... ON CONFLICT DO UPDATE.
      if (error.code !== 11000) throw error;
      budget = await upsert();
    }
    ok(res, toApi(budget), 'Budget saved');
  }),
);

module.exports = router;
