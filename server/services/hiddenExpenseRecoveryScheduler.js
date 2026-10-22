const cron = require('node-cron');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const RecoveryEmail = require('../models/HiddenExpenseRecoveryEmail');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendQueuedRecoveryEmails() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  const jobs = await RecoveryEmail.find({ expiresAt: { $gt: new Date() }, sentAt: { $exists: false } })
    .select('+token')
    .sort({ createdAt: 1 })
    .limit(20);
  if (!jobs.length) return;

  const transporter = createTransporter();
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
  for (const job of jobs) {
    const user = await User.findOne({
      _id: job.userId,
      hiddenExpenseOtpHash: job.tokenHash,
      hiddenExpenseOtpExpires: { $gt: new Date() },
    });
    if (!user) {
      await RecoveryEmail.deleteOne({ _id: job._id });
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
      job.sentAt = new Date();
      await job.save();
    } catch (error) {
      job.attempts += 1;
      if (job.attempts >= 5) await RecoveryEmail.deleteOne({ _id: job._id });
      else await job.save();
      console.error('Hidden-expense PIN recovery email failed:', error.message);
    }
  }
}

function startHiddenExpenseRecoveryScheduler() {
  cron.schedule('* * * * *', () => {
    sendQueuedRecoveryEmails().catch((error) => {
      console.error('Hidden-expense recovery email scheduler failed:', error.message);
    });
  }, { noOverlap: true });
}

module.exports = { startHiddenExpenseRecoveryScheduler, sendQueuedRecoveryEmails };
