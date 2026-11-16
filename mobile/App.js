import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const configuredApiUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api').trim().replace(/\/$/, '');
const expoHost = Constants.expoConfig?.hostUri?.replace(/:\d+$/, '');
const API_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(configuredApiUrl) && expoHost
  ? configuredApiUrl.replace(/\/\/(localhost|127\.0\.0\.1)(?=:|\/|$)/i, `//${expoHost}`)
  : configuredApiUrl;
const PAYMENT_METHODS = ['Cash', 'Navi', 'GPay', 'PhonePe', 'Paytm', 'YONO', 'ICICI', 'Overseas', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other'];
const BRAND = '#4f6bff';
const PALETTES = [
  ['Midnight Mint', '#56d6a4'], ['Ocean Breeze', '#287f8e'], ['Sage & Sand', '#71866b'],
  ['Berry Night', '#a34e83'], ['Arctic Frost', '#527fa8'], ['Rosewood', '#a65970'],
  ['Citrus Grove', '#728a3c'], ['Royal Indigo', '#5d5fb0'], ['Aurora Glow', '#3c9d96'],
  ['Sakura', '#c7668a'], ['Midnight Orchid', '#8061a5'], ['Coastal Sand', '#4c9290'],
  ['Minimal Light', '#527b7f'], ['Dark Professional', '#7397ff'], ['Glassmorphism', '#6689c7'],
  ['Modern Gradient', '#9458dc'], ['Neumorphism', '#7385a0'], ['Material Design', '#3989d8'],
  ['Ocean Blue', '#3484a6'], ['Forest Green', '#347b56'], ['Midnight AMOLED', '#84d8bd'],
  ['Colorful Creative', '#d24f88'],
];
const MOBILE_THEME_IDS = {
  'Midnight Mint': 'midnight-mint', 'Ocean Breeze': 'ocean-blue', 'Sage & Sand': 'sage-sand',
  'Berry Night': 'berry-night', 'Arctic Frost': 'arctic-frost', Rosewood: 'rosewood',
  'Citrus Grove': 'citrus-grove', 'Royal Indigo': 'royal-indigo', 'Aurora Glow': 'aurora-glow',
  Sakura: 'sakura', 'Midnight Orchid': 'midnight-orchid', 'Coastal Sand': 'coastal-sand',
  'Minimal Light': 'minimal-light', 'Dark Professional': 'dark-professional',
  Glassmorphism: 'glassmorphism', 'Modern Gradient': 'modern-gradient',
  Neumorphism: 'neumorphism', 'Material Design': 'material-design', 'Ocean Blue': 'ocean-blue',
  'Forest Green': 'forest-green', 'Midnight AMOLED': 'midnight-amoled',
  'Colorful Creative': 'colorful-creative', Custom: 'custom',
};
const MOBILE_THEME_NAMES = Object.fromEntries(Object.entries(MOBILE_THEME_IDS).map(([name, id]) => [id, name]));
const PALETTE_SURFACES = {
  'Midnight Mint': ['#f2f7f4', '#ffffff', '#203b32', '#dcece4', '#e3eee7'],
  'Ocean Breeze': ['#edf5f7', '#fbfeff', '#293b47', '#d8e9ee', '#dcecf0'],
  'Sage & Sand': ['#f4f0e6', '#fffdf7', '#303b32', '#e4dfd1', '#e8eadc'],
  'Berry Night': ['#f5eef4', '#fffaff', '#3d2939', '#e9dce8', '#f0e1ed'],
  'Arctic Frost': ['#edf4fa', '#fbfdff', '#29394a', '#dbe7f1', '#dce9f5'],
  Rosewood: ['#f7eff1', '#fffafd', '#452f38', '#eddee3', '#f2e0e7'],
  'Citrus Grove': ['#f4f4e7', '#fffef8', '#35402b', '#e4e5d0', '#e8edcf'],
  'Royal Indigo': ['#f0f0fa', '#fcfcff', '#302f4d', '#dfdff0', '#e1e2f7'],
  'Aurora Glow': ['#eff7f4', '#fbfffd', '#263b3c', '#d9eae4', '#dff3ef'],
  Sakura: ['#fbf0f4', '#fffafd', '#493440', '#efdde6', '#f8e4ec'],
  'Midnight Orchid': ['#f3eff8', '#fcfaff', '#392e47', '#e3ddec', '#e8def1'],
  'Coastal Sand': ['#f6f3e9', '#fffdf6', '#354442', '#e6e1d0', '#e3eee7'],
  'Minimal Light': ['#f5f8f8', '#ffffff', '#263638', '#e4ebeb', '#edf3f2'],
  'Dark Professional': ['#f2f4f8', '#ffffff', '#20283a', '#e1e6ef', '#e8edfb'],
  Glassmorphism: ['#e9eef8', 'rgba(255,255,255,0.82)', '#26344c', '#dce3f0', '#dce6f6'],
  'Modern Gradient': ['#f8f4fc', '#ffffff', '#332847', '#eee5f6', '#efe5fa'],
  Neumorphism: ['#e9edf3', '#e9edf3', '#394555', '#e9edf3', '#dfe5ed'],
  'Material Design': ['#f4f7fa', '#ffffff', '#263746', '#dfe7ed', '#e5f0f8'],
  'Ocean Blue': ['#edf5f7', '#fbfeff', '#293b47', '#d8e9ee', '#dcecf0'],
  'Forest Green': ['#f1f6f1', '#fbfdfb', '#263b30', '#dce8df', '#e2eee3'],
  'Midnight AMOLED': ['#f1f6f4', '#ffffff', '#263b36', '#dce9e5', '#e4f0ec'],
  'Colorful Creative': ['#fff7fb', '#ffffff', '#3b2d42', '#f1e2eb', '#f7e3ef'],
};
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const money = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
const exactMoney = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const methodLabel = (value) =>
  ['Navi', 'GPay', 'PhonePe', 'Paytm', 'YONO', 'ICICI', 'Overseas'].includes(value)
    ? `UPI · ${value}`
    : value || 'Cash';

async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(`Cannot reach the SpendWise API at ${API_URL}. Keep your phone and computer on the same Wi-Fi, and confirm the API server is running.`);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.message || 'Unable to connect to SpendWise');
  return result.data;
}

const initialExpense = () => ({
  item: '', category: '', amount: '', paymentMethod: 'Cash', date: today(), hasSubtypes: false,
  subtypes: [{ type: '', amount: '', paymentMethod: 'Cash' }],
});
const initialMessage = () => ({
  contactName: '', email: '', messageType: 'greeting', message: 'Hello {name}, wishing you a lovely day!',
  frequency: 'once', intervalDays: '2', date: tomorrow(), time: '09:00', endDate: '', recipientConsented: false,
});
const MESSAGE_TEMPLATES = {
  greeting: 'Hello {name}, wishing you a lovely day!',
  love: 'Just wanted to send you a little love, {name}. Thinking of you!',
  celebration: 'Congratulations, {name}! Wishing you lots of happiness and success!',
  custom: '',
};

