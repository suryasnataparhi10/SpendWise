const ScheduledMessage = require('../models/ScheduledMessage');
const cron = require('node-cron');

const emailReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

async function send(message) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: message.email,
    subject: `A message for ${message.contactName}`,
    text: message.message,
  });
  const recipientAccepted = (result.accepted || []).some((entry) => {
    const address = typeof entry === 'string' ? entry : entry?.address;
    return String(address || '').toLowerCase() === String(message.email || '').toLowerCase();
  });
  if (!recipientAccepted) {
    const rejection = result.rejectedErrors?.[0]?.message || result.response || 'SMTP server did not accept the recipient';
    throw new Error(rejection);
  }
  return { messageId: result.messageId, response: result.response };
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map(({ type, value }) => [type, Number(value)]),
  );
}

function fromZonedParts(parts, timeZone) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let estimate = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = zonedParts(new Date(estimate), timeZone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const correction = target - represented;
    estimate += correction;
    if (!correction) break;
  }
  return new Date(estimate);
}

function nextOccurrence(message, from) {
  if (message.frequency === 'once') return null;
  const timeZone = message.timeZone || 'Asia/Kolkata';
  const local = zonedParts(from, timeZone);
  const scheduledLocal = zonedParts(new Date(message.scheduledAt), timeZone);
  const calendarDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (message.frequency === 'daily') calendarDate.setUTCDate(calendarDate.getUTCDate() + 1);
  else if (message.frequency === 'weekly') calendarDate.setUTCDate(calendarDate.getUTCDate() + 7);
  else if (message.frequency === 'custom')
    calendarDate.setUTCDate(calendarDate.getUTCDate() + message.intervalDays);
  else if (message.frequency === 'monthly') {
    const preferredDay = scheduledLocal.day;
    calendarDate.setUTCDate(1);
    calendarDate.setUTCMonth(calendarDate.getUTCMonth() + 1);
    const lastDay = new Date(
      Date.UTC(calendarDate.getUTCFullYear(), calendarDate.getUTCMonth() + 1, 0),
    ).getUTCDate();
    calendarDate.setUTCDate(Math.min(preferredDay, lastDay));
  } else return null;
  return fromZonedParts(
    {
      year: calendarDate.getUTCFullYear(),
      month: calendarDate.getUTCMonth() + 1,
      day: calendarDate.getUTCDate(),
      hour: scheduledLocal.hour,
      minute: scheduledLocal.minute,
    },
    timeZone,
  );
}

async function sendDueMessages() {
  if (!emailReady()) return;
  for (let count = 0; count < 25; count++) {
    const now = new Date();
    const message = await ScheduledMessage.findOneAndUpdate(
      {
        active: true,
        channel: 'email',
        nextSendAt: { $lte: now },
        $or: [{ lockedAt: null }, { lockedAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } }],
      },
      { $set: { lockedAt: now } },
      { sort: { nextSendAt: 1 }, new: true },
    );
    if (!message) return;
    try {
      const personalized = message.message.replace(/\{name\}/gi, message.contactName);
      await send({ ...message.toObject(), message: personalized });
      const next = nextOccurrence(message, now);
      const stopAfterSend = !next || (message.endAt && next > message.endAt);
      await ScheduledMessage.updateOne(
        { _id: message._id },
        {
          $set: {
            active: !stopAfterSend,
            lastSentAt: now,
            lastError: '',
            lockedAt: null,
            ...(next && !stopAfterSend ? { nextSendAt: next } : {}),
          },
        },
      );
    } catch (error) {
      await ScheduledMessage.updateOne(
        { _id: message._id },
        {
          $set: {
            lastError: String(error.message || error).slice(0, 500),
            lockedAt: null,
            nextSendAt: new Date(now.getTime() + 5 * 60 * 1000),
          },
        },
      );
    }
  }
}

function startMessageScheduler() {
  const poll = () =>
    sendDueMessages().catch((error) => console.error('Message scheduler failed:', error));
  poll();
  return cron.schedule('* * * * *', poll, { noOverlap: true });
}

module.exports = { startMessageScheduler, sendDueMessages };
