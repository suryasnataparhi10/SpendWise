import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './layout/Layout';

// Pages load on demand, so the first visit only downloads the shell and the page being opened.
const Auth = lazy(() => import('./components/Auth'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Income = lazy(() => import('./pages/Income'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Reminders = lazy(() => import('./pages/Reminders'));
const Reports = lazy(() => import('./pages/Reports'));
const Transactions = lazy(() => import('./pages/Transactions'));
const ScheduledMessages = lazy(() => import('./pages/ScheduledMessages'));
const ResetHiddenExpensePin = lazy(() => import('./pages/ResetHiddenExpensePin'));
const DeletedExpenses = lazy(() => import('./pages/DeletedExpenses'));
const PasswordVault = lazy(() => import('./pages/PasswordVault'));
const MigrationCenter = lazy(() => import('./pages/MigrationCenter'));

// Theme application lives in <ThemeProvider> (src/theme), which wraps every route.
export default function App() {
  return (
    <Suspense fallback={null}>
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
          <Route path="/password-vault" element={<PasswordVault />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/messages" element={<ScheduledMessages />} />
          <Route path="/deleted" element={<DeletedExpenses />} />
          <Route path="/admin/migration" element={<MigrationCenter />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Suspense>
  );
}
