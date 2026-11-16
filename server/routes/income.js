const express = require('express');
const { collection } = require('../db');
const auth = require('../middleware/auth');
const { parseMoney, decimal, toApi, objectId, objectIds, newId } = require('../db/records');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

function parseId(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    throw fail(400, 'Invalid income id');
  return objectId(value);
}

function parseIncome(body) {
  const source = String(body.source || '').trim();
  const date = new Date(body.date);
  if (!source || !body.date || !Number.isFinite(date.getTime()) || body.amount == null)
    throw fail(400, 'Source, date, and an amount greater than zero are required');
  const amount = parseMoney(body.amount, {
    minimum: 0.01,
    message: 'Source, date, and an amount greater than zero are required',
  });
  return { source, date, amount: decimal(amount) };
}

router.get(
  '/',
  wrap(async (req, res) => {
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const month = Number(req.query.month);
    if (req.query.month && (!Number.isInteger(month) || month < 1 || month > 12))
      throw fail(400, 'Choose a valid month');
    const start = month ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, 0, 1));
    const end = month ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(year + 1, 0, 1));
    const incomes = await collection('incomes')
      .find({ userId: objectId(req.uid), date: { $gte: start, $lt: end } })
      .sort({ date: -1, createdAt: -1 })
      .toArray();
    ok(res, toApi(incomes));
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const { source, date, amount } = parseIncome(req.body);
    const now = new Date();
    const income = {
      _id: newId(),
      userId: objectId(req.uid),
      date,
      amount,
      source,
      createdAt: now,
      updatedAt: now,
    };
    await collection('incomes').insertOne(income);
    ok(res, toApi(income), 'Income saved', 201);
  }),
);

router.put(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const { source, date, amount } = parseIncome(req.body);
    const income = await collection('incomes').findOneAndUpdate(
      { _id: id, userId: objectId(req.uid) },
      { $set: { date, amount, source, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!income) throw fail(404, 'Income entry not found');
    ok(res, toApi(income), 'Income updated');
  }),
);

router.delete(
  '/bulk',
  wrap(async (req, res) => {
    if (!Array.isArray(req.body.ids)) throw fail(400, 'Income ids must be an array');
    const ids = [...new Set(req.body.ids || [])];
    if (
      !ids.length ||
      ids.length > 1000 ||
      ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
    )
      throw fail(400, 'Select between 1 and 1000 valid income entries');
    const { deletedCount } = await collection('incomes').deleteMany({
      userId: objectId(req.uid),
      _id: { $in: objectIds(ids) },
    });
    ok(res, { deletedCount }, 'Selected income entries deleted');
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const { deletedCount } = await collection('incomes').deleteOne({
      _id: id,
      userId: objectId(req.uid),
    });
    if (!deletedCount) throw fail(404, 'Income entry not found');
    ok(res, {}, 'Income deleted');
  }),
);

module.exports = router;
