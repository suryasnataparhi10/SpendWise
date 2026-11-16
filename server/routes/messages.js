const express = require('express');
const { collection } = require('../db');
const auth = require('../middleware/auth');
const { toApi, objectId, newId } = require('../db/records');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

function parseId(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    throw fail(400, 'Invalid scheduled message id');
  return objectId(value);
}

function parseSchedule(body) {
  const contactName = String(body.contactName || '').trim();
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const message = String(body.message || '').trim();
  const scheduledAt = new Date(body.scheduledAt);
  const frequency = String(body.frequency || 'once');
  const timeZone = String(body.timeZone || 'Asia/Kolkata');
  const intervalDays = Number(body.intervalDays);
  const endAt = body.endAt ? new Date(body.endAt) : null;
  if (
    !contactName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !message ||
    message.length > 1500
  )
    throw fail(
      400,
      'Enter a contact name, a valid email address, and a message under 1500 characters',
    );
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date())
    throw fail(400, 'Choose a future send date and time');
  if (!['once', 'daily', 'weekly', 'monthly', 'custom'].includes(frequency))
    throw fail(400, 'Choose a valid repeat schedule');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw fail(400, 'Choose a valid time zone');
  }
  if (
    frequency === 'custom' &&
    (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365)
  )
    throw fail(400, 'Custom repeat interval must be between 1 and 365 days');
  if (endAt && (!Number.isFinite(endAt.getTime()) || endAt < scheduledAt))
    throw fail(400, 'End date must be after the first send');
  return {
    contactName,
    email,
    message,
    scheduledAt,
    frequency,
    timeZone,
    intervalDays: frequency === 'custom' ? intervalDays : null,
    endAt,
    messageType: body.messageType || 'greeting',
  };
}

router.get('/status', (req, res) => {
  ok(res, {
    emailConfigured: Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
    ),
  });
});

router.get(
  '/',
  wrap(async (req, res) => {
    const messages = await collection('scheduledMessages')
      .find({ userId: objectId(req.uid), channel: 'email' })
      .sort({ active: -1, nextSendAt: 1, createdAt: -1 })
      .toArray();
    ok(res, toApi(messages));
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const schedule = parseSchedule(req.body);
    const now = new Date();
    const message = {
      _id: newId(),
      userId: objectId(req.uid),
      contactName: schedule.contactName,
      email: schedule.email,
      recipientConsented: true,
      channel: 'email',
      messageType: schedule.messageType,
      message: schedule.message,
      frequency: schedule.frequency,
      intervalDays: schedule.intervalDays,
      timeZone: schedule.timeZone,
      scheduledAt: schedule.scheduledAt,
      nextSendAt: schedule.scheduledAt,
      endAt: schedule.endAt,
      active: true,
      lockedAt: null,
      lastSentAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    await collection('scheduledMessages').insertOne(message);
    ok(res, toApi(message), 'Message scheduled', 201);
  }),
);

router.put(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const schedule = parseSchedule(req.body);
    const message = await collection('scheduledMessages').findOneAndUpdate(
      { _id: id, userId: objectId(req.uid) },
      {
        $set: {
          contactName: schedule.contactName,
          email: schedule.email,
          recipientConsented: true,
          channel: 'email',
          messageType: schedule.messageType,
          message: schedule.message,
          frequency: schedule.frequency,
          intervalDays: schedule.intervalDays,
          timeZone: schedule.timeZone,
          scheduledAt: schedule.scheduledAt,
          nextSendAt: schedule.scheduledAt,
          endAt: schedule.endAt,
          active: true,
          lockedAt: null,
          lastSentAt: null,
          lastError: '',
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    if (!message) throw fail(404, 'Scheduled message not found');
    ok(res, toApi(message), 'Scheduled message updated');
  }),
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await collection('scheduledMessages').findOneAndUpdate(
      { _id: id, userId: objectId(req.uid) },
      { $set: { active: Boolean(req.body.active), updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!updated) throw fail(404, 'Scheduled message not found');
    const message = toApi(updated);
    ok(res, message, message.active ? 'Schedule resumed' : 'Schedule paused');
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const { deletedCount } = await collection('scheduledMessages').deleteOne({
      _id: id,
      userId: objectId(req.uid),
    });
    if (!deletedCount) throw fail(404, 'Scheduled message not found');
    ok(res, {}, 'Scheduled message deleted');
  }),
);

module.exports = router;
