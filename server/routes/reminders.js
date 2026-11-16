const express = require('express');
const { collection } = require('../db');
const auth = require('../middleware/auth');
const { parseMoney, decimal, ZERO, toApi, objectId, objectIds, newId } = require('../db/records');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

function parseId(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    throw fail(400, 'Invalid reminder id');
  return objectId(value);
}

// Payments are embedded in their reminder, so each change below is one atomic document update
// (the equivalent of the PostgreSQL SELECT ... FOR UPDATE transactions).
function reminderResponse(reminder) {
  const { payments, ...fields } = toApi(reminder);
  return fields;
}

router.get(
  '/',
  wrap(async (req, res) => {
    const reminders = await collection('reminders')
      .find({ userId: objectId(req.uid) })
      .sort({ completed: 1, dueDate: 1 })
      .toArray();
    ok(
      res,
      reminders.map((reminder) => ({
        ...reminderResponse(reminder),
        payments: [...reminder.payments]
          .sort((a, b) => b.paidAt - a.paidAt)
          .map((payment) => ({
            _id: payment._id.toHexString(),
            amount: Number(payment.amount.toString()),
            paidAt: payment.paidAt,
          })),
      })),
    );
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const title = String(req.body.title || '').trim();
    const dueDate = new Date(req.body.dueDate);
    if (!title || !req.body.dueDate || !Number.isFinite(dueDate.getTime()))
      throw fail(400, 'Title and due date are required');
    const amount =
      req.body.amount === '' || req.body.amount == null
        ? null
        : parseMoney(req.body.amount, { minimum: 0, message: 'Amount must be zero or more' });
    const now = new Date();
    const reminder = {
      _id: newId(),
      userId: objectId(req.uid),
      title,
      dueDate,
      amount: amount == null ? null : decimal(amount),
      paidAmount: ZERO,
      completed: false,
      payments: [],
      createdAt: now,
      updatedAt: now,
    };
    await collection('reminders').insertOne(reminder);
    ok(res, reminderResponse(reminder), 'Reminder created', 201);
  }),
);

router.post(
  '/:id/payments',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const payment = decimal(parseMoney(req.body.amount, { message: 'Payment must be greater than zero' }));
    const userId = objectId(req.uid);
    const now = new Date();
    const newPaid = { $add: ['$paidAmount', payment] };
    const reminder = await collection('reminders').findOneAndUpdate(
      {
        _id: id,
        userId,
        amount: { $type: 'decimal' },
        $expr: { $lte: [newPaid, '$amount'] },
      },
      [
        {
          $set: {
            payments: {
              $concatArrays: [
                '$payments',
                [{ _id: newId(), amount: payment, paidAt: now, createdAt: now }],
              ],
            },
            paidAmount: newPaid,
            completed: { $eq: [newPaid, '$amount'] },
            updatedAt: now,
          },
        },
      ],
      { returnDocument: 'after' },
    );
    if (!reminder) {
      const current = await collection('reminders').findOne(
        { _id: id, userId },
        { projection: { amount: 1 } },
      );
      if (!current) throw fail(404, 'Reminder not found');
      if (current.amount == null)
        throw fail(400, 'Add an expected amount before recording payments');
      throw fail(400, 'Payment cannot exceed the remaining balance');
    }
    ok(res, reminderResponse(reminder), 'Payment recorded');
  }),
);

router.delete(
  '/:id/payments/:paymentId',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const paymentId = parseId(req.params.paymentId);
    const userId = objectId(req.uid);
    const removed = { $filter: { input: '$payments', cond: { $eq: ['$$this._id', paymentId] } } };
    const reminder = await collection('reminders').findOneAndUpdate(
      { _id: id, userId, 'payments._id': paymentId },
      [
        {
          $set: {
            paidAmount: {
              $subtract: ['$paidAmount', { $sum: { $map: { input: removed, in: '$$this.amount' } } }],
            },
            payments: { $filter: { input: '$payments', cond: { $ne: ['$$this._id', paymentId] } } },
            completed: false,
            updatedAt: new Date(),
          },
        },
      ],
      { returnDocument: 'after' },
    );
    if (!reminder) {
      const exists = await collection('reminders').countDocuments({ _id: id, userId }, { limit: 1 });
      if (!exists) throw fail(404, 'Reminder not found');
      throw fail(404, 'Payment not found');
    }
    ok(res, reminderResponse(reminder), 'Payment deleted');
  }),
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (typeof req.body.completed !== 'boolean') throw fail(400, 'Completed must be true or false');
    const now = new Date();
    let update;
    if (req.body.completed) {
      // Marking complete records the outstanding balance (if any) as a final payment.
      const remaining = { $subtract: ['$amount', '$paidAmount'] };
      update = [
        {
          $set: {
            payments: {
              $cond: [
                { $and: [{ $eq: [{ $type: '$amount' }, 'decimal'] }, { $gt: [remaining, 0] }] },
                {
                  $concatArrays: [
                    '$payments',
                    [{ _id: newId(), amount: remaining, paidAt: now, createdAt: now }],
                  ],
                },
                '$payments',
              ],
            },
            completed: true,
            paidAmount: { $ifNull: ['$amount', '$paidAmount'] },
            updatedAt: now,
          },
        },
      ];
    } else {
      update = { $set: { completed: false, paidAmount: ZERO, payments: [], updatedAt: now } };
    }
    const reminder = await collection('reminders').findOneAndUpdate(
      { _id: id, userId: objectId(req.uid) },
      update,
      { returnDocument: 'after' },
    );
    if (!reminder) throw fail(404, 'Reminder not found');
    ok(res, reminderResponse(reminder), 'Reminder updated');
  }),
);

router.delete(
  '/bulk',
  wrap(async (req, res) => {
    if (!Array.isArray(req.body.ids)) throw fail(400, 'Reminder ids must be an array');
    const ids = [...new Set(req.body.ids || [])];
    if (
      !ids.length ||
      ids.length > 1000 ||
      ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
    )
      throw fail(400, 'Select between 1 and 1000 valid reminders');
    const { deletedCount } = await collection('reminders').deleteMany({
      userId: objectId(req.uid),
      _id: { $in: objectIds(ids) },
    });
    ok(res, { deletedCount }, 'Selected reminders deleted');
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const { deletedCount } = await collection('reminders').deleteOne({
      _id: id,
      userId: objectId(req.uid),
    });
    if (!deletedCount) throw fail(404, 'Reminder not found');
    ok(res, {}, 'Reminder deleted');
  }),
);

module.exports = router;
