require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const { router: expenseRoutes, dashboard: dashboardRoutes } = require('./routes/expenses');
const incomeRoutes = require('./routes/income');
const budgetRoutes = require('./routes/budgets');
const reminderRoutes = require('./routes/reminders');
const reportRoutes = require('./routes/reports');
const scheduledMessageRoutes = require('./routes/messages');
const { startMessageScheduler } = require('./services/messageScheduler');
const { startHiddenExpenseRecoveryScheduler } = require('./services/hiddenExpenseRecoveryScheduler');
const { sendDueMessages } = require('./services/messageScheduler');
const { sendQueuedRecoveryEmails } = require('./services/hiddenExpenseRecoveryScheduler');

const app = express();
const allowedClientOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((clientUrl) => {
    try {
      return new URL(clientUrl).origin;
    } catch {
      return clientUrl;
    }
  });
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || !allowedClientOrigins.length || allowedClientOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin is not allowed by CORS'));
      }
    },
  }),
  express.json({ limit: '1mb' }),
);
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/cron/process', async (req, res, next) => {
  if (!process.env.CRON_SECRET || req.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ success: false, message: 'Not authorized' });
  try {
    await sendDueMessages();
    await sendQueuedRecoveryEmails();
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/messages', scheduledMessageRoutes);
app.use((error, req, res, next) => {
  const status =
    error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500);
  if (status === 500) console.error(error);
  res
    .status(status)
    .json({ success: false, message: status === 500 ? 'Server error' : error.message });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    if (!process.env.VERCEL) {
      startMessageScheduler();
      startHiddenExpenseRecoveryScheduler();
    }
    app.listen(process.env.PORT || 5000, () => console.log('SpendWise API running'));
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
