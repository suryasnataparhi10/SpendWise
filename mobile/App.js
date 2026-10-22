import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import * as SecureStore from 'expo-secure-store';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://spendwise-api-97wv.onrender.com/api').replace(/\/$/, '');
const PAYMENT_METHODS = ['Cash', 'Navi', 'GPay', 'PhonePe', 'Paytm', 'YONO', 'ICICI', 'Overseas', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other'];
const BRAND = '#4f6bff';
const PALETTES = [
  ['Midnight Mint', '#56d6a4'], ['Ocean Breeze', '#287f8e'], ['Sage & Sand', '#71866b'],
  ['Berry Night', '#a34e83'], ['Arctic Frost', '#527fa8'], ['Rosewood', '#a65970'],
  ['Citrus Grove', '#728a3c'], ['Royal Indigo', '#5d5fb0'], ['Aurora Glow', '#3c9d96'],
  ['Sakura', '#c7668a'], ['Midnight Orchid', '#8061a5'], ['Coastal Sand', '#4c9290'],
];
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
const methodLabel = (value) =>
  ['Navi', 'GPay', 'PhonePe', 'Paytm', 'YONO', 'ICICI', 'Overseas'].includes(value)
    ? `UPI · ${value}`
    : value || 'Cash';

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.message || 'Unable to connect to SpendWise');
  return result.data;
}

const initialExpense = () => ({
  item: '', amount: '', paymentMethod: 'Cash', date: today(), hasSubtypes: false,
  subtypes: [{ type: '', amount: '', paymentMethod: 'Cash' }],
});
const initialMessage = () => ({
  contactName: '', channel: 'email', email: '', phone: '+91', message: '',
  frequency: 'once', date: tomorrow(), time: '09:00', recipientConsented: false,
});

