import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, Route, Routes } from 'react-router-dom';
import Auth from './components/Auth';
import Layout from './layout/Layout';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Income from './pages/Income';
import Budgets from './pages/Budgets';
import Reminders from './pages/Reminders';
import Reports from './pages/Reports';
import ScheduledMessages from './pages/ScheduledMessages';
import ResetHiddenExpensePin from './pages/ResetHiddenExpensePin';

export default function App() {
  const theme = useSelector((state) => state.theme);
  const colorTheme = useSelector((state) => state.colorTheme);
  const customAccent = useSelector((state) => state.customAccent);

  useEffect(() => {
    document.documentElement.dataset.bsTheme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.colorTheme = colorTheme;
  }, [colorTheme]);

  useEffect(() => {
    const channels = customAccent.match(/[\da-f]{2}/gi)?.map((part) => parseInt(part, 16));
    const rgb = channels?.join(', ');
    const darkRgb = channels?.map((channel) => Math.round(channel + (255 - channel) * 0.27)).join(', ');
    document.documentElement.style.setProperty('--custom-accent', customAccent);
    if (rgb) document.documentElement.style.setProperty('--custom-accent-rgb', rgb);
    if (darkRgb) document.documentElement.style.setProperty('--custom-accent-dark-rgb', darkRgb);
  }, [customAccent]);

  return (
    <Routes>
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/register" element={<Auth mode="register" />} />
      <Route path="/forgot-password" element={<Auth mode="forgot" />} />
      <Route path="/reset-password/:token" element={<Auth mode="reset" />} />
      <Route path="/reset-hidden-pin/:token" element={<ResetHiddenExpensePin />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/income" element={<Income />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/messages" element={<ScheduledMessages />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}