export default function App() {
  const systemScheme = useColorScheme();
  const [appearance, setAppearance] = useState('system');
  const [palette, setPalette] = useState('Midnight Mint');
  const [customAccent, setCustomAccent] = useState('#7c6ee8');
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);
  const isDark = appearance === 'system' ? systemScheme === 'dark' : appearance === 'dark';
  const chosenAccent = palette === 'Custom' ? (/^#[\da-f]{6}$/i.test(customAccent) ? customAccent : '#7c6ee8') : (PALETTES.find(([name]) => name === palette)?.[1] || PALETTES[0][1]);
  const theme = makePalette(isDark, chosenAccent, palette);
  const styles = makeStyles(theme);
  const restoreThemePreferences = async (profile) => {
    const preferences = profile?.themePreferences;
    if (!preferences) return;
    const nextAppearance = ['light', 'dark', 'system'].includes(preferences.appearance)
      ? preferences.appearance
      : 'system';
    const nextPalette = MOBILE_THEME_NAMES[preferences.colorTheme] || 'Midnight Mint';
    const nextAccent = /^#[\da-f]{6}$/i.test(preferences.customAccent)
      ? preferences.customAccent
      : '#7c6ee8';
    setAppearance(nextAppearance);
    setPalette(nextPalette);
    setCustomAccent(nextAccent);
  };
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [passwordResetToken, setPasswordResetToken] = useState('');
  const [hiddenResetToken, setHiddenResetToken] = useState('');
  const [screen, setScreen] = useState('Overview');
  const [data, setData] = useState([]);
  const [statement, setStatement] = useState(null);
  const [transactionFrom, setTransactionFrom] = useState('');
  const [transactionTo, setTransactionTo] = useState('');
  const [transactionFromInput, setTransactionFromInput] = useState('');
  const [transactionToInput, setTransactionToInput] = useState('');
  const [transactionPage, setTransactionPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [messageStatus, setMessageStatus] = useState(null);
  const [expenseInsights, setExpenseInsights] = useState(null);
  const [expenseBudget, setExpenseBudget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenToken, setHiddenToken] = useState('');
  const [hiddenDialog, setHiddenDialog] = useState(false);
  const [hiddenMode, setHiddenMode] = useState('unlock');
  const [hiddenConfigured, setHiddenConfigured] = useState(false);
  const [hiddenKey, setHiddenKey] = useState('');
  const [hiddenKeyConfirm, setHiddenKeyConfirm] = useState('');
  const [hiddenCurrentKey, setHiddenCurrentKey] = useState('');
  const [hiddenError, setHiddenError] = useState('');
  const [hiddenInfo, setHiddenInfo] = useState('');
  const [hiddenPendingAction, setHiddenPendingAction] = useState('view');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseMonth, setExpenseMonth] = useState(today().slice(0, 7));
  const [expensePayment, setExpensePayment] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7));
  const [expenseForm, setExpenseForm] = useState(initialExpense);
  const [additionalExpenses, setAdditionalExpenses] = useState([]);
  const [expenseSuggestions, setExpenseSuggestions] = useState({ items: [], subtypes: [] });
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [incomeForm, setIncomeForm] = useState({ source: '', amount: '', date: today() });
  const [budgetForm, setBudgetForm] = useState({ month: today().slice(0, 7), limit: '' });
  const [reminderForm, setReminderForm] = useState({ title: '', amount: '', dueDate: today() });
  const [messageForm, setMessageForm] = useState(initialMessage);

  useEffect(() => {
    const handleUrl = (url) => {
      const match = url?.match(/\/(reset-password|reset-hidden-pin)\/([^/?#]+)/);
      if (!match) return;
      const [, route, resetToken] = match;
      if (route === 'reset-password') {
        setPasswordResetToken(resetToken);
        setAuthMode('reset');
        setAuthForm((current) => ({ ...current, password: '' }));
      } else {
        setHiddenResetToken(resetToken);
        setHiddenMode('reset-link');
        setHiddenKey(''); setHiddenKeyConfirm(''); setHiddenError('');
        setHiddenDialog(true);
      }
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const linkSubscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => linkSubscription.remove();
  }, []);

  useEffect(() => {
    Promise.all(['spendwise-appearance', 'spendwise-palette', 'spendwise-custom-accent'].map((key) => SecureStore.getItemAsync(key))).then(([savedAppearance, savedPalette, savedAccent]) => {
      if (savedAppearance) setAppearance(savedAppearance);
      if (savedPalette) setPalette(savedPalette);
      if (savedAccent && /^#[\da-f]{6}$/i.test(savedAccent)) setCustomAccent(savedAccent);
    });
    SecureStore.getItemAsync('spendwise-token')
      .then(async (savedToken) => {
        if (!savedToken) return;
        try {
          const profile = await request('/auth/me', { token: savedToken });
          setToken(savedToken);
          setUser(profile);
          setProfileName(profile.name || '');
          setProfileAvatar(profile.avatar || '');
          await restoreThemePreferences(profile);
        } catch {
          await SecureStore.deleteItemAsync('spendwise-token');
        }
      })
      .finally(() => setBooting(false));
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [viewYear, viewMonth] = selectedMonth.split('-').map(Number);
      let next = [];
      if (screen === 'Overview') {
        const [monthSummary, recent] = await Promise.all([
          request(`/dashboard/summary?month=${viewMonth}&year=${viewYear}`, { token }),
          request(`/expenses?month=${viewMonth}&year=${viewYear}`, { token }),
        ]);
        setSummary(monthSummary);
        next = recent.slice(0, 6);
      } else if (screen === 'Expenses') {
        const insightMonth = /^\d{4}-\d{2}$/.test(expenseMonth) ? expenseMonth : selectedMonth;
        const [insightYear, insightMonthNumber] = insightMonth.split('-').map(Number);
        const params = new URLSearchParams();
        if (showHidden) params.set('locked', 'true');
        else {
          if (expenseSearch.trim()) params.set('search', expenseSearch.trim());
          if (expensePayment) params.set('paymentMethod', expensePayment);
          if (expenseMonth && !expenseSearch.trim()) { params.set('year', expenseMonth.slice(0, 4)); params.set('month', String(Number(expenseMonth.slice(5, 7)))); }
        }
        const [expenses, insights, budgets] = await Promise.all([
          request(`/expenses?${params.toString()}`, { token, headers: hiddenToken ? { 'x-hidden-expense-token': hiddenToken } : {} }),
          showHidden ? Promise.resolve(null) : request(`/expenses/insights?month=${insightMonthNumber}&year=${insightYear}`, { token }),
          showHidden ? Promise.resolve([]) : request(`/budgets?year=${insightYear}`, { token }),
        ]);
        next = expenses;
        setExpenseInsights(insights);
        setExpenseBudget((budgets || []).find((entry) => entry.month === insightMonthNumber) || null);
        if (!showHidden) {
          request('/expenses/suggestions', { token }).then(setExpenseSuggestions).catch(() => {});
        }
      } else if (screen === 'Income') {
        const [income, monthSummary] = await Promise.all([
          request(`/income?month=${viewMonth}&year=${viewYear}`, { token }),
          request(`/dashboard/summary?month=${viewMonth}&year=${viewYear}`, { token }),
        ]);
        setSummary(monthSummary);
        next = income;
      } else if (screen === 'Budgets') {
        next = await request(`/budgets?year=${viewYear}`, { token });
      } else if (screen === 'Reminders') {
        next = await request('/reminders', { token });
      } else if (screen === 'Scheduled messages') {
        const [messages, status] = await Promise.all([
          request('/messages', { token }),
          request('/messages/status', { token }),
        ]);
        next = messages;
        setMessageStatus(status);
      } else if (screen === 'Reports') {
        next = await request(`/reports/yearly?year=${reportYear}`, { token });
      } else if (screen === 'Transactions') {
        const params = new URLSearchParams({ page: String(transactionPage), pageSize: '50' });
        if (transactionFrom) params.set('from', transactionFrom);
        if (transactionTo) params.set('to', transactionTo);
        const result = await request(`/transactions?${params.toString()}`, { token });
        setStatement(result);
        next = result.items;
      }
      setData(next || []);
    } catch (error) {
      Alert.alert('Could not load data', error.message);
    } finally {
      setLoading(false);
    }
  }, [screen, token, expenseSearch, expenseMonth, expensePayment, selectedMonth, showHidden, hiddenToken, reportYear, transactionFrom, transactionTo, transactionPage]);

  useEffect(() => { load(); }, [load]);

  const signIn = async () => {
    try {
      if (authMode === 'forgot') {
        await request('/auth/forgot-password', { method: 'POST', body: { email: authForm.email } });
        Alert.alert('Check your email', 'If an account exists, a password reset link has been sent.');
        setAuthMode('login');
        return;
      }
      if (authMode === 'reset') {
        await request('/auth/reset-password', { method: 'POST', body: { token: passwordResetToken, password: authForm.password } });
        Alert.alert('Password updated', 'You can now sign in with your new password.');
        setPasswordResetToken('');
        setAuthForm((current) => ({ ...current, password: '' }));
        setAuthMode('login');
        return;
      }
      const result = await request(`/auth/${authMode}`, {
        method: 'POST',
        body: authMode === 'register'
          ? authForm
          : { email: authForm.email, password: authForm.password },
      });
      await SecureStore.setItemAsync('spendwise-token', result.token);
      setToken(result.token);
      setUser(result.user);
      setProfileName(result.user?.name || '');
      setProfileAvatar(result.user?.avatar || '');
      await restoreThemePreferences(result.user);
      setScreen('Overview');
    } catch (error) {
      Alert.alert('Sign in failed', error.message);
    }
  };

  const save = async (path, body, method = 'POST') => {
    try {
      await request(path, { token, method, body });
      setFormOpen(false);
      setEditingIncomeId(null);
      await load();
    } catch (error) {
      Alert.alert('Could not save', error.message);
    }
  };

  const remove = (path, id) => Alert.alert('Delete item?', 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => request(`${path}/${id}`, { token, method: 'DELETE' }).then(load).catch((error) => Alert.alert('Could not delete', error.message)) },
  ]);

  const toggleSelected = (id) => setSelectedIds((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const deleteSelected = async (path) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    Alert.alert('Delete selected items?', `This will permanently delete ${ids.length} selected item${ids.length === 1 ? '' : 's'}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await request(`${path}/bulk`, { token, method: 'DELETE', body: { ids } });
          setSelectedIds(new Set());
          await load();
        } catch (error) { Alert.alert('Could not delete items', error.message); }
      } },
    ]);
  };

  const enterHiddenExpenses = (accessToken) => {
    setHiddenToken(accessToken);
    setShowHidden(true);
    setSelectedIds(new Set());
    setHiddenDialog(false);
    setHiddenKey('');
  };

  const openHiddenExpenses = async (pendingAction = 'view') => {
    if (showHidden) {
      setShowHidden(false);
      setHiddenToken('');
      setSelectedIds(new Set());
      return;
    }
    try {
      const status = await request('/expenses/lock-key/status', { token, method: 'POST' });
      setHiddenConfigured(Boolean(status.configured));
      if (pendingAction === 'hide' && status.configured) {
        await request('/expenses/bulk/lock', { token, method: 'PATCH', body: { ids: [...selectedIds], isLocked: true } });
        setSelectedIds(new Set());
        await load();
        return;
      }
      setHiddenPendingAction(pendingAction);
      setHiddenMode(status.configured ? 'unlock' : 'set');
      setHiddenKey('');
      setHiddenKeyConfirm('');
      setHiddenCurrentKey('');
      setHiddenError('');
      setHiddenInfo('');
      setHiddenDialog(true);
    } catch (error) { Alert.alert('Could not open hidden expenses', error.message); }
  };

  const submitHiddenAction = async () => {
    setHiddenError('');
    setHiddenInfo('');
    try {
      if (hiddenMode === 'set') {
        if (!/^[a-z0-9]{4,64}$/i.test(hiddenKey)) throw new Error('Use 4 to 64 letters or numbers for your PIN.');
        if (hiddenKey !== hiddenKeyConfirm) throw new Error('The PINs do not match.');
        await request('/expenses/lock-key/set', { token, method: 'POST', body: { key: hiddenKey } });
        setHiddenConfigured(true);
        if (hiddenPendingAction === 'hide') {
          await request('/expenses/bulk/lock', { token, method: 'PATCH', body: { ids: [...selectedIds], isLocked: true } });
          setSelectedIds(new Set());
          setHiddenDialog(false);
          await load();
        } else {
          const result = await request('/expenses/lock-key/unlock', { token, method: 'POST', body: { key: hiddenKey } });
          enterHiddenExpenses(result.token);
        }
      } else if (hiddenMode === 'unlock') {
        const result = await request('/expenses/lock-key/unlock', { token, method: 'POST', body: { key: hiddenKey } });
        enterHiddenExpenses(result.token);
      } else if (hiddenMode === 'change') {
        if (!/^[a-z0-9]{4,64}$/i.test(hiddenKey)) throw new Error('Use 4 to 64 letters or numbers for your new PIN.');
        if (hiddenKey !== hiddenKeyConfirm) throw new Error('The PINs do not match.');
        await request('/expenses/lock-key/change', { token, method: 'POST', body: { currentKey: hiddenCurrentKey, newKey: hiddenKey } });
        setHiddenMode('unlock');
        setHiddenKey(''); setHiddenKeyConfirm(''); setHiddenCurrentKey('');
        setHiddenInfo('PIN updated. Enter it to open hidden expenses.');
      } else if (hiddenMode === 'reset-link') {
        if (!/^[a-z0-9]{4,64}$/i.test(hiddenKey)) throw new Error('Use 4 to 64 letters or numbers for your new PIN.');
        if (hiddenKey !== hiddenKeyConfirm) throw new Error('The PINs do not match.');
        await request('/expenses/lock-key/reset-link', { method: 'POST', body: { token: hiddenResetToken, key: hiddenKey } });
        setHiddenResetToken(''); setHiddenDialog(false); setHiddenMode('unlock');
        Alert.alert('PIN updated', 'Your hidden expense PIN has been reset.');
      } else {
        const result = await request('/expenses/lock-key/request-link', { token, method: 'POST' });
        setHiddenInfo(`A recovery link was sent to ${result.sentTo || 'your recovery email'}. Open it to reset your PIN.`);
      }
    } catch (error) { setHiddenError(error.message); }
  };

  const lockSelectedExpenses = async () => {
    if (!selectedIds.size) return;
    if (!hiddenConfigured && !showHidden) {
      await openHiddenExpenses('hide');
      return;
    }
    try {
      await request('/expenses/bulk/lock', { token, method: 'PATCH', body: { ids: [...selectedIds], isLocked: !showHidden } });
      setSelectedIds(new Set());
      if (showHidden) { setShowHidden(false); setHiddenToken(''); }
      await load();
    } catch (error) { Alert.alert('Could not update hidden expenses', error.message); }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('spendwise-token');
    setToken(null);
    setUser(null);
    setData([]);
    setScreen('Overview');
  };

  const persistThemePreferences = async (preferences) => {
    if (!token) return;
    try {
      const updated = await request('/auth/theme-preferences', { token, method: 'PATCH', body: preferences });
      setUser((current) => ({ ...current, themePreferences: updated.themePreferences }));
    } catch (error) {
      Alert.alert('Could not save theme', error.message);
    }
  };
  const chooseAppearance = async (value) => {
    setAppearance(value);
    await SecureStore.setItemAsync('spendwise-appearance', value);
    await persistThemePreferences({ appearance: value });
  };
  const choosePalette = async (value) => {
    setPalette(value);
    await SecureStore.setItemAsync('spendwise-palette', value);
    await persistThemePreferences({ colorTheme: MOBILE_THEME_IDS[value] || 'custom' });
  };
  const chooseCustomAccent = async (value) => {
    setCustomAccent(value);
    if (!/^#[\da-f]{6}$/i.test(value)) return;
    await SecureStore.setItemAsync('spendwise-custom-accent', value);
    await persistThemePreferences({ customAccent: value });
  };
  const saveProfile = async () => {
    setProfileBusy(true);
    try { const updated = await request('/auth/profile', { token, method: 'PATCH', body: { name: profileName.trim(), avatar: profileAvatar } }); setUser(updated); Alert.alert('Profile saved', 'Your profile has been updated.'); }
    catch (error) { Alert.alert('Could not save profile', error.message); }
    finally { setProfileBusy(false); }
  };
  const chooseProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo access needed', 'Allow photo library access to choose a profile picture.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    setProfilePhotoBusy(true);
    try {
      const asset = result.assets[0];
      const extension = asset.fileName?.split('.').pop()?.toLowerCase();
      const mimeType = asset.mimeType?.toLowerCase();
      const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!supportedTypes.includes(mimeType) && !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
        throw new Error('Choose a JPG, PNG, or WebP image.');
      }
      if (asset.fileSize > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
      let dataUri = '';
      for (const size of [420, 360, 300]) {
        for (const compress of [0.72, 0.58, 0.44]) {
          const image = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: size, height: size } }],
            { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true },
          );
          if (!image.base64) throw new Error('This image could not be processed.');
          if (Math.floor(image.base64.length * 3 / 4) <= 400 * 1024) {
            dataUri = `data:image/jpeg;base64,${image.base64}`;
            break;
          }
        }
        if (dataUri) break;
      }
      if (!dataUri) throw new Error('Choose a simpler or smaller photo; profile pictures must be under 400 KB after processing.');
      setProfileAvatar(dataUri);
    } catch (error) { Alert.alert('Could not use this photo', error.message); }
    finally { setProfilePhotoBusy(false); }
  };

  const changeScreen = (name) => {
    setScreen(name);
    setSelectedIds(new Set());
    setFormOpen(false);
    setEditingExpenseId(null);
    setExpenseForm(initialExpense());
  };

  const shiftMonth = (delta) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  const submitExpense = () => {
    const activeSubtypes = expenseForm.subtypes.filter((sub) => sub.type.trim() && Number(sub.amount) > 0);
    const amount = expenseForm.hasSubtypes
      ? activeSubtypes.reduce((sum, sub) => sum + Number(sub.amount), 0)
      : Number(expenseForm.amount);
    if (!expenseForm.item.trim() || amount <= 0) return Alert.alert('Add an item and a valid amount');
    if (additionalExpenses.some((item) => !item.item.trim() || Number(item.amount) <= 0)) return Alert.alert('Complete each additional expense with an item and amount greater than zero');
    if (expenseForm.hasSubtypes && !activeSubtypes.length) return Alert.alert('Add at least one subtype with an amount');
    const main = {
      item: expenseForm.item.trim(), description: expenseForm.item.trim(), category: expenseForm.category.trim() || 'Other',
      date: expenseForm.date || today(), amount, paymentMethod: expenseForm.paymentMethod,
      hasSubtypes: expenseForm.hasSubtypes, subtypes: expenseForm.hasSubtypes ? activeSubtypes : [],
    };
    const others = additionalExpenses.filter((item) => item.item.trim() && Number(item.amount) > 0).map((item) => ({
      item: item.item.trim(), description: item.item.trim(), category: item.category.trim() || 'Other',
      date: item.date || expenseForm.date || today(), amount: Number(item.amount), paymentMethod: item.paymentMethod || 'Cash', hasSubtypes: false, subtypes: [],
    }));
    if (editingExpenseId) save(`/expenses/${editingExpenseId}`, main, 'PUT');
    else if (others.length) save('/expenses/bulk', { expenses: [main, ...others] });
    else save('/expenses', main);
    setExpenseForm(initialExpense());
    setAdditionalExpenses([]);
    setEditingExpenseId(null);
  };

  const editExpense = (expense) => {
    setEditingExpenseId(expense._id);
    setExpenseForm({ item: expense.item || expense.description || '', category: expense.category || '', amount: String(expense.amount || ''), date: String(expense.date).slice(0, 10), paymentMethod: expense.paymentMethod || 'Cash', hasSubtypes: Boolean(expense.hasSubtypes), subtypes: expense.subtypes?.length ? expense.subtypes.map((sub) => ({ ...sub, amount: String(sub.amount) })) : [{ type: '', amount: '', paymentMethod: 'Cash' }] });
    setAdditionalExpenses([]);
    setFormOpen(true);
  };

  const submitMessage = () => {
    if (!messageForm.contactName.trim() || !messageForm.email.trim() || !messageForm.message.trim()) return Alert.alert('Complete the contact, email, and message fields');
    if (!messageForm.recipientConsented) return Alert.alert('Confirm you have permission to message this person');
    const scheduledAt = new Date(`${messageForm.date}T${messageForm.time}:00`);
    const payload = {
      ...messageForm,
      scheduledAt: scheduledAt.toISOString(),
      endAt: messageForm.endDate ? new Date(`${messageForm.endDate}T23:59:59`).toISOString() : undefined,
      intervalDays: Number(messageForm.intervalDays),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
      recipientConsented: true,
    };
    save(editingMessageId ? `/messages/${editingMessageId}` : '/messages', payload, editingMessageId ? 'PUT' : 'POST');
    setMessageForm(initialMessage());
    setEditingMessageId(null);
  };

  const editMessage = (message) => {
    const next = new Date(message.nextSendAt || message.scheduledAt);
    const initialDate = next > new Date() ? next : new Date(`${tomorrow()}T09:00:00`);
    setEditingMessageId(message._id);
    setMessageForm({
      contactName: message.contactName || '', email: message.email || '', messageType: message.messageType || 'greeting', message: message.message || '',
      frequency: message.frequency || 'once', intervalDays: String(message.intervalDays || 2),
      date: `${initialDate.getFullYear()}-${String(initialDate.getMonth() + 1).padStart(2, '0')}-${String(initialDate.getDate()).padStart(2, '0')}`,
      time: `${String(initialDate.getHours()).padStart(2, '0')}:${String(initialDate.getMinutes()).padStart(2, '0')}`,
      endDate: message.endAt ? String(message.endAt).slice(0, 10) : '', recipientConsented: true,
    });
    setScreen('Scheduled messages');
    setFormOpen(true);
  };

  const setSub = (index, key, value) => setExpenseForm((current) => ({
    ...current,
    subtypes: current.subtypes.map((sub, i) => i === index ? { ...sub, [key]: value } : sub),
  }));

  const pageTitle = screen === 'Overview' ? 'Your money, at a glance' : screen;
  const renderForm = () => {
    if (!formOpen) return null;
    if (screen === 'Expenses') return (
      <Card styles={styles}>
        <Text style={styles.cardTitle}>{editingExpenseId ? 'Edit expense' : 'Add expense'}</Text>
        <Field label="Item" value={expenseForm.item} onChangeText={(item) => setExpenseForm({ ...expenseForm, item })} placeholder="e.g. Groceries" styles={styles} />
        {!!expenseSuggestions.items.length && !editingExpenseId && <View style={styles.suggestionRow}>{expenseSuggestions.items.slice(0, 8).map((item) => <Pressable key={item} style={styles.suggestionChip} onPress={() => setExpenseForm((current) => ({ ...current, item }))}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View>}
        <Field label="Category" value={expenseForm.category} onChangeText={(category) => setExpenseForm({ ...expenseForm, category })} placeholder="e.g. Food, Travel, Bills" styles={styles} />
        <Field label="Date (YYYY-MM-DD)" value={expenseForm.date} onChangeText={(date) => setExpenseForm({ ...expenseForm, date })} styles={styles} />
        <View style={styles.inlineRow}>
          <View style={styles.flex}><Field label="Amount" value={expenseForm.amount} onChangeText={(amount) => setExpenseForm({ ...expenseForm, amount })} keyboardType="decimal-pad" placeholder="₹ 0" styles={styles} /></View>
          <View style={styles.flex}><Text style={styles.label}>Payment method</Text><PaymentChips value={expenseForm.paymentMethod} onChange={(paymentMethod) => setExpenseForm({ ...expenseForm, paymentMethod })} styles={styles} compact /></View>
        </View>
        <View style={styles.inlineRow}>
          <Text style={styles.label}>Split into subtypes</Text>
          <Switch value={expenseForm.hasSubtypes} onValueChange={(hasSubtypes) => setExpenseForm({ ...expenseForm, hasSubtypes })} trackColor={{ true: BRAND }} />
        </View>
        {expenseForm.hasSubtypes && expenseForm.subtypes.map((sub, index) => (
          <View key={index} style={styles.subtypeBox}>
            <View style={styles.inlineRow}>
              <View style={styles.flex}><Field label="Subtype" value={sub.type} onChangeText={(value) => setSub(index, 'type', value)} placeholder="e.g. Vegetables" styles={styles} /></View>
              <Pressable onPress={() => setExpenseForm({ ...expenseForm, subtypes: expenseForm.subtypes.filter((_, i) => i !== index) })}><Text style={styles.removeText}>Remove</Text></Pressable>
            </View>
            <Field label="Subtype amount" value={sub.amount} onChangeText={(value) => setSub(index, 'amount', value)} keyboardType="decimal-pad" placeholder="₹ 0" styles={styles} />
            <PaymentChips value={sub.paymentMethod} onChange={(value) => setSub(index, 'paymentMethod', value)} styles={styles} compact />
          </View>
        ))}
        {expenseForm.hasSubtypes && <Action title="Add subtype" secondary onPress={() => setExpenseForm({ ...expenseForm, subtypes: [...expenseForm.subtypes, { type: '', amount: '', paymentMethod: 'Cash' }] })} styles={styles} />}
        {!editingExpenseId && additionalExpenses.map((item, index) => <View key={index} style={styles.subtypeBox}>
          <View style={styles.inlineRow}><Text style={[styles.itemTitle, styles.flex]}>Expense {index + 2}</Text><Pressable onPress={() => setAdditionalExpenses((items) => items.filter((_, i) => i !== index))}><Ionicons name="close-circle-outline" size={22} color="#d55252" /></Pressable></View>
          <Field label="Item" value={item.item} onChangeText={(value) => setAdditionalExpenses((items) => items.map((row, i) => i === index ? { ...row, item: value } : row))} placeholder="e.g. Groceries" styles={styles} />
          <Field label="Category" value={item.category} onChangeText={(value) => setAdditionalExpenses((items) => items.map((row, i) => i === index ? { ...row, category: value } : row))} placeholder="e.g. Food" styles={styles} />
          <View style={styles.inlineRow}>
            <View style={styles.flex}><Field label="Amount" value={item.amount} onChangeText={(value) => setAdditionalExpenses((items) => items.map((row, i) => i === index ? { ...row, amount: value } : row))} keyboardType="decimal-pad" placeholder="0" styles={styles} /></View>
            <View style={styles.flex}><Field label="Date" value={item.date || expenseForm.date} onChangeText={(value) => setAdditionalExpenses((items) => items.map((row, i) => i === index ? { ...row, date: value } : row))} styles={styles} /></View>
          </View>
        </View>)}
        {!editingExpenseId && <Action title="Add another expense" secondary onPress={() => setAdditionalExpenses((items) => [...items, { item: '', category: '', amount: '', date: expenseForm.date, paymentMethod: expenseForm.paymentMethod }])} styles={styles} />}
        <Action title={editingExpenseId ? 'Update expense' : 'Save expense'} onPress={submitExpense} styles={styles} />
      </Card>
    );
    if (screen === 'Income') return (
      <Card styles={styles}>
        <View style={styles.itemRow}>
          <Text style={[styles.cardTitle, styles.flex]}>{editingIncomeId ? 'Edit income' : 'Add income'}</Text>
          {editingIncomeId ? <Pressable onPress={() => { setEditingIncomeId(null); setFormOpen(false); setIncomeForm({ source: '', amount: '', date: today() }); }}><Text style={styles.linkText}>Cancel</Text></Pressable> : null}
        </View>
        <Field label="Source" value={incomeForm.source} onChangeText={(source) => setIncomeForm({ ...incomeForm, source })} placeholder="e.g. Salary" styles={styles} />
        <Field label="Amount" value={incomeForm.amount} onChangeText={(amount) => setIncomeForm({ ...incomeForm, amount })} keyboardType="decimal-pad" placeholder="₹ 0" styles={styles} />
        <Field label="Date (YYYY-MM-DD)" value={incomeForm.date} onChangeText={(date) => setIncomeForm({ ...incomeForm, date })} styles={styles} />
        <Action title={editingIncomeId ? 'Update income' : 'Save income'} onPress={() => save(editingIncomeId ? `/income/${editingIncomeId}` : '/income', { ...incomeForm, amount: Number(incomeForm.amount) }, editingIncomeId ? 'PUT' : 'POST')} styles={styles} />
      </Card>
    );
    if (screen === 'Budgets') return (
      <Card styles={styles}>
        <Text style={styles.cardTitle}>Set monthly budget</Text>
        <Field label="Budget month (YYYY-MM)" value={budgetForm.month} onChangeText={(month) => setBudgetForm({ ...budgetForm, month })} placeholder={today().slice(0, 7)} styles={styles} />
        <Field label="Budget amount" value={budgetForm.limit} onChangeText={(limit) => setBudgetForm({ ...budgetForm, limit })} keyboardType="decimal-pad" placeholder="₹ 0" styles={styles} />
        <Action title="Save budget" onPress={() => { const [year, month] = budgetForm.month.split('-').map(Number); save('/budgets', { month, year, limit: Number(budgetForm.limit) }, 'PUT'); }} styles={styles} />
      </Card>
    );
    if (screen === 'Reminders') return (
      <Card styles={styles}>
        <Text style={styles.cardTitle}>Add reminder</Text>
        <Field label="What should you remember?" value={reminderForm.title} onChangeText={(title) => setReminderForm({ ...reminderForm, title })} placeholder="e.g. Electricity bill" styles={styles} />
        <Field label="Due date (YYYY-MM-DD)" value={reminderForm.dueDate} onChangeText={(dueDate) => setReminderForm({ ...reminderForm, dueDate })} styles={styles} />
        <Field label="Amount (optional)" value={reminderForm.amount} onChangeText={(amount) => setReminderForm({ ...reminderForm, amount })} keyboardType="decimal-pad" placeholder="₹ 0" styles={styles} />
        <Action title="Save reminder" onPress={() => save('/reminders', { ...reminderForm, amount: reminderForm.amount ? Number(reminderForm.amount) : undefined })} styles={styles} />
      </Card>
    );
    if (screen === 'Scheduled messages') return (
      <Card styles={styles}>
        <Text style={styles.cardTitle}>{editingMessageId ? 'Edit scheduled message' : 'Schedule a message'}</Text>
        <Field label="Contact name" value={messageForm.contactName} onChangeText={(contactName) => setMessageForm({ ...messageForm, contactName })} styles={styles} />
        <Field label="Email address" value={messageForm.email} onChangeText={(email) => setMessageForm({ ...messageForm, email })} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" styles={styles} />
        <Text style={styles.label}>Message template</Text>
        <ChoiceChips choices={['greeting', 'love', 'celebration', 'custom']} value={messageForm.messageType} onChange={(messageType) => setMessageForm((current) => ({ ...current, messageType, message: current.message === MESSAGE_TEMPLATES[current.messageType] ? MESSAGE_TEMPLATES[messageType] : current.message }))} styles={styles} />
        <Field label="Message · use {name} to personalize" value={messageForm.message} onChangeText={(message) => setMessageForm({ ...messageForm, message })} multiline maxLength={1500} placeholder="Write your message" styles={styles} />
        <Text style={styles.label}>Repeat</Text>
        <ChoiceChips choices={['once', 'daily', 'weekly', 'monthly', 'custom']} value={messageForm.frequency} onChange={(frequency) => setMessageForm({ ...messageForm, frequency })} styles={styles} />
        {messageForm.frequency === 'custom' && <Field label="Repeat every (days)" value={messageForm.intervalDays} onChangeText={(intervalDays) => setMessageForm({ ...messageForm, intervalDays })} keyboardType="number-pad" styles={styles} />}
        <View style={styles.inlineRow}>
          <View style={styles.flex}><Field label="Date (YYYY-MM-DD)" value={messageForm.date} onChangeText={(date) => setMessageForm({ ...messageForm, date })} styles={styles} /></View>
          <View style={styles.flex}><Field label="Time (24h)" value={messageForm.time} onChangeText={(time) => setMessageForm({ ...messageForm, time })} styles={styles} /></View>
        </View>
        <Field label="End date (optional)" value={messageForm.endDate} onChangeText={(endDate) => setMessageForm({ ...messageForm, endDate })} placeholder="YYYY-MM-DD" styles={styles} />
        <Pressable style={styles.consentRow} onPress={() => setMessageForm({ ...messageForm, recipientConsented: !messageForm.recipientConsented })}>
          <View style={[styles.checkbox, messageForm.recipientConsented && styles.checkboxOn]}><Text style={styles.checkText}>{messageForm.recipientConsented ? '✓' : ''}</Text></View>
          <Text style={styles.muted}>I have permission to message this person</Text>
        </Pressable>
        {messageStatus && !messageStatus.emailConfigured && <Text style={styles.warningText}>Email delivery is not configured on the server yet.</Text>}
        {editingMessageId && <Action title="Cancel edit" secondary onPress={() => { setEditingMessageId(null); setMessageForm(initialMessage()); setFormOpen(false); }} styles={styles} />}
        <Action title={editingMessageId ? 'Save message changes' : 'Schedule message'} onPress={submitMessage} styles={styles} />
      </Card>
    );
    return null;
  };

  const renderBody = () => {
    if (screen === 'Overview') return (
      <>
        <View style={styles.statGrid}>
          <Stat label="Savings carried in" icon="wallet-outline" iconColor={theme.primary} value={money(summary?.openingBalance)} styles={styles} />
          <Stat label="Income this month" icon="trending-up-outline" iconColor={theme.primary} value={money(summary?.totalMonthIncome)} styles={styles} />
          <Stat label="Available to spend" icon="card-outline" iconColor={theme.primary} value={money(summary?.availableFunds ?? ((summary?.openingBalance || 0) + (summary?.totalMonthIncome || 0)))} styles={styles} accent />
          <Stat label="Expenses this month" icon="trending-down-outline" iconColor={theme.primary} value={money(summary?.totalMonthExpense)} styles={styles} />
          <Stat label="Balance after expenses" icon="wallet-outline" iconColor={theme.primary} value={money(summary?.remainingBalance)} styles={styles} accent />
          <Stat label="Spent today" icon="calendar-outline" iconColor={theme.primary} value={money(summary?.todayExpense)} styles={styles} />
        </View>
        <Card styles={styles}><View style={styles.itemRow}><View style={styles.flex}><Text style={styles.cardTitle}>Spending through the month</Text><Text style={styles.muted}>Daily expense activity</Text></View><Ionicons name="bar-chart-outline" size={20} color={theme.primary} /></View>
          <View style={styles.dailyChart}>{(summary?.dailyBreakdown || []).map((day) => {
            const max = Math.max(1, ...(summary?.dailyBreakdown || []).map((entry) => Number(entry.total) || 0));
            const dayNumber = String(day._id).slice(-2).replace(/^0/, '');
            return <View key={day._id} style={styles.chartColumn}><View style={styles.chartTrack}><View style={[styles.chartBar, { height: `${Math.max(4, (Number(day.total) / max) * 100)}%` }]} /></View><Text style={styles.chartLabel}>{dayNumber}</Text></View>;
          })}</View>
        </Card>
        {!!summary?.itemBreakdown?.length && <Card styles={styles}><Text style={styles.cardTitle}>Top spending items</Text>{summary.itemBreakdown.slice(0, 5).map((item, index) => <View key={item._id} style={[styles.itemRow, styles.categoryInsight]}><Text style={styles.rankBadge}>{String(index + 1).padStart(2, '0')}</Text><Text style={[styles.flex, styles.itemTitle]}>{item._id}</Text><Text style={styles.amount}>{money(item.total)}</Text></View>)}</Card>}
        {summary?.highestSpendingDay && <Card styles={styles}><View style={styles.itemRow}><Ionicons name="flame-outline" size={18} color={theme.primary} /><Text style={[styles.flex, styles.itemTitle]}>Highest spending day</Text><Text style={styles.amount}>{money(summary.highestSpendingDay.total)}</Text></View><Text style={styles.muted}>{new Date(`${summary.highestSpendingDay._id}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</Text></Card>}
        <SectionTitle title="Recent expenses" styles={styles} />
        {data.map((expense) => <ExpenseRow key={expense._id} item={expense} styles={styles} iconColor={theme.primary} onDelete={() => remove('/expenses', expense._id)} />)}
      </>
    );
    if (screen === 'Expenses') return <>
      {!showHidden && <>
        <Card styles={styles}><View style={styles.itemRow}><Ionicons name="pie-chart-outline" size={18} color={theme.primary} /><Text style={[styles.itemTitle, styles.flex]}>This month</Text><Text style={styles.amount}>{money(expenseInsights?.total || 0)}</Text></View><Text style={styles.muted}>{expenseInsights?.count || 0} expenses recorded</Text>
          {expenseInsights?.categories?.slice(0, 3).map((category) => <View key={category._id} style={[styles.itemRow, styles.categoryInsight]}><Text style={[styles.muted, styles.flex]}>{category._id || 'Other'}</Text><Text style={styles.amount}>{money(category.total)}</Text></View>)}
        </Card>
        {expenseBudget && <Card styles={styles}><View style={styles.itemRow}><Text style={[styles.itemTitle, styles.flex]}>Monthly budget</Text><Text style={styles.badge}>{Number(expenseBudget.spent) > Number(expenseBudget.limit) ? 'Over budget' : 'On track'}</Text></View><Text style={styles.muted}>{money(expenseBudget.spent)} of {money(expenseBudget.limit)} spent</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, (Number(expenseBudget.spent) / Math.max(1, Number(expenseBudget.limit))) * 100)}%` }]} /></View></Card>}
      </>}
      <Card styles={styles}><Field label={showHidden ? 'Hidden expenses' : 'Search expenses'} value={expenseSearch} onChangeText={setExpenseSearch} placeholder="Search by item" styles={styles} /><Field label="Month (YYYY-MM)" value={expenseMonth} onChangeText={setExpenseMonth} placeholder="Leave empty for all dates" styles={styles} /><Text style={styles.label}>Payment method</Text><ChoiceChips choices={['All', ...PAYMENT_METHODS]} value={expensePayment || 'All'} onChange={(value) => setExpensePayment(value === 'All' ? '' : value)} styles={styles} /><Action title={showHidden ? 'Lock hidden expenses' : 'View hidden expenses'} secondary onPress={() => openHiddenExpenses()} styles={styles} /></Card>
      {!!data.length && <Card styles={styles}><View style={styles.itemRow}><Pressable style={styles.selectAllRow} onPress={() => setSelectedIds(selectedIds.size === data.length ? new Set() : new Set(data.map((item) => item._id)))}><Ionicons name={selectedIds.size === data.length ? 'checkbox' : 'square-outline'} size={19} color={theme.primary} /><Text style={styles.linkText}>{selectedIds.size ? `${selectedIds.size} selected` : 'Select all'}</Text></Pressable><View style={styles.flex} />{selectedIds.size > 0 && <><Pressable onPress={lockSelectedExpenses}><Ionicons name={showHidden ? 'lock-open-outline' : 'lock-closed-outline'} size={20} color={theme.primary} /></Pressable><Pressable onPress={() => deleteSelected('/expenses')}><Ionicons name="trash-outline" size={20} color="#d55252" /></Pressable></>}</View></Card>}
      {data.map((expense) => <ExpenseRow key={expense._id} item={expense} styles={styles} iconColor={theme.primary} selected={selectedIds.has(expense._id)} onSelect={() => toggleSelected(expense._id)} onDelete={() => remove('/expenses', expense._id)} onEdit={() => editExpense(expense)} />)}
      {!data.length && <Empty text="No expenses recorded for this month." styles={styles} />}
    </>;
    if (screen === 'Income') return <>
      <Card styles={styles}><Text style={styles.cardTitle}>Monthly available balance</Text><View style={styles.itemRow}><Text style={[styles.muted, styles.flex]}>Previous month savings</Text><Text style={styles.amount}>{money(summary?.openingBalance)}</Text></View><View style={styles.itemRow}><Text style={[styles.muted, styles.flex]}>Income this month</Text><Text style={styles.amount}>{money(summary?.totalMonthIncome)}</Text></View><View style={styles.itemRow}><Text style={[styles.muted, styles.flex]}>Available before expenses</Text><Text style={styles.amount}>{money(summary?.availableFunds)}</Text></View><View style={styles.itemRow}><Text style={[styles.muted, styles.flex]}>Remaining after expenses</Text><Text style={styles.amount}>{money(summary?.remainingBalance)}</Text></View></Card>
      {!!data.length && <Card styles={styles}><View style={styles.itemRow}><Pressable style={styles.selectAllRow} onPress={() => setSelectedIds(selectedIds.size === data.length ? new Set() : new Set(data.map((item) => item._id)))}><Ionicons name={selectedIds.size === data.length ? 'checkbox' : 'square-outline'} size={19} color={theme.primary} /><Text style={styles.linkText}>{selectedIds.size ? `${selectedIds.size} selected` : 'Select all'}</Text></Pressable><View style={styles.flex} />{selectedIds.size > 0 && <Pressable onPress={() => deleteSelected('/income')}><Ionicons name="trash-outline" size={20} color="#d55252" /></Pressable>}</View></Card>}
      {data.map((entry) => <Card styles={styles} key={entry._id}>
        <View style={styles.itemRow}><Pressable style={styles.rowCheck} onPress={() => toggleSelected(entry._id)}><Ionicons name={selectedIds.has(entry._id) ? 'checkbox' : 'square-outline'} size={19} color={theme.primary} /></Pressable><View style={styles.expenseIcon}><Ionicons name="trending-up-outline" size={18} color={theme.primary} /></View><View style={styles.flex}><Text style={styles.itemTitle}>{entry.source}</Text><Text style={styles.muted}>{new Date(entry.date).toLocaleDateString()}</Text></View><Text style={styles.amount}>{money(entry.amount)}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${entry.source}`} onPress={() => { setEditingIncomeId(entry._id); setIncomeForm({ source: entry.source, amount: String(entry.amount), date: String(entry.date).slice(0, 10) }); setFormOpen(true); }}><Ionicons name="pencil-outline" size={18} color={theme.primary} /></Pressable><Pressable onPress={() => remove('/income', entry._id)}><Ionicons name="trash-outline" size={18} color="#d55252" /></Pressable></View>
      </Card>)}
      {!data.length && <Empty text="No income entries for this month." styles={styles} />}
    </>;
    if (screen === 'Budgets') return <>
      {data.map((budget) => <Card styles={styles} key={budget._id}>
        <Text style={styles.itemTitle}>{new Date(2000, budget.month - 1).toLocaleString('en', { month: 'long' })} budget</Text>
        <Text style={styles.muted}>Spent {money(budget.spent)} of {money(budget.limit)}</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, (budget.spent / budget.limit) * 100)}%` }]} /></View>
      </Card>)}
      {!data.length && <Empty text="No budgets set for this year." styles={styles} />}
    </>;
    if (screen === 'Reminders') return <>
      {!!data.length && <Card styles={styles}><View style={styles.itemRow}><Pressable style={styles.selectAllRow} onPress={() => setSelectedIds(selectedIds.size === data.length ? new Set() : new Set(data.map((item) => item._id)))}><Ionicons name={selectedIds.size === data.length ? 'checkbox' : 'square-outline'} size={19} color={theme.primary} /><Text style={styles.linkText}>{selectedIds.size ? `${selectedIds.size} selected` : 'Select all'}</Text></Pressable><View style={styles.flex} />{selectedIds.size > 0 && <Pressable onPress={() => deleteSelected('/reminders')}><Ionicons name="trash-outline" size={20} color="#d55252" /></Pressable>}</View></Card>}
      {data.map((reminder) => <Card styles={styles} key={reminder._id}>
        <View style={styles.itemRow}><Pressable style={styles.rowCheck} onPress={() => toggleSelected(reminder._id)}><Ionicons name={selectedIds.has(reminder._id) ? 'checkbox' : 'square-outline'} size={19} color={theme.primary} /></Pressable><View style={styles.expenseIcon}><Ionicons name="calendar-outline" size={18} color={theme.primary} /></View><Pressable style={styles.flex} onPress={() => request(`/reminders/${reminder._id}`, { token, method: 'PATCH', body: { completed: !reminder.completed } }).then(load).catch((error) => Alert.alert('Could not update', error.message))}>
          <Text style={[styles.itemTitle, reminder.completed && styles.strike]}>{reminder.title}</Text><Text style={styles.muted}>{new Date(reminder.dueDate).toLocaleDateString()}{reminder.amount != null ? ` · ${money(reminder.amount)}` : ''}</Text>
        </Pressable><Text style={[styles.badge, reminder.completed ? styles.badgeDone : new Date(`${String(reminder.dueDate).slice(0,10)}T00:00:00`) < new Date(`${today()}T00:00:00`) ? styles.badgeOverdue : null]}>{reminder.completed ? 'Paid' : String(reminder.dueDate).slice(0,10) < today() ? 'Overdue' : String(reminder.dueDate).slice(0,10) === today() ? 'Due today' : 'Upcoming'}</Text><Pressable onPress={() => remove('/reminders', reminder._id)}><Ionicons name="trash-outline" size={18} color="#d55252" /></Pressable></View>
      </Card>)}
      {!data.length && <Empty text="No reminders yet." styles={styles} />}
    </>;
    if (screen === 'Scheduled messages') return <>
        {data.map((message) => <Card styles={styles} key={message._id}>
        <View style={styles.itemRow}><View style={styles.flex}><Text style={styles.itemTitle}>{message.contactName}</Text><Text style={styles.muted}>{message.email || message.phone} · {message.channel}</Text></View><Text style={styles.badge}>{message.active ? 'Active' : 'Paused'}</Text></View>
        <Text style={styles.messagePreview}>{message.message}</Text>
        {message.lastError ? <Text style={styles.warningText}>{message.lastError}</Text> : null}
        <Text style={styles.muted}>{message.frequency} · {new Date(message.nextSendAt).toLocaleString()}</Text>
        <View style={styles.itemRow}>
          <Action title="Edit" secondary onPress={() => editMessage(message)} styles={styles} />
          <Action title={message.active ? 'Pause' : 'Resume'} secondary onPress={() => request(`/messages/${message._id}`, { token, method: 'PATCH', body: { active: !message.active } }).then(load).catch((error) => Alert.alert('Could not update', error.message))} styles={styles} />
          <Pressable onPress={() => remove('/messages', message._id)}><Text style={styles.removeText}>Delete</Text></Pressable>
        </View>
      </Card>)}
      {!data.length && <Empty text="No scheduled messages yet." styles={styles} />}
    </>;
    if (screen === 'Reports') {
      const totalIncome = data.reduce((sum, month) => sum + Number(month.income || 0), 0);
      const totalExpenses = data.reduce((sum, month) => sum + Number(month.expenses || 0), 0);
      const max = Math.max(1, ...data.map((month) => Math.max(Number(month.income) || 0, Number(month.expenses) || 0)));
      return <>
        <Card styles={styles}><Field label="Report year" value={String(reportYear)} onChangeText={(value) => /^\d{4}$/.test(value) && setReportYear(Number(value))} keyboardType="number-pad" maxLength={4} styles={styles} /><View style={styles.summaryLine}><Text style={styles.muted}>Yearly income</Text><Text style={styles.amount}>{money(totalIncome)}</Text></View><View style={styles.summaryLine}><Text style={styles.muted}>Yearly expenses</Text><Text style={styles.amount}>{money(totalExpenses)}</Text></View><View style={styles.summaryLine}><Text style={styles.itemTitle}>Net savings</Text><Text style={[styles.amount, totalIncome < totalExpenses && styles.negativeAmount]}>{money(totalIncome - totalExpenses)}</Text></View></Card>
        <Card styles={styles}><Text style={styles.cardTitle}>Monthly cash flow · {reportYear}</Text><View style={styles.reportLegend}><View style={styles.legendItem}><View style={styles.incomeLegend} /><Text style={styles.muted}>Income</Text></View><View style={styles.legendItem}><View style={styles.expenseLegend} /><Text style={styles.muted}>Expenses</Text></View></View>
          {data.map((month) => <View key={month.month} style={styles.reportMonth}><Text style={styles.reportMonthName}>{new Date(2000, month.month - 1).toLocaleString('en', { month: 'short' })}</Text><View style={styles.reportBars}><View style={[styles.reportBarIncome, { width: `${(Number(month.income) / max) * 100}%` }]} /><View style={[styles.reportBarExpense, { width: `${(Number(month.expenses) / max) * 100}%` }]} /></View><Text style={[styles.reportNet, Number(month.net) < 0 && styles.negativeAmount]}>{money(month.net)}</Text></View>)}
        </Card>
      </>;
    }
    if (screen === 'Transactions') return <>
      <Card styles={styles}>
        <Text style={styles.cardTitle}>Account statement</Text>
        <Field label="From (YYYY-MM-DD)" value={transactionFromInput} onChangeText={setTransactionFromInput} placeholder="All dates" keyboardType="numbers-and-punctuation" styles={styles} />
        <Field label="To (YYYY-MM-DD)" value={transactionToInput} onChangeText={setTransactionToInput} placeholder="All dates" keyboardType="numbers-and-punctuation" styles={styles} />
        <Action title="Apply date filters" secondary onPress={() => { setTransactionFrom(transactionFromInput); setTransactionTo(transactionToInput); setTransactionPage(1); }} styles={styles} />
        {(transactionFrom || transactionTo || transactionFromInput || transactionToInput) ? <Action title="Clear date filters" secondary onPress={() => { setTransactionFrom(''); setTransactionTo(''); setTransactionFromInput(''); setTransactionToInput(''); setTransactionPage(1); }} styles={styles} /> : null}
      </Card>
      {statement ? <Card styles={styles}>
        <Text style={styles.cardTitle}>Statement totals</Text>
        <View style={styles.summaryLine}><Text style={styles.muted}>Opening balance</Text><Text style={styles.amount}>{exactMoney(statement.openingBalance)}</Text></View>
        <View style={styles.summaryLine}><Text style={styles.muted}>Money in</Text><Text style={styles.amount}>{exactMoney(statement.credits)}</Text></View>
        <View style={styles.summaryLine}><Text style={styles.muted}>Money out</Text><Text style={styles.amount}>{exactMoney(statement.debits)}</Text></View>
        <View style={styles.summaryLine}><Text style={styles.itemTitle}>Closing balance</Text><Text style={styles.amount}>{exactMoney(statement.closingBalance)}</Text></View>
      </Card> : null}
      {data.map((item) => <Card styles={styles} key={`${item.type}-${item.id}`}>
        <View style={styles.itemRow}>
          <View style={styles.expenseIcon}><Ionicons name={item.type === 'income' ? 'arrow-down-outline' : 'arrow-up-outline'} size={18} color={theme.primary} /></View>
          <View style={styles.flex}>
            <Text style={styles.itemTitle}>{item.description}</Text>
            <Text style={styles.muted}>{new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {item.type === 'reminder_payment' ? 'Reminder payment' : item.type === 'income' ? 'Income' : 'Expense'}</Text>
          </View>
        </View>
        <View style={styles.summaryLine}>
          <Text style={styles.muted}>{item.credit ? 'Money in' : 'Money out'}</Text>
          <View style={styles.transactionAmountBlock}>
            <Text style={styles.amount}>{item.credit ? `+${exactMoney(item.credit)}` : `−${exactMoney(item.debit)}`}</Text>
            <Text style={styles.transactionBalanceHint}>Balance {exactMoney(item.balance)}</Text>
          </View>
        </View>
      </Card>)}
      {!data.length && !loading && <Empty text="No transactions found for this period." styles={styles} />}
      {statement?.pageCount > 1 ? <Card styles={styles}>
        <View style={styles.itemRow}>
          <Pressable disabled={transactionPage <= 1} onPress={() => setTransactionPage((current) => current - 1)}><Text style={[styles.linkText, transactionPage <= 1 && styles.muted]}>‹ Previous</Text></Pressable>
          <View style={styles.flex} />
          <Text style={styles.muted}>Page {statement.page} of {statement.pageCount}</Text>
          <View style={styles.flex} />
          <Pressable disabled={transactionPage >= statement.pageCount} onPress={() => setTransactionPage((current) => current + 1)}><Text style={[styles.linkText, transactionPage >= statement.pageCount && styles.muted]}>Next ›</Text></Pressable>
        </View>
      </Card> : null}
    </>;
    return <MoreMenu styles={styles} primary={theme.primary} changeScreen={changeScreen} logout={logout} user={user} profileAvatar={profileAvatar} chooseProfilePhoto={chooseProfilePhoto} clearProfilePhoto={() => setProfileAvatar('')}
      appearance={appearance} chooseAppearance={chooseAppearance} palette={palette} choosePalette={choosePalette}
      customAccent={customAccent} setCustomAccent={chooseCustomAccent}
      profileName={profileName} setProfileName={setProfileName} saveProfile={saveProfile} profileBusy={profileBusy} profilePhotoBusy={profilePhotoBusy} />;
  };

  if (booting) return <SafeAreaView style={[styles.safe, styles.center]}><ActivityIndicator color={BRAND} size="large" /></SafeAreaView>;
  if (!token) return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView style={styles.authWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}><Ionicons name="wallet" size={25} color="#fff" /></View>
          <Text style={styles.heroTitle}>SpendWise</Text>
          {!!hiddenResetToken && <Card styles={styles}><Text style={styles.cardTitle}>Set a new expense PIN</Text><Text style={styles.muted}>Use 4 to 64 letters or numbers.</Text><Field label="New expense PIN" value={hiddenKey} onChangeText={setHiddenKey} secureTextEntry autoCapitalize="none" maxLength={64} styles={styles} /><Field label="Confirm PIN" value={hiddenKeyConfirm} onChangeText={setHiddenKeyConfirm} secureTextEntry autoCapitalize="none" maxLength={64} styles={styles} />{hiddenError ? <Text style={styles.errorText}>{hiddenError}</Text> : null}<Action title="Update expense PIN" onPress={submitHiddenAction} styles={styles} /></Card>}
          <Text style={styles.muted}>{authMode === 'login' ? 'Sign in to pick up where you left off.' : authMode === 'register' ? 'Create an account to get started.' : 'We’ll email a secure password reset link if the account exists.'}</Text>
          {authMode === 'register' && <Field label="Name" value={authForm.name} onChangeText={(name) => setAuthForm({ ...authForm, name })} styles={styles} />}
          <Field label="Email" value={authForm.email} onChangeText={(email) => setAuthForm({ ...authForm, email })} keyboardType="email-address" autoCapitalize="none" styles={styles} />
          {authMode !== 'forgot' && <Field label={authMode === 'reset' ? 'New password' : 'Password'} value={authForm.password} onChangeText={(password) => setAuthForm({ ...authForm, password })} secureTextEntry styles={styles} />}
          <Action title={authMode === 'login' ? 'Sign in' : authMode === 'register' ? 'Create account' : authMode === 'reset' ? 'Update password' : 'Send reset link'} onPress={signIn} styles={styles} />
          {authMode === 'login' && <Pressable onPress={() => setAuthMode('forgot')} style={styles.authSwitch}><Text style={styles.linkText}>Forgot password?</Text></Pressable>}
          {authMode !== 'reset' && <Pressable onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={styles.authSwitch}>
            <Text style={styles.linkText}>{authMode === 'forgot' ? 'Back to sign in' : authMode === 'login' ? 'New to SpendWise? Create an account' : 'Already have an account? Sign in'}</Text>
          </Pressable>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.appHeader}>
        <View><Text style={styles.eyebrow}>SPENDWISE</Text><Text style={styles.headerTitle}>{pageTitle}</Text></View>
        <View style={styles.headerActions}>
          <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Refresh"><Ionicons name="refresh-outline" size={23} color={theme.primary} /></Pressable>
          <Pressable onPress={() => changeScreen('More')} accessibilityRole="button" accessibilityLabel="Open profile">
            {user?.avatar ? <Image source={{ uri: user.avatar }} style={styles.headerAvatar} /> : <View style={styles.headerAvatarPlaceholder}><Ionicons name="person-outline" size={16} color={theme.primary} /></View>}
          </Pressable>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {screen === 'Overview' && <Text style={styles.greeting}>Hello{user?.name ? `, ${user.name}` : ''} 👋</Text>}
        {['Overview', 'Income'].includes(screen) && <View style={styles.periodPicker}><Pressable onPress={() => shiftMonth(-1)}><Text style={styles.periodArrow}>‹</Text></Pressable><Text style={styles.periodLabel}>{new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text><Pressable onPress={() => shiftMonth(1)}><Text style={styles.periodArrow}>›</Text></Pressable></View>}
        {!['More', 'Overview', 'Reports', 'Transactions'].includes(screen) && <Action title={formOpen ? 'Close form' : `+ Add ${screen === 'Expenses' ? 'expense' : screen === 'Income' ? 'income' : screen === 'Budgets' ? 'budget' : screen === 'Reminders' ? 'reminder' : 'message'}`} secondary onPress={() => { setFormOpen(!formOpen); if (formOpen) { setEditingExpenseId(null); setEditingIncomeId(null); setExpenseForm(initialExpense()); } else if (screen === 'Income') { setEditingIncomeId(null); setIncomeForm({ source: '', amount: '', date: today() }); } }} styles={styles} />}
        {renderForm()}
        {loading ? <ActivityIndicator color={BRAND} style={styles.loader} /> : renderBody()}
      </ScrollView>
      <View style={styles.tabBar}>
        {[
          { name: 'Overview', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
          { name: 'Expenses', label: 'Expenses', icon: 'receipt-outline', activeIcon: 'receipt' },
          { name: 'Income', label: 'Income', icon: 'trending-up-outline', activeIcon: 'trending-up' },
          { name: 'Budgets', label: 'Plans', icon: 'pie-chart-outline', activeIcon: 'pie-chart' },
          { name: 'More', label: 'More', icon: 'grid-outline', activeIcon: 'grid' },
        ].map(({ name, label, icon, activeIcon }) => {
          const active = screen === name || (name === 'More' && ['Reminders', 'Scheduled messages', 'Reports', 'Transactions'].includes(screen));
          return <Pressable key={name} onPress={() => changeScreen(name)} style={styles.tab}
            accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label}>
            <TabIcon name={active ? activeIcon : icon} active={active} color={active ? theme.primary : theme.muted} />
            <Text style={[styles.tabText, active && styles.tabActive]}>{label}</Text>
          </Pressable>;
        })}
      </View>
      <Modal visible={hiddenDialog} transparent animationType="slide" onRequestClose={() => setHiddenDialog(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeading}><View style={styles.dialogIcon}><Ionicons name="lock-closed" size={20} color={theme.primary} /></View><View style={styles.flex}><Text style={styles.cardTitle}>{hiddenMode === 'set' ? 'Create your expense PIN' : hiddenMode === 'change' ? 'Reset expense PIN' : hiddenMode === 'forgot' ? 'Recover expense PIN' : hiddenMode === 'reset-link' ? 'Set a new expense PIN' : 'Unlock hidden expenses'}</Text><Text style={styles.muted}>Hidden expenses stay private behind your PIN.</Text></View><Pressable onPress={() => setHiddenDialog(false)}><Ionicons name="close" size={23} color={theme.muted} /></Pressable></View>
            {hiddenMode === 'change' && <Field label="Current PIN" value={hiddenCurrentKey} onChangeText={setHiddenCurrentKey} secureTextEntry autoCapitalize="none" styles={styles} />}
            {hiddenMode !== 'forgot' && <Field label={hiddenMode === 'unlock' ? 'Expense PIN' : 'New PIN'} value={hiddenKey} onChangeText={setHiddenKey} secureTextEntry autoCapitalize="none" maxLength={64} styles={styles} />}
            {(hiddenMode === 'set' || hiddenMode === 'change' || hiddenMode === 'reset-link') && <Field label="Confirm PIN" value={hiddenKeyConfirm} onChangeText={setHiddenKeyConfirm} secureTextEntry autoCapitalize="none" maxLength={64} styles={styles} />}
            {hiddenMode === 'forgot' && <Text style={styles.muted}>We’ll send a recovery link to the email configured for your account.</Text>}
            {hiddenInfo ? <Text style={styles.successText}>{hiddenInfo}</Text> : null}
            {hiddenError ? <Text style={styles.errorText}>{hiddenError}</Text> : null}
            <Action title={hiddenMode === 'forgot' ? 'Send recovery link' : hiddenMode === 'unlock' ? 'Unlock' : hiddenMode === 'change' ? 'Update PIN' : hiddenMode === 'reset-link' ? 'Set new PIN' : 'Save PIN'} onPress={submitHiddenAction} styles={styles} />
            {hiddenConfigured && hiddenMode === 'unlock' && <View style={styles.dialogLinks}><Pressable onPress={() => { setHiddenMode('change'); setHiddenKey(''); setHiddenKeyConfirm(''); setHiddenError(''); setHiddenInfo(''); }}><Text style={styles.linkText}>Reset PIN</Text></Pressable><Pressable onPress={() => { setHiddenMode('forgot'); setHiddenError(''); setHiddenInfo(''); }}><Text style={styles.linkText}>Forgot PIN</Text></Pressable></View>}
            {hiddenMode !== 'unlock' && hiddenConfigured && <Pressable style={styles.authSwitch} onPress={() => { setHiddenMode('unlock'); setHiddenError(''); setHiddenInfo(''); }}><Text style={styles.linkText}>Back to PIN entry</Text></Pressable>}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, styles, ...props }) {
  return <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput placeholderTextColor="#8b96aa" {...props} style={[styles.input, props.multiline && styles.multiline]} />
  </View>;
}

function TabIcon({ name, active, color }) {
  const scale = useRef(new Animated.Value(active ? 1.12 : 1)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: active ? 1.12 : 1, speed: 18, bounciness: 8, useNativeDriver: true }).start();
  }, [active, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}><Ionicons name={name} size={21} color={color} /></Animated.View>;
}

function Card({ children, styles }) { return <View style={styles.card}>{children}</View>; }
function Action({ title, onPress, styles, secondary, disabled }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.action, secondary && styles.actionSecondary, disabled && styles.disabledAction]}><Text style={[styles.actionText, secondary && styles.actionSecondaryText]}>{title}</Text></Pressable>;
}
function SectionTitle({ title, styles }) { return <Text style={styles.sectionTitle}>{title}</Text>; }
function Empty({ text, styles }) { return <View style={styles.empty}><Text style={styles.muted}>{text}</Text></View>; }
function Stat({ label, value, styles, accent, icon, iconColor }) {
  return <View style={[styles.stat, accent && styles.statAccent]}>
    <View style={styles.statHeading}><Ionicons name={icon} size={16} color={iconColor} /><Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text></View>
    <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
  </View>;
}
function ExpenseRow({ item, styles, onDelete, onEdit, iconColor, selected, onSelect }) {
  return <Card styles={styles}><View style={styles.itemRow}>
    {onSelect && <Pressable onPress={onSelect} style={styles.rowCheck}><Ionicons name={selected ? 'checkbox' : 'square-outline'} size={19} color={selected ? iconColor : styles.checkbox.borderColor} /></Pressable>}
    <View style={styles.expenseIcon}><Ionicons name="receipt-outline" size={18} color={iconColor} /></View>
    <View style={styles.flex}><Text style={styles.itemTitle}>{item.item || item.description}</Text><Text style={styles.muted}>{item.category || 'Other'} · {methodLabel(item.paymentMethod)} · {new Date(item.date).toLocaleDateString()}</Text></View>
    <Text style={styles.amount}>{money(item.amount)}</Text>
    {onEdit && <Pressable onPress={onEdit}><Text style={styles.linkText}>Edit</Text></Pressable>}
    {onDelete && <Pressable onPress={onDelete}><Text style={styles.removeText}>×</Text></Pressable>}
  </View>
    {item.hasSubtypes && item.subtypes?.map((sub, index) => <Text key={index} style={styles.subText}>{sub.type} · {methodLabel(sub.paymentMethod)} · {money(sub.amount)}</Text>)}
  </Card>;
}
function ChoiceChips({ choices, value, onChange, styles }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
    {choices.map((choice) => <Pressable key={choice} onPress={() => onChange(choice)} style={[styles.chip, value === choice && styles.chipActive]}><Text style={[styles.chipText, value === choice && styles.chipTextActive]}>{choice}</Text></Pressable>)}
  </ScrollView>;
}
function PaymentChips({ value, onChange, styles, compact }) {
  const methods = PAYMENT_METHODS;
  return <ChoiceChips choices={methods} value={value} onChange={onChange} styles={styles} compact={compact} />;
}
function MoreMenu({ styles, primary, changeScreen, logout, user, profileAvatar, chooseProfilePhoto, clearProfilePhoto, appearance, chooseAppearance, palette, choosePalette, customAccent, setCustomAccent, profileName, setProfileName, saveProfile, profileBusy, profilePhotoBusy }) {
  const [previewPalette, setPreviewPalette] = useState(null);
  const previewAccent = previewPalette === 'Custom'
    ? customAccent
    : PALETTES.find(([name]) => name === previewPalette)?.[1] || customAccent;
  return <>
    <Card styles={styles}><Text style={styles.itemTitle}>{user?.name || user?.email || 'Your account'}</Text><Text style={styles.muted}>{user?.email}</Text>
      <View style={styles.profilePhotoRow}>{profileAvatar ? <Image source={{ uri: profileAvatar }} style={styles.profilePhoto} /> : <View style={styles.profilePhotoPlaceholder}><Ionicons name="person-outline" size={24} color={primary} /></View>}<View style={styles.flex}><Action title={profilePhotoBusy ? 'Preparing photo…' : 'Choose profile photo'} secondary onPress={chooseProfilePhoto} styles={styles} disabled={profilePhotoBusy || profileBusy} />{!!profileAvatar && <Pressable onPress={clearProfilePhoto}><Text style={styles.removeText}>Remove photo</Text></Pressable>}</View></View>
      <Field label="Display name" value={profileName} onChangeText={setProfileName} maxLength={60} styles={styles} />
      <Action title={profileBusy ? 'Uploading…' : 'Save profile'} onPress={saveProfile} styles={styles} disabled={profileBusy || profilePhotoBusy} />
    </Card>
    <Card styles={styles}><Text style={styles.cardTitle}>Appearance</Text><Text style={styles.label}>Light or dark mode</Text>
      <ChoiceChips choices={['system', 'light', 'dark']} value={appearance} onChange={chooseAppearance} styles={styles} />
      <Text style={styles.label}>Color theme</Text>
      <View style={styles.paletteGrid}>{[...PALETTES.map(([name]) => name), 'Custom'].map((name) => <Pressable key={name} onPress={() => setPreviewPalette(name)} style={[styles.paletteButton, (previewPalette || palette) === name && styles.paletteSelected]}><View style={[styles.paletteDot, { backgroundColor: name === 'Custom' ? customAccent : (PALETTES.find(([title]) => title === name)?.[1] || customAccent) }]} /><Text style={styles.paletteText}>{name}</Text></Pressable>)}</View>
      {previewPalette && <View style={styles.palettePreview}>
        <View style={[styles.palettePreviewAccent, { backgroundColor: previewAccent }]} />
        <View style={styles.flex}>
          <Text style={styles.itemTitle}>Preview: {previewPalette}</Text>
          <Text style={styles.muted}>Your current theme stays active until you apply this preview.</Text>
        </View>
        <Action title="Apply" onPress={async () => { await choosePalette(previewPalette); setPreviewPalette(null); }} styles={styles} />
      </View>}
      <Field label="Custom accent (hex, e.g. #7c6ee8)" value={customAccent} onChangeText={(value) => /^#[\da-f]{0,6}$/i.test(value) && setCustomAccent(value)} autoCapitalize="none" maxLength={7} styles={styles} />
      <Text style={styles.muted}>Your theme and appearance follow your account across devices.</Text>
    </Card>
    {['Transactions', 'Reminders', 'Scheduled messages', 'Reports'].map((name) => <Pressable key={name} onPress={() => changeScreen(name)} style={styles.moreRow}><Text style={styles.itemTitle}>{name}</Text><Text style={styles.linkText}>Open ›</Text></Pressable>)}
    <Action title="Sign out" secondary onPress={logout} styles={styles} />
  </>;
}

function makePalette(isDark, primary, name) {
  const [background, surface, ink, line, soft] = PALETTE_SURFACES[name] || PALETTE_SURFACES['Midnight Mint'];
  const design = MOBILE_THEME_IDS[name] || 'midnight-mint';
  if (!isDark) return { background, surface, ink, muted: '#74827b', line, soft, primary, design };
  const darkBackground = design === 'midnight-amoled' ? '#000000' : '#111923';
  const darkSurface = design === 'midnight-amoled' ? '#080a0a' : design === 'glassmorphism' ? '#263246' : '#1b2633';
  return {
    background: darkBackground,
    surface: darkSurface,
    ink: '#edf2f7',
    muted: '#a2afbc',
    line: design === 'midnight-amoled' ? '#202424' : '#34414e',
    soft: `${primary}2b`,
    primary,
    design,
  };
}
function makeStyles(theme) {
  const cardRadius = theme.design === 'neumorphism' ? 22 : theme.design === 'material-design' ? 9 : 16;
  const actionRadius = theme.design === 'material-design' ? 8 : theme.design === 'neumorphism' ? 24 : 12;
  const cardDepth = theme.design === 'neumorphism'
    ? { shadowColor: '#75849a', shadowOffset: { width: 5, height: 5 }, shadowOpacity: 0.18, shadowRadius: 9, elevation: 4 }
    : {};
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background }, center: { justifyContent: 'center', alignItems: 'center' },
    authWrap: { flex: 1 }, authContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    logo: { width: 46, height: 46, borderRadius: 15, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    heroTitle: { color: theme.ink, fontSize: 32, fontWeight: '800', marginBottom: 6 },
    authSwitch: { paddingVertical: 18, alignItems: 'center' }, linkText: { color: isDarkTheme(theme) ? '#aebcff' : '#3552dc', fontSize: 13, fontWeight: '700' },
    appHeader: { minHeight: 78, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.line, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 }, headerAvatar: { width: 31, height: 31, borderRadius: 16, backgroundColor: theme.soft }, headerAvatarPlaceholder: { width: 31, height: 31, borderRadius: 16, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center' },
    eyebrow: { color: theme.primary, fontSize: 9, fontWeight: '800', letterSpacing: 2 }, headerTitle: { color: theme.ink, fontSize: 19, fontWeight: '800', marginTop: 3 },
    periodPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 9, marginBottom: 10, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line }, periodArrow: { color: theme.primary, fontSize: 25, paddingHorizontal: 12, fontWeight: '700' }, periodLabel: { color: theme.ink, fontSize: 14, fontWeight: '800' },
    scroll: { flex: 1 }, content: { padding: 17, paddingBottom: 28 }, greeting: { color: theme.ink, fontSize: 20, fontWeight: '700', marginBottom: 16 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }, stat: { ...cardDepth, width: '48%', minHeight: 94, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: cardRadius, padding: 14, justifyContent: 'space-between' }, statAccent: { backgroundColor: theme.soft, borderColor: theme.primary }, statHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 }, statLabel: { color: theme.muted, fontSize: 11, flexShrink: 1 }, statLabelAccent: { color: theme.ink }, statValue: { color: theme.ink, fontSize: 17, fontWeight: '800' }, statValueAccent: { color: theme.ink },
    card: { ...cardDepth, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: cardRadius, padding: 15, marginBottom: 11 }, cardTitle: { color: theme.ink, fontSize: 16, fontWeight: '800', marginBottom: 12 }, sectionTitle: { color: theme.ink, fontSize: 17, fontWeight: '800', marginBottom: 12, marginTop: 5 },
    fieldWrap: { marginBottom: 12, flex: 1 }, label: { color: theme.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 }, input: { minHeight: 45, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.line, borderRadius: 11, color: theme.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }, multiline: { minHeight: 90, textAlignVertical: 'top' },
    inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, flex: { flex: 1, minWidth: 0 }, subtypeBox: { backgroundColor: theme.background, borderRadius: 12, borderWidth: 1, borderColor: theme.line, padding: 10, marginBottom: 10 },
    action: { minHeight: 45, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: actionRadius, backgroundColor: theme.primary, marginTop: 8 }, actionText: { color: '#fff', fontSize: 13, fontWeight: '800' }, actionSecondary: { backgroundColor: theme.soft }, actionSecondaryText: { color: theme.primary }, disabledAction: { opacity: 0.6 },
    chips: { flexDirection: 'row', gap: 7, paddingBottom: 7, paddingRight: 12 }, chip: { paddingVertical: 8, paddingHorizontal: 11, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.line, borderRadius: 20 }, chipActive: { backgroundColor: theme.soft, borderColor: theme.primary }, chipText: { color: theme.muted, fontSize: 11, fontWeight: '600' }, chipTextActive: { color: theme.primary, fontWeight: '800' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, expenseIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: theme.soft, justifyContent: 'center', alignItems: 'center' }, itemTitle: { color: theme.ink, fontSize: 13, fontWeight: '800' }, muted: { color: theme.muted, fontSize: 11, marginTop: 3 }, amount: { color: theme.ink, fontSize: 13, fontWeight: '800' }, transactionAmountBlock: { alignItems: 'flex-end' }, transactionBalanceHint: { color: theme.muted, fontSize: 10, marginTop: 3 }, removeText: { color: '#d55252', fontWeight: '700', fontSize: 14, padding: 5 }, subText: { color: theme.muted, fontSize: 11, paddingTop: 8, paddingLeft: 45 },
    empty: { minHeight: 90, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: 15, padding: 20 }, loader: { marginTop: 30 },
    progressTrack: { height: 7, backgroundColor: theme.soft, borderRadius: 5, marginTop: 12, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 5, backgroundColor: theme.primary }, badge: { color: theme.primary, backgroundColor: theme.soft, overflow: 'hidden', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' }, strike: { textDecorationLine: 'line-through', color: theme.muted }, messagePreview: { color: theme.ink, backgroundColor: theme.background, padding: 10, marginVertical: 10, borderRadius: 10, fontSize: 12 }, warningText: { color: '#b16e1a', fontSize: 11, marginVertical: 7 }, consentRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 8 }, checkbox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1, borderColor: theme.line }, checkboxOn: { backgroundColor: theme.primary, borderColor: theme.primary, justifyContent: 'center', alignItems: 'center' }, checkText: { color: '#fff', fontWeight: '900' },
    tabBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.line, paddingBottom: Platform.OS === 'ios' ? 14 : 5, paddingTop: 9 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 }, tabText: { color: theme.muted, fontSize: 10, fontWeight: '700' }, tabActive: { color: theme.primary }, moreRow: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: 13, padding: 16, marginBottom: 9, flexDirection: 'row', justifyContent: 'space-between' },
    profilePhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 8 }, profilePhoto: { width: 66, height: 66, borderRadius: 33, backgroundColor: theme.soft }, profilePhotoPlaceholder: { width: 66, height: 66, borderRadius: 33, backgroundColor: theme.soft, alignItems: 'center', justifyContent: 'center' },
    paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }, paletteButton: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.background }, paletteSelected: { borderColor: theme.primary, backgroundColor: theme.soft }, paletteDot: { width: 17, height: 17, borderRadius: 9 }, paletteText: { color: theme.ink, fontSize: 11, fontWeight: '700' },
    palettePreview: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8, borderRadius: cardRadius, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.surface }, palettePreviewAccent: { width: 30, height: 30, borderRadius: theme.design === 'material-design' ? 7 : 15 },
  });
}
function isDarkTheme(theme) { return theme.background === '#111923'; }
