require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mongo = require('./db');
const { ensureSchema } = require('./db/schema');
const { mongoErrorStatus } = require('./db/records');
const authRoutes = require('./routes/auth');
const { router: expenseRoutes, dashboard: dashboardRoutes } = require('./routes/expenses');
const incomeRoutes = require('./routes/income');
const budgetRoutes = require('./routes/budgets');
const reminderRoutes = require('./routes/reminders');
const passwordVaultRoutes = require('./routes/passwordVault');
const reportRoutes = require('./routes/reports');
const transactionRoutes = require('./routes/transactions');
const scheduledMessageRoutes = require('./routes/messages');
const migrationRoutes = require('./routes/migration');
const { startMessageScheduler } = require('./services/messageScheduler');
const {
  startHiddenExpenseRecoveryScheduler,
} = require('./services/hiddenExpenseRecoveryScheduler');
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
  express.json({ limit: '2mb' }),
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
app.use('/api/password-vault', passwordVaultRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/messages', scheduledMessageRoutes);
app.use('/api/admin/migration', migrationRoutes);
app.use((error, req, res, next) => {
  const status = error.status || mongoErrorStatus(error) || 500;
  if (status === 500) console.error(error);
  res
    .status(status)
    .json({ success: false, message: status === 500 ? 'Server error' : error.message });
});

mongo
  .connect()
  .then((db) => ensureSchema(db))
  .then(() => {
    if (!process.env.VERCEL) {
      startMessageScheduler();
      startHiddenExpenseRecoveryScheduler();
    }
    app.listen(process.env.PORT || 5000, () => console.log('SpendWise API running'));
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  });
