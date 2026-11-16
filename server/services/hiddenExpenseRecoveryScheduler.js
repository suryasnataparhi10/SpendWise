const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { collection } = require('../db');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendQueuedRecoveryEmails() {
  const emails = collection('hiddenRecoveryEmails');
  await emails.deleteMany({ expiresAt: { $lte: new Date() } });
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  const jobs = await emails
    .find({ expiresAt: { $gt: new Date() }, sentAt: null })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray();
  if (!jobs.length) return;

  const transporter = createTransporter();
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  for (const job of jobs) {
    const stillValid = await collection('users').countDocuments(
      {
        _id: job.userId,
        hiddenExpenseOtpHash: job.tokenHash,
        hiddenExpenseOtpExpires: { $gt: new Date() },
      },
      { limit: 1 },
    );
    if (!stillValid) {
      await emails.deleteOne({ _id: job._id });
      continue;
    }
    const link = `${clientUrl}/reset-hidden-pin/${job.token}`;
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: job.to,
        subject: 'Reset your SpendWise hidden-expense PIN',
        text: `Use this one-time link to reset your hidden-expense PIN: ${link}\n\nThe link expires in 10 minutes. If you did not request this, you can ignore this email.`,
        html: `<p>Use this one-time link to reset your hidden-expense PIN:</p><p><a href="${link}">Reset hidden-expense PIN</a></p><p>This link expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
      });
      const sentAt = new Date();
      await emails.updateOne({ _id: job._id }, { $set: { sentAt, updatedAt: sentAt } });
    } catch (error) {
      if (job.attempts + 1 >= 5) {
        await emails.deleteOne({ _id: job._id });
      } else {
        await emails.updateOne(
          { _id: job._id },
          { $inc: { attempts: 1 }, $set: { updatedAt: new Date() } },
        );
      }
      console.error('Hidden-expense PIN recovery email failed:', error.message);
    }
  }
}

function startHiddenExpenseRecoveryScheduler() {
  cron.schedule(
    '* * * * *',
    () => {
      sendQueuedRecoveryEmails().catch((error) => {
        console.error('Hidden-expense recovery email scheduler failed:', error.message);
      });
    },
    { noOverlap: true },
  );
}

module.exports = { startHiddenExpenseRecoveryScheduler, sendQueuedRecoveryEmails };
