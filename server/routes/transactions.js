const express = require('express');
const { collection, COLLECTIONS } = require('../db');
const auth = require('../middleware/auth');
const { fromCents, toCents, ZERO, objectId } = require('../db/records');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

function parseDate(value, label) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw fail(400, `${label} must be a valid date`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw fail(400, `${label} must be a valid date`);
  return date;
}

function parsePositiveInteger(value, fallback, maximum) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    throw fail(400, 'Page and page size must be positive integers');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum)
    throw fail(400, 'Page and page size are outside the allowed range');
  return number;
}

const ledgerOrder = { occurredAt: 1, createdAt: 1, type: 1, transactionId: 1 };
const statementOrder = { occurredAt: -1, createdAt: -1, type: 1, transactionId: 1 };

router.get(
  '/',
  wrap(async (req, res) => {
    const from = parseDate(req.query.from, 'Start date');
    const to = parseDate(req.query.to, 'End date');
    if (from && to && from > to) throw fail(400, 'Start date must be on or before end date');
    const page = parsePositiveInteger(req.query.page, 1, 1_000_000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 50, 100);
    const end = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null;
    const offset = (page - 1) * pageSize;
    const userId = objectId(req.uid);

    const inRange = {};
    if (from) inRange.$gte = from;
    if (end) inRange.$lt = end;
    const filtered = Object.keys(inRange).length ? [{ $match: { occurredAt: inRange } }] : [];

    const [result] = await collection('incomes')
      .aggregate(
        [
          { $match: { userId } },
          {
            $project: {
              _id: 0,
              transactionId: '$_id',
              occurredAt: '$date',
              createdAt: 1,
              type: { $literal: 'income' },
              description: '$source',
              amount: 1,
              credit: '$amount',
              debit: { $literal: ZERO },
            },
          },
          {
            $unionWith: {
              coll: COLLECTIONS.expenses,
              pipeline: [
                { $match: { userId, deletedAt: null } },
                {
                  $project: {
                    _id: 0,
                    transactionId: '$_id',
                    occurredAt: '$date',
                    createdAt: 1,
                    type: { $literal: 'expense' },
                    description: {
                      $cond: [
                        '$isLocked',
                        'Hidden expense',
                        { $ifNull: ['$item', { $ifNull: ['$description', 'Expense'] }] },
                      ],
                    },
                    amount: 1,
                    credit: { $literal: ZERO },
                    debit: '$amount',
                  },
                },
              ],
            },
          },
          {
            $unionWith: {
              coll: COLLECTIONS.reminders,
              pipeline: [
                { $match: { userId } },
                { $unwind: '$payments' },
                {
                  $project: {
                    _id: 0,
                    transactionId: '$payments._id',
                    occurredAt: '$payments.paidAt',
                    createdAt: '$payments.createdAt',
                    type: { $literal: 'reminder_payment' },
                    description: '$title',
                    amount: '$payments.amount',
                    credit: { $literal: ZERO },
                    debit: '$payments.amount',
                  },
                },
              ],
            },
          },
          { $set: { net: { $subtract: ['$credit', '$debit'] } } },
          {
            $setWindowFields: {
              sortBy: ledgerOrder,
              output: { balance: { $sum: '$net', window: { documents: ['unbounded', 'current'] } } },
            },
          },
          {
            $facet: {
              opening: from
                ? [
                    { $match: { occurredAt: { $lt: from } } },
                    { $group: { _id: null, total: { $sum: '$net' } } },
                  ]
                : [{ $match: { $expr: false } }],
              totals: [
                ...filtered,
                {
                  $group: {
                    _id: null,
                    total: { $sum: 1 },
                    credits: { $sum: '$credit' },
                    debits: { $sum: '$debit' },
                  },
                },
              ],
              items: [...filtered, { $sort: statementOrder }, { $skip: offset }, { $limit: pageSize }],
            },
          },
        ],
        { allowDiskUse: true },
      )
      .toArray();

    const totals = result.totals[0] || { total: 0, credits: 0, debits: 0 };
    const credits = toCents(totals.credits);
    const debits = toCents(totals.debits);
    const openingBalance = toCents(result.opening[0]?.total);
    const number = (value) => Number(value.toString());
    ok(res, {
      items: result.items.map((item) => ({
        id: item.transactionId.toHexString(),
        date: item.occurredAt,
        type: item.type,
        description: item.description,
        amount: number(item.amount),
        credit: number(item.credit),
        debit: number(item.debit),
        balance: number(item.balance),
      })),
      page,
      pageSize,
      total: totals.total,
      pageCount: Math.ceil(totals.total / pageSize),
      openingBalance: fromCents(openingBalance),
      credits: fromCents(credits),
      debits: fromCents(debits),
      closingBalance: fromCents(openingBalance + credits - debits),
    });
  }),
);

module.exports = router;
