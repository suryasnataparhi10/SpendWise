require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongo = require('../db');
const { objectId } = require('../db/records');

const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api';
const testUserIds = [];
// End-to-end API test against a running SpendWise API backed by MongoDB. Creates two throwaway
// accounts, exercises every module, and deletes the accounts and everything they own afterwards.

async function request(
  path,
  { method = 'GET', token, hiddenToken, body, expectedStatus = 200 } = {},
) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (hiddenToken) headers['x-hidden-expense-token'] = hiddenToken;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, `${method} ${path}: ${JSON.stringify(payload)}`);
  return payload.data;
}

async function main() {
  const stamp = crypto.randomBytes(5).toString('hex');
  const email = `api-smoke-${stamp}@example.test`;
  const isolationEmail = `api-isolation-${stamp}@example.test`;
  const password = 'Smoke-test-Password-9482';
  const first = await request('/auth/register', {
    method: 'POST',
    body: { name: 'Migration Smoke', email, password },
    expectedStatus: 201,
  });
  testUserIds.push(first.user.id);
  const second = await request('/auth/register', {
    method: 'POST',
    body: { name: 'Isolation Smoke', email: isolationEmail, password },
    expectedStatus: 201,
  });
  testUserIds.push(second.user.id);

  const login = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(login.user.id, first.user.id);
  const me = await request('/auth/me', { token: login.token });
  assert.equal(me.email, email);
  assert.equal(Object.hasOwn(me, 'password'), false);
  assert.equal(me.themePreferences.colorTheme, 'midnight-mint');
  const savedTheme = await request('/auth/theme-preferences', {
    method: 'PATCH',
    token: login.token,
    body: { colorTheme: 'glassmorphism', appearance: 'dark', customAccent: '#2384a1' },
  });
  assert.deepEqual(savedTheme.themePreferences, {
    colorTheme: 'glassmorphism',
    appearance: 'dark',
    customAccent: '#2384a1',
  });
  const isolatedProfile = await request('/auth/me', { token: second.token });
  assert.equal(isolatedProfile.themePreferences.colorTheme, 'midnight-mint');
  const relogin = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(relogin.user.themePreferences.colorTheme, 'glassmorphism');
  await request('/auth/theme-preferences', {
    method: 'PATCH',
    token: login.token,
    body: { colorTheme: 'not-a-theme' },
    expectedStatus: 400,
  });
  const sampleAvatar = 'data:image/jpeg;base64,/9j/2Q==';
  const profileWithAvatar = await request('/auth/profile', {
    method: 'PATCH',
    token: login.token,
    body: { name: 'Migration Smoke', avatar: sampleAvatar },
  });
  assert.equal(profileWithAvatar.avatar, sampleAvatar);
  const replacementAvatar = 'data:image/jpeg;base64,/9j/4Q==';
  const replacedProfile = await request('/auth/profile', {
    method: 'PATCH',
    token: login.token,
    body: { name: 'Migration Smoke', avatar: replacementAvatar },
  });
  assert.equal(replacedProfile.avatar, replacementAvatar);
  await request('/auth/profile', {
    method: 'PATCH',
    token: login.token,
    body: { name: 'Migration Smoke', avatar: 'data:image/svg+xml;base64,PHN2Zy8+' },
    expectedStatus: 400,
  });
  const oversizedImage = Buffer.alloc(675_001);
  oversizedImage.set([0xff, 0xd8, 0xff]);
  await request('/auth/profile', {
    method: 'PATCH',
    token: login.token,
    body: {
      name: 'Migration Smoke',
      avatar: `data:image/jpeg;base64,${oversizedImage.toString('base64')}`,
    },
    expectedStatus: 400,
  });
  const profileWithoutAvatar = await request('/auth/profile', {
    method: 'PATCH',
    token: login.token,
    body: { name: 'Migration Smoke', avatar: '' },
  });
  assert.equal(profileWithoutAvatar.avatar, '');
  await request('/auth/register', {
    method: 'POST',
    body: { name: 'Duplicate', email, password },
    expectedStatus: 409,
  });

  const date = '2026-10-28T08:00:00.000Z';
  await request('/expenses', {
    method: 'POST',
    token: login.token,
    expectedStatus: 400,
    body: { date, amount: '1.005', item: 'Invalid precision', category: 'Other' },
  });
  const expense1 = await request('/expenses', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: {
      date,
      amount: '12.35',
      item: 'Smoke groceries',
      category: 'Food',
      hasSubtypes: true,
      subtypes: [{ type: 'Fruit', amount: '2.35', paymentMethod: 'Card' }],
    },
  });
  const expense2 = await request('/expenses', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: { date, amount: '7.65', item: 'Smoke transport', category: 'Travel' },
  });
  assert.equal(expense1.amount, 12.35);
  assert.equal(expense1.subtypes[0].amount, 2.35);
  const sameDay = await request(
    '/expenses?from=2026-10-28T00%3A00%3A00.000Z&to=2026-10-28T23%3A59%3A59.999Z',
    { token: login.token },
  );
  assert.equal(sameDay.length, 2);
  const filtered = await request('/expenses?search=groceries&month=10&year=2026', {
    token: login.token,
  });
  assert.equal(filtered.length, 1);
  const updated = await request(`/expenses/${expense1._id}`, {
    method: 'PUT',
    token: login.token,
    body: {
      date,
      amount: '13.35',
      item: 'Smoke groceries updated',
      category: 'Food',
      hasSubtypes: true,
      subtypes: [{ type: 'Fruit', amount: '3.35', paymentMethod: 'Card' }],
    },
  });
  assert.equal(updated.amount, 13.35);
  assert.equal(updated.subtypes[0].amount, 3.35);

  const hidden = await request('/expenses', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: { date, amount: '4.00', item: 'Smoke hidden', category: 'Other', isLocked: true },
  });
  await request('/expenses?locked=true', { token: login.token, expectedStatus: 401 });
  const key = 'smokeKey9482';
  await request('/expenses/lock-key/set', {
    method: 'POST',
    token: login.token,
    body: { key },
  });
  const unlock = await request('/expenses/lock-key/unlock', {
    method: 'POST',
    token: login.token,
    body: { key },
  });
  const hiddenExpenses = await request('/expenses?locked=true', {
    token: login.token,
    hiddenToken: unlock.token,
  });
  assert(hiddenExpenses.some((row) => row._id === hidden._id));
  const suggestions = await request('/expenses/suggestions', { token: login.token });
  assert(suggestions.items.includes('Smoke groceries updated'));
  assert(suggestions.subtypes.includes('Fruit'));

  const summary = await request('/dashboard/summary?month=10&year=2026', {
    token: login.token,
  });
  assert.equal(summary.totalMonthExpense, 25); // 13.35 + 7.65 + 4.00 hidden (hidden amounts count; names are masked)
  assert.equal(summary.dailyBreakdown.length, 1);
  assert.equal(summary.dailyBreakdown[0].total, 25);
  const insights = await request('/expenses/insights?month=10&year=2026', {
    token: login.token,
  });
  assert.equal(insights.total, 25);
  const yearly = await request('/expenses/yearly?year=2026', { token: login.token });
  const octoberExpenses = yearly.find((row) => row._id === 10);
  assert.ok(octoberExpenses, `October expense summary missing: ${JSON.stringify(yearly)}`);
  assert.equal(octoberExpenses.total, 25);
  assert.equal((await request('/reports/yearly?year=2026', { token: login.token })).length, 12);

  const income = await request('/income', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: { date, amount: '102.50', source: 'Smoke test' },
  });
  assert.equal(income.amount, 102.5);
  const updatedIncome = await request(`/income/${income._id}`, {
    method: 'PUT',
    token: login.token,
    body: { date, amount: '103.50', source: 'Updated smoke income' },
  });
  assert.equal(updatedIncome.amount, 103.5);
  assert.equal(updatedIncome.source, 'Updated smoke income');
  await request(`/income/${income._id}`, {
    method: 'PUT',
    token: login.token,
    expectedStatus: 400,
    body: { date, amount: '0', source: 'Invalid income' },
  });
  await request(`/income/${income._id}`, {
    method: 'PUT',
    token: second.token,
    expectedStatus: 404,
    body: { date, amount: '200', source: 'Unauthorized income edit' },
  });
  const incomes = await request('/income?year=2026&month=10', { token: login.token });
  assert(
    incomes.some(
      (row) =>
        row._id === income._id && row.amount === 103.5 && row.source === 'Updated smoke income',
    ),
  );
  const budget = await request('/budgets', {
    method: 'PUT',
    token: login.token,
    body: { month: 10, year: 2026, limit: '500.25' },
  });
  assert.equal(budget.limit, 500.25);
  const budgets = await request('/budgets?year=2026', { token: login.token });
  assert.equal(budgets.find((row) => row.month === 10).spent, 25);

  const reminder = await request('/reminders', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: { title: 'Smoke reminder', dueDate: date, amount: '100' },
  });
  assert.equal(reminder.paidAmount, 0);
  const paymentDate = new Date();
  const paymentMonth = paymentDate.getUTCMonth() + 1;
  const paymentYear = paymentDate.getUTCFullYear();
  const summaryBeforePayment = await request(
    `/dashboard/summary?month=${paymentMonth}&year=${paymentYear}`,
    { token: login.token },
  );
  const reportBeforePayment = (
    await request(`/reports/yearly?year=${paymentYear}`, { token: login.token })
  ).find((month) => month.month === paymentMonth);
  const partialPayment = await request(`/reminders/${reminder._id}/payments`, {
    method: 'POST',
    token: login.token,
    body: { amount: '35.25' },
  });
  assert.equal(partialPayment.paidAmount, 35.25);
  assert.equal(partialPayment.completed, false);
  const statement = await request('/transactions?page=1&pageSize=2', { token: login.token });
  assert.equal(statement.total, 5);
  assert.equal(statement.pageCount, 3);
  assert.equal(statement.credits, 103.5);
  assert.equal(statement.debits, 60.25);
  assert.equal(statement.closingBalance, 43.25);
  assert.equal(statement.items.length, 2);
  const statementPayment = statement.items.find((item) => item.type === 'reminder_payment');
  assert(statementPayment);
  assert.equal(statementPayment.balance, 43.25);
  const octoberStatement = await request('/transactions?from=2026-10-28&to=2026-10-28', {
    token: login.token,
  });
  assert.equal(octoberStatement.total, 4);
  assert.equal(octoberStatement.credits, 103.5);
  assert.equal(octoberStatement.debits, 25);
  await request('/transactions?from=2026-02-30', { token: login.token, expectedStatus: 400 });
  const summaryAfterPayment = await request(
    `/dashboard/summary?month=${paymentMonth}&year=${paymentYear}`,
    { token: login.token },
  );
  assert.equal(
    summaryAfterPayment.totalMonthExpense,
    summaryBeforePayment.totalMonthExpense + 35.25,
  );
  assert.equal(summaryAfterPayment.remainingBalance, summaryBeforePayment.remainingBalance - 35.25);
  const reportAfterPayment = (
    await request(`/reports/yearly?year=${paymentYear}`, { token: login.token })
  ).find((month) => month.month === paymentMonth);
  assert.equal(reportAfterPayment.expenses, reportBeforePayment.expenses + 35.25);
  assert.equal(reportAfterPayment.net, reportBeforePayment.net - 35.25);
  await request('/budgets', {
    method: 'PUT',
    token: login.token,
    body: { month: paymentMonth, year: paymentYear, limit: '500' },
  });
  const currentMonthBudget = (
    await request(`/budgets?year=${paymentYear}`, {
      token: login.token,
    })
  ).find((budget) => budget.month === paymentMonth);
  assert.equal(currentMonthBudget.spent, summaryAfterPayment.totalMonthExpense);
  await request(`/reminders/${reminder._id}/payments`, {
    method: 'POST',
    token: login.token,
    body: { amount: '10' },
  });
  let reminders = await request('/reminders', { token: login.token });
  let reminderWithPayments = reminders.find((row) => row._id === reminder._id);
  assert.equal(reminderWithPayments.payments.length, 2);
  const firstPayment = reminderWithPayments.payments.find((payment) => payment.amount === 35.25);
  await request(`/reminders/${reminder._id}/payments/${firstPayment._id}`, {
    method: 'DELETE',
    token: login.token,
  });
  const summaryAfterPaymentDeletion = await request(
    `/dashboard/summary?month=${paymentMonth}&year=${paymentYear}`,
    { token: login.token },
  );
  assert.equal(
    summaryAfterPaymentDeletion.totalMonthExpense,
    summaryBeforePayment.totalMonthExpense + 10,
  );
  reminders = await request('/reminders', { token: login.token });
  reminderWithPayments = reminders.find((row) => row._id === reminder._id);
  assert.equal(reminderWithPayments.paidAmount, 10);
  assert.equal(reminderWithPayments.payments.length, 1);
  await request(`/reminders/${reminder._id}/payments/${reminderWithPayments.payments[0]._id}`, {
    method: 'DELETE',
    token: login.token,
  });
  reminders = await request('/reminders', { token: login.token });
  reminderWithPayments = reminders.find((row) => row._id === reminder._id);
  assert.equal(reminderWithPayments.paidAmount, 0);
  assert.equal(reminderWithPayments.payments.length, 0);
  const replacementPayment = await request(`/reminders/${reminder._id}/payments`, {
    method: 'POST',
    token: login.token,
    body: { amount: '35.25' },
  });
  assert.equal(replacementPayment.paidAmount, 35.25);
  await request(`/reminders/${reminder._id}/payments`, {
    method: 'POST',
    token: login.token,
    expectedStatus: 400,
    body: { amount: '65' },
  });
  const finalPayment = await request(`/reminders/${reminder._id}/payments`, {
    method: 'POST',
    token: login.token,
    body: { amount: '64.75' },
  });
  assert.equal(finalPayment.paidAmount, 100);
  assert.equal(finalPayment.completed, true);
  const summaryAfterCompletion = await request(
    `/dashboard/summary?month=${paymentMonth}&year=${paymentYear}`,
    { token: login.token },
  );
  assert.equal(
    summaryAfterCompletion.totalMonthExpense,
    summaryBeforePayment.totalMonthExpense + 100,
  );
  const completed = await request(`/reminders/${reminder._id}`, {
    method: 'PATCH',
    token: login.token,
    body: { completed: false },
  });
  assert.equal(completed.completed, false);
  assert.equal(completed.paidAmount, 0);
  const summaryAfterUnmarking = await request(
    `/dashboard/summary?month=${paymentMonth}&year=${paymentYear}`,
    { token: login.token },
  );
  assert.equal(summaryAfterUnmarking.totalMonthExpense, summaryBeforePayment.totalMonthExpense);
  const statementAfterUnmarking = await request('/transactions', { token: login.token });
  assert.equal(statementAfterUnmarking.total, 4);
  assert.equal(statementAfterUnmarking.debits, 25);
  reminders = await request('/reminders', { token: login.token });
  reminderWithPayments = reminders.find((row) => row._id === reminder._id);
  assert.equal(reminderWithPayments.payments.length, 0);

  assert.equal(await request('/password-vault', { token: login.token }), null);
  const encryptedVault = {
    salt: Buffer.alloc(16, 1).toString('base64'),
    iv: Buffer.alloc(12, 2).toString('base64'),
    ciphertext: Buffer.alloc(32, 3).toString('base64'),
  };
  await request('/password-vault', {
    method: 'PUT',
    token: login.token,
    expectedStatus: 400,
    body: { ...encryptedVault, ciphertext: 'not-encrypted-data' },
  });
  await request('/password-vault', {
    method: 'PUT',
    token: login.token,
    body: encryptedVault,
  });
  assert.equal(
    (await request('/password-vault', { token: login.token })).ciphertext,
    encryptedVault.ciphertext,
  );
  assert.equal(await request('/password-vault', { token: second.token }), null);

  const otherExpenses = await request('/expenses', { token: second.token });
  assert.equal(otherExpenses.length, 0);
  assert.equal((await request('/transactions', { token: second.token })).total, 0);

  const bulkExpenses = await request('/expenses/bulk', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: {
      expenses: [
        { date: '2026-09-10T08:00:00.000Z', amount: '1.10', item: 'Bulk smoke one' },
        { date: '2026-09-10T08:00:00.000Z', amount: '2.20', item: 'Bulk smoke two' },
      ],
    },
  });
  assert.equal(bulkExpenses.length, 2);
  const lockedBulk = await request('/expenses/bulk/lock', {
    method: 'PATCH',
    token: login.token,
    body: { ids: bulkExpenses.map((row) => row._id), isLocked: true },
  });
  assert.equal(lockedBulk.modifiedCount, 2);
  const unlockedBulk = await request('/expenses/bulk/lock', {
    method: 'PATCH',
    token: login.token,
    body: { ids: bulkExpenses.map((row) => row._id), isLocked: false },
  });
  assert.equal(unlockedBulk.modifiedCount, 2);
  const deletedBulk = await request('/expenses/bulk', {
    method: 'DELETE',
    token: login.token,
    body: { ids: bulkExpenses.map((row) => row._id) },
  });
  assert.equal(deletedBulk.deletedCount, 2);

  const secondIncome = await request('/income', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: { date, amount: '2.75', source: 'Bulk smoke income' },
  });
  const deletedIncome = await request('/income/bulk', {
    method: 'DELETE',
    token: login.token,
    body: { ids: [income._id, secondIncome._id] },
  });
  assert.equal(deletedIncome.deletedCount, 2);

  const secondReminder = await request('/reminders', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: { title: 'Bulk smoke reminder', dueDate: date },
  });
  const deletedReminders = await request('/reminders/bulk', {
    method: 'DELETE',
    token: login.token,
    body: { ids: [reminder._id, secondReminder._id] },
  });
  assert.equal(deletedReminders.deletedCount, 2);

  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const message = await request('/messages', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: {
      contactName: 'Smoke Recipient',
      email: 'smoke@example.test',
      message: 'Smoke message',
      scheduledAt,
      frequency: 'once',
    },
  });
  const messages = await request('/messages', { token: login.token });
  assert(messages.some((row) => row._id === message._id));
  const paused = await request(`/messages/${message._id}`, {
    method: 'PATCH',
    token: login.token,
    body: { active: false },
  });
  assert.equal(paused.active, false);

  const editedAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const edited = await request(`/messages/${message._id}`, {
    method: 'PUT',
    token: login.token,
    body: {
      contactName: 'Edited Recipient',
      email: 'EDITED@example.test',
      message: 'Edited {name}',
      scheduledAt: editedAt,
      frequency: 'custom',
      intervalDays: 3,
      messageType: 'celebration',
    },
  });
  assert.equal(edited.active, true);
  assert.equal(edited.email, 'edited@example.test');
  assert.equal(edited.intervalDays, 3);
  assert.equal(edited.lastError, '');
  assert.equal(edited.nextSendAt, editedAt);
  await request(`/messages/${message._id}`, {
    method: 'PUT',
    token: login.token,
    expectedStatus: 400,
    body: { contactName: 'X', email: 'x@example.test', message: 'm', scheduledAt: editedAt, messageType: 'spam' },
  });
  await request(`/messages/${message._id}`, {
    method: 'PATCH',
    token: second.token,
    expectedStatus: 404,
    body: { active: false },
  });

  // Mark complete records the outstanding balance as one final payment.
  const billed = await request('/reminders', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: { title: 'Complete me', dueDate: date, amount: '80.10' },
  });
  await request(`/reminders/${billed._id}/payments`, {
    method: 'POST',
    token: login.token,
    body: { amount: '30.05' },
  });
  const markedDone = await request(`/reminders/${billed._id}`, {
    method: 'PATCH',
    token: login.token,
    body: { completed: true },
  });
  assert.equal(markedDone.completed, true);
  assert.equal(markedDone.paidAmount, 80.1);
  assert.equal(Object.hasOwn(markedDone, 'payments'), false);
  const billedList = (await request('/reminders', { token: login.token })).find((r) => r._id === billed._id);
  assert.deepEqual(billedList.payments.map((p) => p.amount).sort(), [30.05, 50.05]);
  const noAmount = await request('/reminders', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: { title: 'No amount', dueDate: date },
  });
  assert.equal(noAmount.amount, null);
  await request(`/reminders/${noAmount._id}/payments`, {
    method: 'POST',
    token: login.token,
    expectedStatus: 400,
    body: { amount: '1' },
  });
  await request(`/reminders/${billed._id}/payments`, {
    method: 'POST',
    token: second.token,
    expectedStatus: 404,
    body: { amount: '1' },
  });
  await request(`/reminders/${billed._id}/payments/000000000000000000000000`, {
    method: 'DELETE',
    token: login.token,
    expectedStatus: 404,
  });
  await request('/reminders/bulk', {
    method: 'DELETE',
    token: login.token,
    body: { ids: [billed._id, noAmount._id] },
  });

  // Deleted-items bin: soft delete, hidden privacy, restore, permanent delete.
  const binned = await request('/expenses', {
    method: 'POST',
    token: login.token,
    expectedStatus: 201,
    body: { date, amount: '9.99', item: 'Bin me', category: 'Other', notes: 'note' },
  });
  await request(`/expenses/${binned._id}`, { method: 'DELETE', token: login.token });
  await request(`/expenses/${binned._id}`, { token: login.token, expectedStatus: 404 });
  await request(`/expenses/${hidden._id}`, { method: 'DELETE', token: login.token });
  let trash = await request('/expenses/trash', { token: login.token });
  assert(trash.some((row) => row._id === binned._id && row.item === 'Bin me'));
  const hiddenInTrash = trash.find((row) => row._id === hidden._id);
  assert.equal(hiddenInTrash.item, 'Hidden expense');
  assert.equal(hiddenInTrash.category, 'Hidden');
  const restored = await request('/expenses/trash/restore', {
    method: 'PATCH',
    token: login.token,
    body: { ids: [binned._id, hidden._id] },
  });
  assert.equal(restored.restoredCount, 2);
  assert((await request(`/expenses/${binned._id}`, { token: login.token })).item === 'Bin me');
  await request(`/expenses/${binned._id}`, { method: 'DELETE', token: login.token });
  const purged = await request('/expenses/trash', {
    method: 'DELETE',
    token: login.token,
    body: { ids: [binned._id] },
  });
  assert.equal(purged.deletedCount, 1);
  trash = await request('/expenses/trash', { token: login.token });
  assert(!trash.some((row) => row._id === binned._id));

  // Hidden-expense PIN management.
  await request('/expenses/lock-key/set', {
    method: 'POST',
    token: login.token,
    expectedStatus: 409,
    body: { key: 'anotherKey1' },
  });
  await request('/expenses/lock-key/change', {
    method: 'POST',
    token: login.token,
    expectedStatus: 401,
    body: { currentKey: 'wrongKey1', newKey: 'newSmokeKey1' },
  });
  await request('/expenses/lock-key/change', {
    method: 'POST',
    token: login.token,
    body: { currentKey: key, newKey: 'newSmokeKey1' },
  });
  await request('/expenses/lock-key/unlock', {
    method: 'POST',
    token: login.token,
    expectedStatus: 401,
    body: { key },
  });
  assert((await request('/expenses/lock-key/unlock', {
    method: 'POST',
    token: login.token,
    body: { key: 'newSmokeKey1' },
  })).token);
  assert.equal((await request('/expenses/lock-key/status', { method: 'POST', token: second.token, body: {} })).configured, false);
  await request('/expenses/lock-key/reset-link', {
    method: 'POST',
    body: { token: 'a'.repeat(64), key: 'resetKey1' },
    expectedStatus: 400,
  });

  // Bulk create is all-or-nothing when any entry is invalid.
  const before = (await request('/expenses?locked=all', { token: login.token })).length;
  await request('/expenses/bulk', {
    method: 'POST',
    token: login.token,
    expectedStatus: 400,
    body: { expenses: [{ date, amount: '1', item: 'ok' }, { date, amount: '0', item: 'bad' }] },
  });
  assert.equal((await request('/expenses?locked=all', { token: login.token })).length, before);

  // Database-level validation still guards against invalid documents.
  await assert.rejects(
    mongo.collection('expenses').insertOne({ userId: objectId(first.user.id), amount: 5 }),
    (error) => error.code === 121,
  );

  await request(`/messages/${message._id}`, { method: 'DELETE', token: login.token });
  await request(`/expenses/${expense1._id}`, { method: 'DELETE', token: login.token });
  await request(`/expenses/${expense2._id}`, { method: 'DELETE', token: login.token });
  await request(`/expenses/${hidden._id}`, { method: 'DELETE', token: login.token });
}

mongo
  .connect()
  .then(main)
  .then(() => {
    console.log(
      'API smoke tests passed: authentication, profile and theme, expenses (bulk, hidden, deleted items), summaries, income, budgets, reminder payments, transactions, encrypted password vault, scheduled messages, validation, and user isolation.',
    );
  })
  .catch((error) => {
    console.error(`API smoke test failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (testUserIds.length) {
      try {
        // Equivalent of ON DELETE CASCADE: remove the test users and everything they own.
        const ids = testUserIds.map(objectId);
        for (const name of ['expenses', 'incomes', 'budgets', 'reminders', 'passwordVaults', 'scheduledMessages', 'hiddenRecoveryEmails'])
          await mongo.collection(name).deleteMany({ userId: { $in: ids } });
        await mongo.collection('users').deleteMany({ _id: { $in: ids } });
      } catch (error) {
        console.error(`API smoke-test cleanup failed: ${error.message}`);
        process.exitCode = 1;
      }
    }
    await mongo.close();
  });
