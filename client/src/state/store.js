import { configureStore, createSlice, createAsyncThunk, isRejected } from '@reduxjs/toolkit';
import api from '../services/api';
const th = (n, fn) =>
  createAsyncThunk(n, async (a, { rejectWithValue }) => {
    try {
      return await fn(a);
    } catch (e) {
      return rejectWithValue(String(e));
    }
  });
export const authenticate = th('auth/go', ({ mode, ...b }) => api.post('/auth/' + mode, b));
export const requestPasswordReset = th('auth/forgot', (email) =>
  api.post('/auth/forgot-password', { email }),
);
export const resetPassword = th('auth/reset', (payload) =>
  api.post('/auth/reset-password', payload),
);
export const loadMe = th('auth/me', () => api.get('/auth/me'));
export const updateProfile = th('auth/profile', (profile) => api.patch('/auth/profile', profile));
export const fetchSummary = th('dash/get', (p) => api.get('/dashboard/summary', { params: p }));
export const fetchExpenses = th('exp/list', ({ params, hiddenToken }) =>
  api.get('/expenses', { params, headers: hiddenToken ? { 'x-hidden-expense-token': hiddenToken } : {} }),
);
export const fetchExpenseInsights = th('exp/insights', (params) =>
  api.get('/expenses/insights', { params }),
);
export const getHiddenExpenseKeyStatus = th('exp/keyStatus', () => api.post('/expenses/lock-key/status'));
export const setHiddenExpenseKey = th('exp/keySet', (key) => api.post('/expenses/lock-key/set', { key }));
export const unlockHiddenExpenses = th('exp/keyUnlock', (key) => api.post('/expenses/lock-key/unlock', { key }));
export const changeHiddenExpenseKey = th('exp/keyChange', ({ currentKey, newKey }) =>
  api.post('/expenses/lock-key/change', { currentKey, newKey }),
);
export const requestHiddenExpenseOtp = th('exp/keyResetLink', () => api.post('/expenses/lock-key/request-link'));
export const resetHiddenExpenseKey = th('exp/keyResetByLink', ({ token, key }) =>
  api.post('/expenses/lock-key/reset-link', { token, key }),
);
export const saveExpense = th('exp/save', (e) =>
  e._id ? api.put('/expenses/' + e._id, e) : api.post('/expenses', e),
);
export const saveExpenses = th('exp/saveMany', (expenses) =>
  api.post('/expenses/bulk', { expenses }),
);
export const removeExpense = th('exp/del', (id) => api.delete('/expenses/' + id));
export const removeExpenses = th('exp/delMany', (ids) =>
  api.delete('/expenses/bulk', { data: { ids } }),
);
export const setExpensesLocked = th('exp/lockMany', ({ ids, isLocked }) =>
  api.patch('/expenses/bulk/lock', { ids, isLocked }),
);
export const fetchIncome = th('income/list', (params) => api.get('/income', { params }));
export const addIncome = th('income/add', (entry) => api.post('/income', entry));
export const removeIncome = th('income/delete', (id) => api.delete('/income/' + id));
export const removeIncomes = th('income/deleteMany', (ids) =>
  api.delete('/income/bulk', { data: { ids } }),
);
export const fetchBudgets = th('budget/list', (params) => api.get('/budgets', { params }));
export const saveBudget = th('budget/save', (budget) => api.put('/budgets', budget));
export const fetchReminders = th('reminder/list', () => api.get('/reminders'));
export const addReminder = th('reminder/add', (reminder) => api.post('/reminders', reminder));
export const updateReminder = th('reminder/update', ({ id, completed }) =>
  api.patch('/reminders/' + id, { completed }),
);
export const deleteReminder = th('reminder/delete', (id) => api.delete('/reminders/' + id));
export const deleteReminders = th('reminder/deleteMany', (ids) =>
  api.delete('/reminders/bulk', { data: { ids } }),
);
export const fetchScheduledMessages = th('message/list', () => api.get('/messages'));
export const fetchMessageDeliveryStatus = th('message/status', () => api.get('/messages/status'));
export const createScheduledMessage = th('message/create', (message) =>
  api.post('/messages', message),
);
export const updateScheduledMessage = th('message/update', ({ id, message }) =>
  api.put('/messages/' + id, message),
);
export const setScheduledMessageActive = th('message/active', ({ id, active }) =>
  api.patch('/messages/' + id, { active }),
);
export const deleteScheduledMessage = th('message/delete', (id) => api.delete('/messages/' + id));
export const fetchReport = th('report/year', (year) =>
  api.get('/reports/yearly', { params: { year } }),
);
const auth = createSlice({
  name: 'auth',
  initialState: { token: localStorage.getItem('token'), user: null, error: null },
  reducers: {
    logout(s) {
      s.token = null;
      s.user = null;
      localStorage.removeItem('token');
    },
  },
  extraReducers: (b) =>
    b
      .addCase(authenticate.fulfilled, (s, { payload }) => {
        s.token = payload.token;
        s.user = payload.user;
        s.error = null;
        localStorage.setItem('token', payload.token);
      })
      .addCase(authenticate.rejected, (s, { payload }) => {
        s.error = payload;
      })
      .addCase(loadMe.fulfilled, (s, { payload }) => {
        s.user = payload;
      })
      .addCase(updateProfile.fulfilled, (s, { payload }) => {
        s.user = payload;
      })
      .addCase(loadMe.rejected, (s) => {
        s.token = null;
        localStorage.removeItem('token');
      }),
});
const theme = createSlice({
  name: 'theme',
  initialState: localStorage.getItem('theme') ||
    (document.documentElement.dataset.colorTheme === 'midnight-mint' ? 'dark' : 'light'),
  reducers: {
    toggleTheme: (s) => {
      const n = s === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', n);
      return n;
    },
  },
});
const colorTheme = createSlice({
  name: 'colorTheme',
  initialState: localStorage.getItem('colorTheme') || document.documentElement.dataset.colorTheme || 'midnight-mint',
  reducers: {
    setColorTheme: (_state, { payload }) => {
      localStorage.setItem('colorTheme', payload);
      return payload;
    },
  },
});
const customAccent = createSlice({
  name: 'customAccent',
  initialState: /^#[\da-f]{6}$/i.test(localStorage.getItem('customAccent') || '')
    ? localStorage.getItem('customAccent')
    : '#7c6ee8',
  reducers: {
    setCustomAccent: (_state, { payload }) => {
      const color = /^#[\da-f]{6}$/i.test(payload) ? payload : '#7c6ee8';
      localStorage.setItem('customAccent', color);
      return color;
    },
  },
});
const ui = createSlice({
  name: 'ui',
  initialState: { msg: null },
  reducers: {
    clearMsg: (s) => {
      s.msg = null;
    },
  },
  extraReducers: (b) =>
    b
      .addCase(saveExpense.fulfilled, (s) => {
        s.msg = 'Expense saved successfully';
      })
      .addCase(saveExpenses.fulfilled, (s) => {
        s.msg = 'Expenses saved successfully';
      })
      .addCase(removeExpense.fulfilled, (s) => {
        s.msg = 'Expense deleted successfully';
      })
      .addCase(addIncome.fulfilled, (s) => {
        s.msg = 'Income saved successfully';
      })
      .addCase(removeIncome.fulfilled, (s) => {
        s.msg = 'Income entry deleted';
      })
      .addCase(saveBudget.fulfilled, (s) => {
        s.msg = 'Monthly budget saved';
      })
      .addCase(addReminder.fulfilled, (s) => {
        s.msg = 'Reminder added';
      })
      .addCase(updateReminder.fulfilled, (s) => {
        s.msg = 'Reminder updated';
      })
      .addCase(deleteReminder.fulfilled, (s) => {
        s.msg = 'Reminder deleted';
      })
      .addMatcher(isRejected, (s, a) => {
        s.msg = a.payload || 'Something went wrong';
      }),
});
const data = (name, t) =>
  createSlice({
    name,
    initialState: { data: null, loading: false },
    reducers: {},
    extraReducers: (b) =>
      b
        .addCase(t.pending, (s) => {
          s.loading = true;
        })
        .addCase(t.fulfilled, (s, a) => {
          s.loading = false;
          s.data = a.payload;
        })
        .addCase(t.rejected, (s) => {
          s.loading = false;
        }),
  }).reducer;
export const { logout } = auth.actions;
export const { toggleTheme } = theme.actions;
export const { setColorTheme } = colorTheme.actions;
export const { setCustomAccent } = customAccent.actions;
export const { clearMsg } = ui.actions;
export default configureStore({
  reducer: {
    auth: auth.reducer,
    theme: theme.reducer,
    colorTheme: colorTheme.reducer,
    customAccent: customAccent.reducer,
    ui: ui.reducer,
    dash: data('dash', fetchSummary),
    exp: data('exp', fetchExpenses),
    expenseInsights: data('expenseInsights', fetchExpenseInsights),
    income: data('income', fetchIncome),
    budgets: data('budgets', fetchBudgets),
    reminders: data('reminders', fetchReminders),
    reports: data('reports', fetchReport),
    messages: data('messages', fetchScheduledMessages),
  },
});