export default function App() {
  const systemScheme = useColorScheme();
  const [appearance, setAppearance] = useState('system');
  const [palette, setPalette] = useState('Midnight Mint');
  const [customAccent, setCustomAccent] = useState('#7c6ee8');
  const [profileName, setProfileName] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const isDark = appearance === 'system' ? systemScheme === 'dark' : appearance === 'dark';
  const chosenAccent = palette === 'Custom' ? (/^#[\da-f]{6}$/i.test(customAccent) ? customAccent : '#7c6ee8') : (PALETTES.find(([name]) => name === palette)?.[1] || PALETTES[0][1]);
  const theme = makePalette(isDark, chosenAccent, palette);
  const styles = makeStyles(theme);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [screen, setScreen] = useState('Overview');
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [messageStatus, setMessageStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseMonth, setExpenseMonth] = useState(today().slice(0, 7));
  const [expensePayment, setExpensePayment] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7));
  const [expenseForm, setExpenseForm] = useState(initialExpense);
  const [incomeForm, setIncomeForm] = useState({ source: '', amount: '', date: today() });
  const [budgetForm, setBudgetForm] = useState({ month: String(new Date().getMonth() + 1), limit: '' });
  const [reminderForm, setReminderForm] = useState({ title: '', amount: '', dueDate: today() });
  const [messageForm, setMessageForm] = useState(initialMessage);

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
        const params = new URLSearchParams();
        if (expenseSearch.trim()) params.set('search', expenseSearch.trim());
        if (expensePayment) params.set('paymentMethod', expensePayment);
        if (expenseMonth && !expenseSearch.trim()) { params.set('year', expenseMonth.slice(0, 4)); params.set('month', String(Number(expenseMonth.slice(5, 7)))); }
        next = await request(`/expenses?${params.toString()}`, { token });
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
        next = await request(`/reports/yearly?year=${viewYear}`, { token });
      }
      setData(next || []);
    } catch (error) {
      Alert.alert('Could not load data', error.message);
    } finally {
      setLoading(false);
    }
  }, [screen, token, expenseSearch, expenseMonth, expensePayment, selectedMonth]);

  useEffect(() => { load(); }, [load]);

  const signIn = async () => {
    try {
      if (authMode === 'forgot') {
        await request('/auth/forgot-password', { method: 'POST', body: { email: authForm.email } });
        Alert.alert('Check your email', 'If an account exists, a password reset link has been sent.');
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
      setScreen('Overview');
    } catch (error) {
      Alert.alert('Sign in failed', error.message);
    }
  };

  const save = async (path, body, method = 'POST') => {
    try {
      await request(path, { token, method, body });
      setFormOpen(false);
      await load();
    } catch (error) {
      Alert.alert('Could not save', error.message);
    }
  };

  const remove = (path, id) => Alert.alert('Delete item?', 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => request(`${path}/${id}`, { token, method: 'DELETE' }).then(load).catch((error) => Alert.alert('Could not delete', error.message)) },
  ]);

  const logout = async () => {
    await SecureStore.deleteItemAsync('spendwise-token');
    setToken(null);
    setUser(null);
    setData([]);
    setScreen('Overview');
  };

  const chooseAppearance = async (value) => { setAppearance(value); await SecureStore.setItemAsync('spendwise-appearance', value); };
  const choosePalette = async (value) => { setPalette(value); await SecureStore.setItemAsync('spendwise-palette', value); };
  const saveProfile = async () => {
    setProfileBusy(true);
    try { const updated = await request('/auth/profile', { token, method: 'PATCH', body: { name: profileName.trim() } }); setUser(updated); Alert.alert('Profile saved', 'Your display name has been updated.'); }
    catch (error) { Alert.alert('Could not save profile', error.message); }
    finally { setProfileBusy(false); }
  };

  const changeScreen = (name) => {
    setScreen(name);
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
    if (expenseForm.hasSubtypes && !activeSubtypes.length) return Alert.alert('Add at least one subtype with an amount');
    save(editingExpenseId ? `/expenses/${editingExpenseId}` : '/expenses', {
      item: expenseForm.item.trim(), description: expenseForm.item.trim(), category: 'Other',
      date: expenseForm.date || today(), amount, paymentMethod: expenseForm.paymentMethod,
      hasSubtypes: expenseForm.hasSubtypes, subtypes: expenseForm.hasSubtypes ? activeSubtypes : [],
    }, editingExpenseId ? 'PUT' : 'POST');
    setExpenseForm(initialExpense());
    setEditingExpenseId(null);
  };

  const editExpense = (expense) => {
    setEditingExpenseId(expense._id);
    setExpenseForm({ item: expense.item || expense.description || '', amount: String(expense.amount || ''), date: String(expense.date).slice(0, 10), paymentMethod: expense.paymentMethod || 'Cash', hasSubtypes: Boolean(expense.hasSubtypes), subtypes: expense.subtypes?.length ? expense.subtypes.map((sub) => ({ ...sub, amount: String(sub.amount) })) : [{ type: '', amount: '', paymentMethod: 'Cash' }] });
    setFormOpen(true);
  };

  const submitMessage = () => {
    const destination = messageForm.channel === 'email' ? messageForm.email : messageForm.phone;
    if (!messageForm.contactName.trim() || !destination.trim() || !messageForm.message.trim()) return Alert.alert('Complete the contact and message fields');
    const scheduledAt = new Date(`${messageForm.date}T${messageForm.time}:00`);
    save('/messages', {
      ...messageForm,
      scheduledAt: scheduledAt.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
      recipientConsented: messageForm.recipientConsented,
    });
    setMessageForm(initialMessage());
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
        <Action title={editingExpenseId ? 'Update expense' : 'Save expense'} onPress={submitExpense} styles={styles} />
      </Card>
    );
    if (screen === 'Income') return (
      <Card styles={styles}>
        <Text style={styles.cardTitle}>Add income</Text>
        <Field label="Source" value={incomeForm.source} onChangeText={(source) => setIncomeForm({ ...incomeForm, source })} placeholder="e.g. Salary" styles={styles} />
        <Field label="Amount" value={incomeForm.amount} onChangeText={(amount) => setIncomeForm({ ...incomeForm, amount })} keyboardType="decimal-pad" placeholder="₹ 0" styles={styles} />
        <Field label="Date (YYYY-MM-DD)" value={incomeForm.date} onChangeText={(date) => setIncomeForm({ ...incomeForm, date })} styles={styles} />
        <Action title="Save income" onPress={() => save('/income', { ...incomeForm, amount: Number(incomeForm.amount) })} styles={styles} />
      </Card>
    );
    if (screen === 'Budgets') return (
      <Card styles={styles}>
        <Text style={styles.cardTitle}>Set monthly budget</Text>
        <Field label="Month (1–12)" value={budgetForm.month} onChangeText={(month) => setBudgetForm({ ...budgetForm, month })} keyboardType="number-pad" styles={styles} />
        <Field label="Budget amount" value={budgetForm.limit} onChangeText={(limit) => setBudgetForm({ ...budgetForm, limit })} keyboardType="decimal-pad" placeholder="₹ 0" styles={styles} />
        <Action title="Save budget" onPress={() => save('/budgets', { month: Number(budgetForm.month), year: new Date().getFullYear(), limit: Number(budgetForm.limit) }, 'PUT')} styles={styles} />
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
        <Text style={styles.cardTitle}>Schedule a message</Text>
        <Field label="Contact name" value={messageForm.contactName} onChangeText={(contactName) => setMessageForm({ ...messageForm, contactName })} styles={styles} />
        <Text style={styles.label}>Send with</Text>
        <ChoiceChips choices={['email', 'sms', 'whatsapp']} value={messageForm.channel} onChange={(channel) => setMessageForm({ ...messageForm, channel })} styles={styles} />
        <Field label={messageForm.channel === 'email' ? 'Email address' : 'Phone number'} value={messageForm.channel === 'email' ? messageForm.email : messageForm.phone} onChangeText={(value) => setMessageForm({ ...messageForm, [messageForm.channel === 'email' ? 'email' : 'phone']: value })} keyboardType={messageForm.channel === 'email' ? 'email-address' : 'phone-pad'} styles={styles} />
        <Field label="Message" value={messageForm.message} onChangeText={(message) => setMessageForm({ ...messageForm, message })} multiline placeholder="Use {name} to personalize" styles={styles} />
        <Text style={styles.label}>Repeat</Text>
        <ChoiceChips choices={['once', 'daily', 'weekly', 'monthly']} value={messageForm.frequency} onChange={(frequency) => setMessageForm({ ...messageForm, frequency })} styles={styles} />
        <View style={styles.inlineRow}>
          <View style={styles.flex}><Field label="Date (YYYY-MM-DD)" value={messageForm.date} onChangeText={(date) => setMessageForm({ ...messageForm, date })} styles={styles} /></View>
          <View style={styles.flex}><Field label="Time (24h)" value={messageForm.time} onChangeText={(time) => setMessageForm({ ...messageForm, time })} styles={styles} /></View>
        </View>
        <Pressable style={styles.consentRow} onPress={() => setMessageForm({ ...messageForm, recipientConsented: !messageForm.recipientConsented })}>
          <View style={[styles.checkbox, messageForm.recipientConsented && styles.checkboxOn]}><Text style={styles.checkText}>{messageForm.recipientConsented ? '✓' : ''}</Text></View>
          <Text style={styles.muted}>I have permission to message this person</Text>
        </Pressable>
        {messageStatus && !messageStatus[messageForm.channel === 'email' ? 'emailConfigured' : messageForm.channel === 'sms' ? 'smsConfigured' : 'whatsappConfigured'] && <Text style={styles.warningText}>Delivery is not configured on the server yet.</Text>}
        <Action title="Schedule message" onPress={submitMessage} styles={styles} />
      </Card>
    );
    return null;
  };

  const renderBody = () => {
    if (screen === 'Overview') return (
      <>
        <View style={styles.statGrid}>
          <Stat label="Savings carried in" value={money(summary?.openingBalance)} styles={styles} />
          <Stat label="Income this month" value={money(summary?.totalMonthIncome)} styles={styles} />
          <Stat label="Available to spend" value={money(summary?.availableFunds ?? ((summary?.openingBalance || 0) + (summary?.totalMonthIncome || 0)))} styles={styles} accent />
          <Stat label="Expenses this month" value={money(summary?.totalMonthExpense)} styles={styles} />
          <Stat label="Balance after expenses" value={money(summary?.remainingBalance)} styles={styles} accent />
          <Stat label="Spent today" value={money(summary?.todayExpense)} styles={styles} />
        </View>
        <SectionTitle title="Recent expenses" styles={styles} />
        {data.map((expense) => <ExpenseRow key={expense._id} item={expense} styles={styles} onDelete={() => remove('/expenses', expense._id)} />)}
      </>
    );
    if (screen === 'Expenses') return <>
      <Card styles={styles}><Field label="Search expenses" value={expenseSearch} onChangeText={setExpenseSearch} placeholder="Search by item" styles={styles} /><Field label="Month (YYYY-MM)" value={expenseMonth} onChangeText={setExpenseMonth} placeholder="Leave empty for all dates" styles={styles} /><Text style={styles.label}>Payment method</Text><ChoiceChips choices={['All', ...PAYMENT_METHODS]} value={expensePayment || 'All'} onChange={(value) => setExpensePayment(value === 'All' ? '' : value)} styles={styles} /></Card>
      {data.map((expense) => <ExpenseRow key={expense._id} item={expense} styles={styles} onDelete={() => remove('/expenses', expense._id)} onEdit={() => editExpense(expense)} />)}
      {!data.length && <Empty text="No expenses recorded for this month." styles={styles} />}
    </>;
    if (screen === 'Income') return <>
      <Card styles={styles}><Text style={styles.cardTitle}>Monthly available balance</Text><View style={styles.itemRow}><Text style={[styles.muted, styles.flex]}>Previous month savings</Text><Text style={styles.amount}>{money(summary?.openingBalance)}</Text></View><View style={styles.itemRow}><Text style={[styles.muted, styles.flex]}>Income this month</Text><Text style={styles.amount}>{money(summary?.totalMonthIncome)}</Text></View><View style={styles.itemRow}><Text style={[styles.muted, styles.flex]}>Available before expenses</Text><Text style={styles.amount}>{money(summary?.availableFunds)}</Text></View><View style={styles.itemRow}><Text style={[styles.muted, styles.flex]}>Remaining after expenses</Text><Text style={styles.amount}>{money(summary?.remainingBalance)}</Text></View></Card>
      {data.map((entry) => <Card styles={styles} key={entry._id}>
        <View style={styles.itemRow}><View style={styles.flex}><Text style={styles.itemTitle}>{entry.source}</Text><Text style={styles.muted}>{new Date(entry.date).toLocaleDateString()}</Text></View><Text style={styles.amount}>{money(entry.amount)}</Text><Pressable onPress={() => remove('/income', entry._id)}><Text style={styles.removeText}>×</Text></Pressable></View>
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
      {data.map((reminder) => <Card styles={styles} key={reminder._id}>
        <View style={styles.itemRow}><Pressable style={styles.flex} onPress={() => request(`/reminders/${reminder._id}`, { token, method: 'PATCH', body: { completed: !reminder.completed } }).then(load).catch((error) => Alert.alert('Could not update', error.message))}>
          <Text style={[styles.itemTitle, reminder.completed && styles.strike]}>{reminder.title}</Text><Text style={styles.muted}>{new Date(reminder.dueDate).toLocaleDateString()}{reminder.amount != null ? ` · ${money(reminder.amount)}` : ''}</Text>
        </Pressable><Text style={styles.badge}>{reminder.completed ? 'Done' : 'Open'}</Text><Pressable onPress={() => remove('/reminders', reminder._id)}><Text style={styles.removeText}>×</Text></Pressable></View>
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
          <Action title={message.active ? 'Pause' : 'Resume'} secondary onPress={() => request(`/messages/${message._id}`, { token, method: 'PATCH', body: { active: !message.active } }).then(load).catch((error) => Alert.alert('Could not update', error.message))} styles={styles} />
          <Pressable onPress={() => remove('/messages', message._id)}><Text style={styles.removeText}>Delete</Text></Pressable>
        </View>
      </Card>)}
      {!data.length && <Empty text="No scheduled messages yet." styles={styles} />}
    </>;
    if (screen === 'Reports') return <>
      <Card styles={styles}><Text style={styles.cardTitle}>{new Date().getFullYear()} overview</Text><Text style={styles.muted}>Monthly totals from your account</Text></Card>
      {data.map((month) => <Card styles={styles} key={month.month}>
        <View style={styles.itemRow}><Text style={[styles.itemTitle, styles.flex]}>{new Date(2000, month.month - 1).toLocaleString('en', { month: 'long' })}</Text><Text style={styles.muted}>{money(month.income - month.expenses)}</Text></View>
        <Text style={styles.muted}>Income {money(month.income)} · Expenses {money(month.expenses)}</Text>
      </Card>)}
    </>;
    return <MoreMenu styles={styles} changeScreen={changeScreen} logout={logout} user={user}
      appearance={appearance} chooseAppearance={chooseAppearance} palette={palette} choosePalette={choosePalette}
      customAccent={customAccent} setCustomAccent={(value) => { setCustomAccent(value); if (/^#[\da-f]{6}$/i.test(value)) SecureStore.setItemAsync('spendwise-custom-accent', value); }}
      profileName={profileName} setProfileName={setProfileName} saveProfile={saveProfile} profileBusy={profileBusy} />;
  };

  if (booting) return <SafeAreaView style={[styles.safe, styles.center]}><ActivityIndicator color={BRAND} size="large" /></SafeAreaView>;
  if (!token) return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView style={styles.authWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}><Text style={styles.logoMark}>W</Text></View>
          <Text style={styles.heroTitle}>SpendWise</Text>
          <Text style={styles.muted}>{authMode === 'login' ? 'Sign in to pick up where you left off.' : authMode === 'register' ? 'Create an account to get started.' : 'We’ll email a secure password reset link if the account exists.'}</Text>
          {authMode === 'register' && <Field label="Name" value={authForm.name} onChangeText={(name) => setAuthForm({ ...authForm, name })} styles={styles} />}
          <Field label="Email" value={authForm.email} onChangeText={(email) => setAuthForm({ ...authForm, email })} keyboardType="email-address" autoCapitalize="none" styles={styles} />
          {authMode !== 'forgot' && <Field label="Password" value={authForm.password} onChangeText={(password) => setAuthForm({ ...authForm, password })} secureTextEntry styles={styles} />}
          <Action title={authMode === 'login' ? 'Sign in' : authMode === 'register' ? 'Create account' : 'Send reset link'} onPress={signIn} styles={styles} />
          {authMode === 'login' && <Pressable onPress={() => setAuthMode('forgot')} style={styles.authSwitch}><Text style={styles.linkText}>Forgot password?</Text></Pressable>}
          <Pressable onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={styles.authSwitch}>
            <Text style={styles.linkText}>{authMode === 'forgot' ? 'Back to sign in' : authMode === 'login' ? 'New to SpendWise? Create an account' : 'Already have an account? Sign in'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.appHeader}>
        <View><Text style={styles.eyebrow}>SPENDWISE</Text><Text style={styles.headerTitle}>{pageTitle}</Text></View>
        <Pressable onPress={load} accessibilityLabel="Refresh"><Text style={styles.refresh}>↻</Text></Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {screen === 'Overview' && <Text style={styles.greeting}>Hello{user?.name ? `, ${user.name}` : ''} 👋</Text>}
        {['Overview', 'Income'].includes(screen) && <View style={styles.periodPicker}><Pressable onPress={() => shiftMonth(-1)}><Text style={styles.periodArrow}>‹</Text></Pressable><Text style={styles.periodLabel}>{new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text><Pressable onPress={() => shiftMonth(1)}><Text style={styles.periodArrow}>›</Text></Pressable></View>}
        {screen !== 'More' && screen !== 'Overview' && <Action title={formOpen ? 'Close form' : `+ Add ${screen === 'Expenses' ? 'expense' : screen === 'Income' ? 'income' : screen === 'Budgets' ? 'budget' : screen === 'Reminders' ? 'reminder' : 'message'}`} secondary onPress={() => { setFormOpen(!formOpen); if (formOpen) { setEditingExpenseId(null); setExpenseForm(initialExpense()); } }} styles={styles} />}
        {renderForm()}
        {loading ? <ActivityIndicator color={BRAND} style={styles.loader} /> : renderBody()}
      </ScrollView>
      <View style={styles.tabBar}>
        {['Overview', 'Expenses', 'Income', 'Budgets', 'More'].map((name) => (
          <Pressable key={name} onPress={() => changeScreen(name)} style={styles.tab}>
            <Text style={[styles.tabText, screen === name || (name === 'More' && ['Reminders', 'Scheduled messages', 'Reports'].includes(screen)) ? styles.tabActive : null]}>{name === 'Overview' ? 'Home' : name === 'Budgets' ? 'Plans' : name}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function Field({ label, styles, ...props }) {
  return <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput placeholderTextColor="#8b96aa" {...props} style={[styles.input, props.multiline && styles.multiline]} />
  </View>;
}

function Card({ children, styles }) { return <View style={styles.card}>{children}</View>; }
function Action({ title, onPress, styles, secondary }) {
  return <Pressable onPress={onPress} style={[styles.action, secondary && styles.actionSecondary]}><Text style={[styles.actionText, secondary && styles.actionSecondaryText]}>{title}</Text></Pressable>;
}
function SectionTitle({ title, styles }) { return <Text style={styles.sectionTitle}>{title}</Text>; }
function Empty({ text, styles }) { return <View style={styles.empty}><Text style={styles.muted}>{text}</Text></View>; }
function Stat({ label, value, styles, accent }) {
  return <View style={[styles.stat, accent && styles.statAccent]}><Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text><Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text></View>;
}
function ExpenseRow({ item, styles, onDelete, onEdit }) {
  return <Card styles={styles}><View style={styles.itemRow}>
    <View style={styles.expenseIcon}><Text style={styles.expenseIconText}>↗</Text></View>
    <View style={styles.flex}><Text style={styles.itemTitle}>{item.item || item.description}</Text><Text style={styles.muted}>{methodLabel(item.paymentMethod)} · {new Date(item.date).toLocaleDateString()}</Text></View>
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
function MoreMenu({ styles, changeScreen, logout, user, appearance, chooseAppearance, palette, choosePalette, customAccent, setCustomAccent, profileName, setProfileName, saveProfile, profileBusy }) {
  return <>
    <Card styles={styles}><Text style={styles.itemTitle}>{user?.name || user?.email || 'Your account'}</Text><Text style={styles.muted}>{user?.email}</Text>
      <Field label="Display name" value={profileName} onChangeText={setProfileName} maxLength={60} styles={styles} />
      <Action title={profileBusy ? 'Saving…' : 'Save profile'} onPress={saveProfile} styles={styles} />
    </Card>
    <Card styles={styles}><Text style={styles.cardTitle}>Appearance</Text><Text style={styles.label}>Light or dark mode</Text>
      <ChoiceChips choices={['system', 'light', 'dark']} value={appearance} onChange={chooseAppearance} styles={styles} />
      <Text style={styles.label}>Color theme</Text>
      <View style={styles.paletteGrid}>{[...PALETTES.map(([name]) => name), 'Custom'].map((name) => <Pressable key={name} onPress={() => choosePalette(name)} style={[styles.paletteButton, palette === name && styles.paletteSelected]}><View style={[styles.paletteDot, { backgroundColor: name === 'Custom' ? customAccent : (PALETTES.find(([title]) => title === name)?.[1] || customAccent) }]} /><Text style={styles.paletteText}>{name}</Text></Pressable>)}</View>
      <Field label="Custom accent (hex, e.g. #7c6ee8)" value={customAccent} onChangeText={(value) => /^#[\da-f]{0,6}$/i.test(value) && setCustomAccent(value)} autoCapitalize="none" maxLength={7} styles={styles} />
      <Text style={styles.muted}>Theme and appearance are saved on this device and support light and dark mode.</Text>
    </Card>
    {['Reminders', 'Scheduled messages', 'Reports'].map((name) => <Pressable key={name} onPress={() => changeScreen(name)} style={styles.moreRow}><Text style={styles.itemTitle}>{name}</Text><Text style={styles.linkText}>Open ›</Text></Pressable>)}
    <Action title="Sign out" secondary onPress={logout} styles={styles} />
  </>;
}

function makePalette(isDark, primary, name) {
  const [background, surface, ink, line, soft] = PALETTE_SURFACES[name] || PALETTE_SURFACES['Midnight Mint'];
  return isDark
    ? { background: '#111923', surface: '#1b2633', ink: '#edf2f7', muted: '#a2afbc', line: '#34414e', soft: `${primary}2b`, primary }
    : { background, surface, ink, muted: '#74827b', line, soft, primary };
}
function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background }, center: { justifyContent: 'center', alignItems: 'center' },
    authWrap: { flex: 1 }, authContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    logo: { width: 46, height: 46, borderRadius: 15, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, logoMark: { color: '#fff', fontWeight: '900', fontSize: 22 },
    heroTitle: { color: theme.ink, fontSize: 32, fontWeight: '800', marginBottom: 6 },
    authSwitch: { paddingVertical: 18, alignItems: 'center' }, linkText: { color: isDarkTheme(theme) ? '#aebcff' : '#3552dc', fontSize: 13, fontWeight: '700' },
    appHeader: { minHeight: 78, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.line, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: theme.primary, fontSize: 9, fontWeight: '800', letterSpacing: 2 }, headerTitle: { color: theme.ink, fontSize: 19, fontWeight: '800', marginTop: 3 }, refresh: { color: theme.primary, fontSize: 27, padding: 4 },
    periodPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 9, marginBottom: 10, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line }, periodArrow: { color: theme.primary, fontSize: 25, paddingHorizontal: 12, fontWeight: '700' }, periodLabel: { color: theme.ink, fontSize: 14, fontWeight: '800' },
    scroll: { flex: 1 }, content: { padding: 17, paddingBottom: 28 }, greeting: { color: theme.ink, fontSize: 20, fontWeight: '700', marginBottom: 16 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }, stat: { width: '48%', minHeight: 94, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: 17, padding: 14, justifyContent: 'space-between' }, statAccent: { backgroundColor: theme.soft, borderColor: theme.primary }, statLabel: { color: theme.muted, fontSize: 11 }, statLabelAccent: { color: theme.ink }, statValue: { color: theme.ink, fontSize: 17, fontWeight: '800' }, statValueAccent: { color: theme.ink },
    card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: 16, padding: 15, marginBottom: 11 }, cardTitle: { color: theme.ink, fontSize: 16, fontWeight: '800', marginBottom: 12 }, sectionTitle: { color: theme.ink, fontSize: 17, fontWeight: '800', marginBottom: 12, marginTop: 5 },
    fieldWrap: { marginBottom: 12, flex: 1 }, label: { color: theme.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 }, input: { minHeight: 45, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.line, borderRadius: 11, color: theme.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }, multiline: { minHeight: 90, textAlignVertical: 'top' },
    inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, flex: { flex: 1, minWidth: 0 }, subtypeBox: { backgroundColor: theme.background, borderRadius: 12, borderWidth: 1, borderColor: theme.line, padding: 10, marginBottom: 10 },
    action: { minHeight: 45, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 12, backgroundColor: theme.primary, marginTop: 8 }, actionText: { color: '#fff', fontSize: 13, fontWeight: '800' }, actionSecondary: { backgroundColor: theme.soft }, actionSecondaryText: { color: theme.primary },
    chips: { flexDirection: 'row', gap: 7, paddingBottom: 7, paddingRight: 12 }, chip: { paddingVertical: 8, paddingHorizontal: 11, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.line, borderRadius: 20 }, chipActive: { backgroundColor: theme.soft, borderColor: theme.primary }, chipText: { color: theme.muted, fontSize: 11, fontWeight: '600' }, chipTextActive: { color: theme.primary, fontWeight: '800' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, expenseIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: theme.soft, justifyContent: 'center', alignItems: 'center' }, expenseIconText: { color: theme.primary, fontWeight: '800' }, itemTitle: { color: theme.ink, fontSize: 13, fontWeight: '800' }, muted: { color: theme.muted, fontSize: 11, marginTop: 3 }, amount: { color: theme.ink, fontSize: 13, fontWeight: '800' }, removeText: { color: '#d55252', fontWeight: '700', fontSize: 14, padding: 5 }, subText: { color: theme.muted, fontSize: 11, paddingTop: 8, paddingLeft: 45 },
    empty: { minHeight: 90, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: 15, padding: 20 }, loader: { marginTop: 30 },
    progressTrack: { height: 7, backgroundColor: theme.soft, borderRadius: 5, marginTop: 12, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 5, backgroundColor: theme.primary }, badge: { color: theme.primary, backgroundColor: theme.soft, overflow: 'hidden', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' }, strike: { textDecorationLine: 'line-through', color: theme.muted }, messagePreview: { color: theme.ink, backgroundColor: theme.background, padding: 10, marginVertical: 10, borderRadius: 10, fontSize: 12 }, warningText: { color: '#b16e1a', fontSize: 11, marginVertical: 7 }, consentRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 8 }, checkbox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1, borderColor: theme.line }, checkboxOn: { backgroundColor: theme.primary, borderColor: theme.primary, justifyContent: 'center', alignItems: 'center' }, checkText: { color: '#fff', fontWeight: '900' },
    tabBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.line, paddingBottom: Platform.OS === 'ios' ? 14 : 5, paddingTop: 10 }, tab: { flex: 1, alignItems: 'center', paddingVertical: 4 }, tabText: { color: theme.muted, fontSize: 10, fontWeight: '700' }, tabActive: { color: theme.primary }, moreRow: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: 13, padding: 16, marginBottom: 9, flexDirection: 'row', justifyContent: 'space-between' },
    paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }, paletteButton: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.background }, paletteSelected: { borderColor: theme.primary, backgroundColor: theme.soft }, paletteDot: { width: 17, height: 17, borderRadius: 9 }, paletteText: { color: theme.ink, fontSize: 11, fontWeight: '700' },
  });
}
function isDarkTheme(theme) { return theme.background === '#111923'; }
