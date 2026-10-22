const express = require('express');
const ScheduledMessage = require('../models/ScheduledMessage');
const auth = require('../middleware/auth');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

router.get('/status', (req, res) => {
  ok(res, {
    emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  });
});

router.get(
  '/',
  wrap(async (req, res) => {
    ok(
      res,
      await ScheduledMessage.find({ userId: req.uid, channel: 'email' }).sort({
        active: -1,
        nextSendAt: 1,
        createdAt: -1,
      }),
    );
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const contactName = String(req.body.contactName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const message = String(req.body.message || '').trim();
    const scheduledAt = new Date(req.body.scheduledAt);
    const frequency = String(req.body.frequency || 'once');
    const channel = 'email';
    const timeZone = String(req.body.timeZone || 'Asia/Kolkata');
    const intervalDays = Number(req.body.intervalDays);
    const endAt = req.body.endAt ? new Date(req.body.endAt) : undefined;
    if (!contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message || message.length > 1500)
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
    const created = await ScheduledMessage.create({
      userId: req.uid,
      contactName,
      email,
      channel,
      messageType: req.body.messageType || 'greeting',
      message,
      frequency,
      intervalDays: frequency === 'custom' ? intervalDays : undefined,
      timeZone,
      recipientConsented: true,
      scheduledAt,
      nextSendAt: scheduledAt,
      endAt,
    });
    ok(res, created, 'Message scheduled', 201);
  }),
);

router.put(
  '/:id',
  wrap(async (req, res) => {
    const contactName = String(req.body.contactName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const messageText = String(req.body.message || '').trim();
    const scheduledAt = new Date(req.body.scheduledAt);
    const frequency = String(req.body.frequency || 'once');
    const channel = 'email';
    const timeZone = String(req.body.timeZone || 'Asia/Kolkata');
    const intervalDays = Number(req.body.intervalDays);
    const endAt = req.body.endAt ? new Date(req.body.endAt) : undefined;
    if (
      !contactName ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !messageText ||
      messageText.length > 1500
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
    const changes = {
      contactName,
      email,
      recipientConsented: true,
      channel,
      messageType: req.body.messageType || 'greeting',
      message: messageText,
      frequency,
      ...(frequency === 'custom' ? { intervalDays } : {}),
      timeZone,
      scheduledAt,
      nextSendAt: scheduledAt,
      active: true,
      lockedAt: null,
      lastSentAt: null,
      lastError: '',
      ...(endAt ? { endAt } : {}),
    };
    const updated = await ScheduledMessage.findOneAndUpdate(
      { _id: req.params.id, userId: req.uid },
      {
        $set: changes,
        $unset: {
          ...(!endAt ? { endAt: 1 } : {}),
          ...(frequency !== 'custom' ? { intervalDays: 1 } : {}),
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) throw fail(404, 'Scheduled message not found');
    ok(res, updated, 'Scheduled message updated');
  }),
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const message = await ScheduledMessage.findOneAndUpdate(
      { _id: req.params.id, userId: req.uid },
      { $set: { active: Boolean(req.body.active) } },
      { new: true, runValidators: true },
    );
    if (!message) throw fail(404, 'Scheduled message not found');
    ok(res, message, message.active ? 'Schedule resumed' : 'Schedule paused');
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const message = await ScheduledMessage.findOneAndDelete({
      _id: req.params.id,
      userId: req.uid,
    });
    if (!message) throw fail(404, 'Scheduled message not found');
    ok(res, {}, 'Scheduled message deleted');
  }),
);

module.exports = router;
