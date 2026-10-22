import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchExpenses, fetchSummary, removeExpense, removeExpenses, setExpensesLocked,
  getHiddenExpenseKeyStatus, setHiddenExpenseKey, unlockHiddenExpenses, changeHiddenExpenseKey,
  requestHiddenExpenseOtp, fetchBudgets, fetchExpenseInsights,
} from '../state/store';
import ExpenseModal from '../components/ExpenseModal';
import PaymentMethodSelect, { PaymentMethodBadge } from '../components/PaymentMethodSelect';
import { PAY, today, fmtDate, inr } from '../utils';
import CalendarInput from '../components/CalendarInput';
import PasswordInput from '../components/PasswordInput';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

const junkFoodPattern = /\b(burger|pizza|fries|chips|soda|soft drink|cola|fast food|junk food|fried chicken|nuggets|hot dog|donut|doughnut|pastry|candy|chocolate|ice cream|cookies|biscuits|instant noodles|french fries|milkshake)\b/i;
const flexibleCategoryPattern = /food|dining|restaurant|snack|shopping|entertain|subscription|coffee|cafe|takeout|delivery|personal|hobby/i;

export default function Expenses() {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch(),
    { data: list, loading } = useSelector((s) => s.exp),
    [query, setQuery] = useState({
      search: searchParams.get('search') || '',
      paymentMethod: '',
      month: searchParams.get('search') ? '' : today().slice(0, 7),
    }),
    [queryBeforeHidden, setQueryBeforeHidden] = useState(null),
    [modal, setModal] = useState(null),
    [deleteConfirmation, setDeleteConfirmation] = useState(null),
    [expandedSubtypeIds, setExpandedSubtypeIds] = useState(() => new Set()),
    [expandedDays, setExpandedDays] = useState(() => new Set()),
    [selectedExpenseIds, setSelectedExpenseIds] = useState(() => new Set());
  const [showLocked, setShowLocked] = useState(false);
  const [hiddenToken, setHiddenToken] = useState('');
  const [keyDialog, setKeyDialog] = useState(false);
  const [keyMode, setKeyMode] = useState('unlock');
  const [keyInput, setKeyInput] = useState('');
  const [confirmKeyInput, setConfirmKeyInput] = useState('');
  const [currentKeyInput, setCurrentKeyInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSentTo, setOtpSentTo] = useState('');
  const [pendingHiddenAction, setPendingHiddenAction] = useState('view');
  const [keyError, setKeyError] = useState('');
  const budgetMonth = query.month || today().slice(0, 7);
  const budgetYear = Number(budgetMonth.slice(0, 4));
  const budgetMonthNumber = Number(budgetMonth.slice(5, 7));
  const { data: budgets } = useSelector((s) => s.budgets);
  const { data: expenseInsights } = useSelector((s) => s.expenseInsights);
  useEffect(() => {
    dispatch(fetchBudgets({ year: budgetYear }));
    dispatch(fetchExpenseInsights({ month: budgetMonthNumber, year: budgetYear }));
  }, [budgetYear, budgetMonthNumber]);
  const load = () => {
    const { month, ...filters } = query,
      params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    if (showLocked) params.locked = 'true';
    if (month && !filters.search) {
      params.year = month.slice(0, 4);
      params.month = Number(month.slice(5));
    }
    dispatch(fetchExpenses({ params, hiddenToken: showLocked ? hiddenToken : '' }));
  };
  useEffect(() => {
    const search = searchParams.get('search') || '';
    setQuery((current) =>
      current.search === search
        ? current
        : { ...current, search, ...(search ? { month: '' } : {}) },
    );
  }, [searchParams]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [query, showLocked, hiddenToken]);
  useEffect(() => setSelectedExpenseIds(new Set()), [query, showLocked]);
  const setFilter = (key) => (event) => setQuery({ ...query, [key]: event.target.value });
  const openHiddenExpenses = async () => {
    if (showLocked) {
      setShowLocked(false);
      setHiddenToken('');
      if (queryBeforeHidden) setQuery(queryBeforeHidden);
      setQueryBeforeHidden(null);
      return;
    }
    try {
      const result = await dispatch(getHiddenExpenseKeyStatus()).unwrap();
      setPendingHiddenAction('view');
      setKeyMode(result.configured ? 'unlock' : 'set');
      setKeyInput('');
      setConfirmKeyInput('');
      setCurrentKeyInput('');
      setOtpSent(false);
      setOtpSentTo('');
      setKeyError('');
      setKeyDialog(true);
    } catch (error) { setKeyError(String(error)); }
  };
  const enterHiddenView = (token) => {
    setQueryBeforeHidden(query);
    setQuery((current) => ({ ...current, search: '', paymentMethod: '', month: '' }));
    setHiddenToken(token);
    setShowLocked(true);
    setKeyDialog(false);
  };
  const lockSelectedNow = async () => {
    const ids = [...selectedExpenseIds];
    if (!ids.length) return;
    try {
      await dispatch(setExpensesLocked({ ids, isLocked: true })).unwrap();
      setSelectedExpenseIds(new Set());
      load();
      const selected = query.month ? new Date(`${query.month}-01T00:00:00`) : new Date();
      dispatch(fetchSummary({ month: selected.getMonth() + 1, year: selected.getFullYear() }));
    } catch (error) { setKeyError(String(error)); }
  };
  const submitKeyAction = async (event) => {
    event.preventDefault();
    setKeyError('');
    try {
      if (keyMode === 'set') {
        if (keyInput !== confirmKeyInput) throw new Error('PINs do not match');
        await dispatch(setHiddenExpenseKey(keyInput)).unwrap();
        if (pendingHiddenAction === 'hide') {
          setKeyDialog(false);
          await lockSelectedNow();
        } else {
          const result = await dispatch(unlockHiddenExpenses(keyInput)).unwrap();
          enterHiddenView(result.token);
        }
      } else if (keyMode === 'unlock') {
        const result = await dispatch(unlockHiddenExpenses(keyInput)).unwrap();
        enterHiddenView(result.token);
      } else if (keyMode === 'change') {
        if (keyInput !== confirmKeyInput) throw new Error('New PINs do not match');
        await dispatch(changeHiddenExpenseKey({ currentKey: currentKeyInput, newKey: keyInput })).unwrap();
        setKeyMode('unlock');
        setKeyInput('');
        setConfirmKeyInput('');
        setCurrentKeyInput('');
      } else if (!otpSent) {
        const result = await dispatch(requestHiddenExpenseOtp()).unwrap();
        setOtpSentTo(result.sentTo || 'your configured mobile number');
        setOtpSent(true);
      }
    } catch (error) { setKeyError(String(error)); }
  };
  const visible = list || [],
    monthTotal = visible.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const visibleIds = visible.map((expense) => expense._id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedExpenseIds.has(id));
  const deleteSelectedExpenses = async () => {
    const ids = [...selectedExpenseIds];
    if (!ids.length) return;
    setDeleteConfirmation({
      title: `Delete ${ids.length} selected expense${ids.length === 1 ? '' : 's'}?`,
      description: 'This will remove the selected expenses from your expense history.',
      confirmLabel: 'Delete expenses',
      onConfirm: async () => {
        try {
          await dispatch(removeExpenses(ids)).unwrap();
          setSelectedExpenseIds(new Set());
          load();
          const selected = query.month ? new Date(`${query.month}-01T00:00:00`) : new Date();
          dispatch(fetchSummary({ month: selected.getMonth() + 1, year: selected.getFullYear() }));
        } catch {}
        setDeleteConfirmation(null);
      },
    });
  };
  const toggleSelectedLocked = async () => {
    const ids = [...selectedExpenseIds];
    if (!ids.length) return;
    if (!showLocked) {
      try {
        const result = await dispatch(getHiddenExpenseKeyStatus()).unwrap();
        if (!result.configured) {
          setPendingHiddenAction('hide');
          setKeyMode('set');
          setKeyInput('');
          setConfirmKeyInput('');
          setCurrentKeyInput('');
          setOtpSent(false);
          setKeyError('');
          setKeyDialog(true);
          return;
        }
      } catch (error) { setKeyError(String(error)); return; }
    }
    try {
      await dispatch(setExpensesLocked({ ids, isLocked: !showLocked })).unwrap();
      setSelectedExpenseIds(new Set());
      load();
      const selected = query.month ? new Date(`${query.month}-01T00:00:00`) : new Date();
      dispatch(fetchSummary({ month: selected.getMonth() + 1, year: selected.getFullYear() }));
    } catch {}
  };
  const groups = visible.reduce((result, expense) => {
    const day = expense.date.slice(0, 10);
    (result[day] = result[day] || []).push(expense);
    return result;
  }, {});
  const dayKeys = Object.keys(groups);
  const allDaysExpanded = dayKeys.length > 0 && dayKeys.every((day) => expandedDays.has(day));
  const monthName = query.month
    ? new Date(
        Number(query.month.slice(0, 4)),
        Number(query.month.slice(5, 7)) - 1,
      ).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : 'All dates';
  const monthBudget = budgets?.find(
    (entry) => entry.year === budgetYear && entry.month === budgetMonthNumber,
  );
  const budgetSpent = Number(monthBudget?.spent || 0);
  const budgetLimit = Number(monthBudget?.limit || 0);
  const budgetUsed = budgetLimit ? (budgetSpent / budgetLimit) * 100 : 0;
  const budgetOver = budgetLimit > 0 && budgetSpent > budgetLimit;
  const [todayYear, todayMonth, todayDay] = today().split('-').map(Number);
  const currentBudgetMonth = budgetYear === todayYear && budgetMonthNumber === todayMonth;
  const daysInMonth = new Date(budgetYear, budgetMonthNumber, 0).getDate();
  const remainingDays = Math.max(daysInMonth - todayDay + 1, 1);
  const insightSpent = Number(expenseInsights?.total ?? budgetSpent);
  const projectedSpending = currentBudgetMonth
    ? (insightSpent / Math.max(todayDay, 1)) * daysInMonth
    : insightSpent;
  const showBudgetInsight = !showLocked && currentBudgetMonth && budgetLimit > 0 &&
    (insightSpent >= budgetLimit * 0.8 || projectedSpending > budgetLimit);
  const junkFoodSummary = useMemo(() => {
    const items = (expenseInsights?.items || []).filter((item) =>
      junkFoodPattern.test(String(item._id || '')),
    );
    return {
      amount: items.reduce((total, item) => total + Number(item.total || 0), 0),
      count: items.reduce((total, item) => total + Number(item.count || 0), 0),
      topItem: [...items].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0],
    };
  }, [expenseInsights]);
  const flexibleCategory = (expenseInsights?.categories || [])
    .filter((category) => flexibleCategoryPattern.test(String(category._id || '')))
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];
  const spendingSuggestions = [];
  if (flexibleCategory) {
    spendingSuggestions.push({
      title: `Review ${String(flexibleCategory._id).toLowerCase()} spending`,
      detail: `You’ve spent ${inr(flexibleCategory.total)} here. Cutting this category by 15% could free about ${inr(Number(flexibleCategory.total) * 0.15)} this month.`,
    });
  }
  if (junkFoodSummary.count > 0) {
    spendingSuggestions.push({
      title: 'Cut back on junk food',
      detail: `Expense names suggest ${junkFoodSummary.count} purchase${junkFoodSummary.count === 1 ? '' : 's'} totaling ${inr(junkFoodSummary.amount)}${junkFoodSummary.topItem?._id ? `, led by ${junkFoodSummary.topItem._id}` : ''}. Reducing these by 25% could save about ${inr(junkFoodSummary.amount * 0.25)}.`,
    });
  }
  if (!spendingSuggestions.length) {
    const largestCategory = expenseInsights?.categories?.[0];
    spendingSuggestions.push(largestCategory ? {
      title: `Review ${String(largestCategory._id || 'your largest category').toLowerCase()} spending`,
      detail: `This is your highest recorded category at ${inr(largestCategory.total)}. Check whether any purchases can wait until next month.`,
    } : {
      title: 'Review optional purchases',
      detail: 'Check recent purchases and postpone items that are not essential until your budget has more room.',
    });
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR SPENDING HISTORY</span>
          <h1>Expenses</h1>
          <p className="muted">Find, review, and update your items.</p>
        </div>
        <div className="expense-heading-actions">
          <button
            type="button"
            className="btn btn-light hidden-view-toggle"
            aria-label={showLocked ? 'Lock hidden expenses and return to active expenses' : 'Unlock and show hidden expenses'}
            data-tooltip={showLocked ? 'Lock hidden expenses and return to active expenses' : 'Unlock and show hidden expenses'}
            onClick={openHiddenExpenses}
          >
            <i className={`bi ${showLocked ? 'bi-unlock-fill' : 'bi-lock-fill'}`} aria-hidden="true" />
          </button>
          <button className="btn btn-primary add-button" onClick={() => setModal({})}>
            <i className="bi bi-plus-lg" /> Add expense
          </button>
        </div>
      </div>
      <div className="expense-summary-row">
        <section className="month-summary">
          <div>
            <span className="eyebrow">MONTH TOTAL</span>
            <b>{monthName}</b>
            <small>Current search and payment filters applied</small>
          </div>
          <strong>{inr(monthTotal)}</strong>
        </section>
        <section className={`expense-budget-card${budgetOver ? ' is-over' : ''}`}>
          <div className="expense-budget-heading">
            <div>
              <span className="eyebrow">MONTHLY BUDGET</span>
              <b>{new Date(budgetYear, budgetMonthNumber - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
            </div>
            {monthBudget ? (
              <span className={`budget-status ${budgetOver ? 'is-over' : 'is-on-track'}`}>
                {budgetOver ? 'Over budget' : 'On track'}
              </span>
            ) : <Link to="/budgets" className="btn btn-light btn-sm">Set a limit</Link>}
          </div>
          {monthBudget ? (
            <>
              <div className="expense-budget-values">
                <span><small>SPENT</small><b>{inr(budgetSpent)}</b></span>
                <span><small>LIMIT</small><b>{inr(budgetLimit)}</b></span>
                <span><small>{budgetOver ? 'OVER BY' : 'REMAINING'}</small><b>{inr(Math.abs(budgetLimit - budgetSpent))}</b></span>
              </div>
              <div className={`budget-progress${budgetOver ? ' is-over' : ''}`}>
                <span style={{ width: `${Math.min(budgetUsed, 100)}%` }} />
              </div>
            </>
          ) : <p className="muted mb-0">No spending limit set for this month.</p>}
        </section>
      </div>
      {showBudgetInsight && (
        <section className={`budget-insight-panel${projectedSpending > budgetLimit ? ' is-warning' : ''}`}>
          <div className="budget-insight-heading">
            <span className="budget-insight-icon"><i className="bi bi-lightbulb" /></span>
            <div>
              <span className="eyebrow">AUTOMATIC SPENDING SUGGESTIONS</span>
              <h4>{projectedSpending > budgetLimit ? 'Your current pace may exceed your limit' : 'You’re nearing your monthly limit'}</h4>
            </div>
          </div>
          <p className="budget-insight-summary">
            Based on your average daily spending so far, this month is projected to reach {inr(projectedSpending)}.
            {' '}You have {inr(Math.max(0, budgetLimit - insightSpent))} left across {remainingDays} days, or about{' '}
            {inr(Math.max(0, budgetLimit - insightSpent) / remainingDays)} per day.
          </p>
          <div className="budget-suggestions">
            {spendingSuggestions.map((suggestion, index) => <article key={`${suggestion.title}-${index}`}>
              <b>{suggestion.title}</b><span>{suggestion.detail}</span>
            </article>)}
          </div>
          <small className="budget-insight-note">Suggestions use your recorded categories and item names; they are simple estimates, not financial advice.</small>
        </section>
      )}
      <section className="filter-panel">
        <div className="search-wrap">
          <i className="bi bi-search" />
          <input
            className="form-control"
            placeholder="Search items..."
            value={query.search}
            onChange={setFilter('search')}
          />
        </div>
        <CalendarInput
          type="month"
          aria-label="Filter by month"
          className="month-filter"
          value={query.month}
          onChange={setFilter('month')}
        />
        <PaymentMethodSelect
          ariaLabel="Filter by payment method"
          className="payment-filter"
          value={query.paymentMethod || 'All payment methods'}
          options={['All payment methods', ...PAY]}
          onChange={(paymentMethod) =>
            setQuery({ ...query, paymentMethod: paymentMethod === 'All payment methods' ? '' : paymentMethod })
          }
        />
        {!!visible.length && <>
          <label className="bulk-select-all">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() =>
                setSelectedExpenseIds(allVisibleSelected ? new Set() : new Set(visibleIds))
              }
            />
            Select all visible
          </label>
          <span className="toolbar-selected-count">{selectedExpenseIds.size} selected</span>
          <button className="btn btn-light toolbar-action" disabled={!selectedExpenseIds.size} onClick={toggleSelectedLocked}>
            <i className={`bi ${showLocked ? 'bi-unlock' : 'bi-lock'}`} />{' '}
            {showLocked ? 'Unhide selected' : 'Hide selected'}
          </button>
          <button
            className="bulk-delete-button toolbar-action"
            disabled={!selectedExpenseIds.size}
            onClick={deleteSelectedExpenses}
          >
            <i className="bi bi-trash3" /> Delete selected
          </button>
        </>}
      </section>
      {!!dayKeys.length && (
        <div className="day-group-controls">
          <button
            type="button"
            className="btn btn-light"
            onClick={() => setExpandedDays(allDaysExpanded ? new Set() : new Set(dayKeys))}
          >
            <i className={`bi ${allDaysExpanded ? 'bi-arrows-collapse' : 'bi-arrows-expand'}`} />{' '}
            {allDaysExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border" />
        </div>
      ) : !Object.keys(groups).length ? (
        <div className="panel no-expenses">
          <span className="empty-icon">
            <i className="bi bi-receipt" />
          </span>
          <h4>{showLocked ? 'No hidden expenses' : 'No expenses found'}</h4>
          <p className="muted">
            {showLocked
              ? 'There are no hidden expenses in your account yet.'
              : 'Try another month or add an expense to get started.'}
          </p>
          <button className="btn btn-primary" onClick={() => setModal({})}>
            Add expense
          </button>
        </div>
      ) : (
        <div className="expense-groups">
          {Object.entries(groups).map(([day, items]) => (
            <section className="panel day-group" key={day}>
              <button
                type="button"
                className="day-heading"
                aria-expanded={expandedDays.has(day)}
                aria-controls={`expenses-${day}`}
                onClick={() => setExpandedDays((current) => {
                  const next = new Set(current);
                  if (next.has(day)) next.delete(day);
                  else next.add(day);
                  return next;
                })}
              >
                <span className="day-heading-date">
                  <span className="eyebrow">
                    {new Date(day).toLocaleDateString('en-IN', {
                      weekday: 'long',
                      timeZone: 'UTC',
                    })}
                  </span>
                  <h4>{fmtDate(day)}</h4>
                </span>
                <div className="day-total">
                  <small>DAY TOTAL</small>
                  <b>{inr(items.reduce((sum, expense) => sum + expense.amount, 0))}</b>
                </div>
                <i className={`bi ${expandedDays.has(day) ? 'bi-chevron-up' : 'bi-chevron-down'} day-chevron`} aria-hidden="true" />
              </button>
              {expandedDays.has(day) && <div className="day-list" id={`expenses-${day}`}>
                {items.map((expense) => (
                  <div key={expense._id}>
                    <div className="expense-row">
                      <input
                        className="bulk-row-checkbox"
                        type="checkbox"
                        aria-label={`Select ${expense.item || expense.description}`}
                        checked={selectedExpenseIds.has(expense._id)}
                        onChange={() =>
                          setSelectedExpenseIds((current) => {
                            const next = new Set(current);
                            if (next.has(expense._id)) next.delete(expense._id);
                            else next.add(expense._id);
                            return next;
                          })
                        }
                      />
                      <span className="expense-icon">
                        <i className="bi bi-bag" />
                      </span>
                      <div className="expense-info">
                        <b>{expense.item || expense.description}</b>
                        <small>
                          {expense.category || 'Other'}
                          {expense.isLocked ? ' · Hidden' : ''}
                          {expense.hasSubtypes && expense.subtypes?.length
                            ? ` · ${expense.subtypes.length} subtypes`
                            : null}
                        </small>
                      </div>
                      <div className="expense-payment-column">
                        {!expense.hasSubtypes && <PaymentMethodBadge method={expense.paymentMethod || 'Cash'} />}
                      </div>
                      <b className="expense-amount">{inr(expense.amount)}</b>
                      <div className="expense-tools">
                        <button
                          className="icon-button"
                          aria-label="Edit expense"
                          onClick={() => setModal(expense)}
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="icon-button danger"
                          aria-label="Delete expense"
                          onClick={() => setDeleteConfirmation({
                            title: 'Delete this expense?',
                            description: 'This will remove it from your expense history.',
                            confirmLabel: 'Delete expense',
                            onConfirm: () =>
                              dispatch(removeExpense(expense._id))
                                .unwrap()
                                .then(() => {
                                  setDeleteConfirmation(null);
                                  setSelectedExpenseIds((current) => {
                                    const next = new Set(current);
                                    next.delete(expense._id);
                                    return next;
                                  });
                                  load();
                                })
                                .catch(() => setDeleteConfirmation(null)),
                          })}
                        >
                          <i className="bi bi-trash3" />
                        </button>
                      </div>
                    </div>
                    {expense.hasSubtypes && expense.subtypes?.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="subtype-accordion-trigger"
                          aria-expanded={expandedSubtypeIds.has(expense._id)}
                          onClick={() =>
                            setExpandedSubtypeIds((current) => {
                              const next = new Set(current);
                              if (next.has(expense._id)) next.delete(expense._id);
                              else next.add(expense._id);
                              return next;
                            })
                          }
                        >
                          <span>
                            {expandedSubtypeIds.has(expense._id)
                              ? 'Hide breakdown'
                              : 'View breakdown'}
                          </span>
                          <span className="subtype-count">{expense.subtypes.length} parts</span>
                          <i
                            className={`bi ${expandedSubtypeIds.has(expense._id) ? 'bi-dash-lg' : 'bi-plus-lg'}`}
                            aria-hidden="true"
                          />
                        </button>
                        {expandedSubtypeIds.has(expense._id) && (
                          <div className="expense-subtypes">
                            {expense.subtypes.map((sub, i) => (
                              <div key={`${expense._id}-${i}`}>
                                <span>{sub.type}</span>
                                <PaymentMethodBadge method={sub.paymentMethod || 'Cash'} />
                                <b>{inr(sub.amount)}</b>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>}
            </section>
          ))}
        </div>
      )}
      {modal && (
        <ExpenseModal
          item={modal}
          history={list || []}
          onClose={() => setModal(null)}
          onSaved={() => {
            load();
            const selected = query.month ? new Date(`${query.month}-01T00:00:00`) : new Date();
            dispatch(
              fetchSummary({ month: selected.getMonth() + 1, year: selected.getFullYear() }),
            );
          }}
        />
      )}
      {keyDialog && (
        <div className="modal d-block modal-backdrop-custom">
          <div className="modal-dialog modal-dialog-centered">
            <form className="modal-content expense-modal" onSubmit={submitKeyAction}>
              <div className="modal-header">
                <div>
                  <span className="eyebrow">HIDDEN EXPENSES</span>
                  <h5>{keyMode === 'set' ? 'Create a PIN' : keyMode === 'unlock' ? 'Enter your PIN' : keyMode === 'change' ? 'Reset PIN' : 'Forgot PIN'}</h5>
                </div>
                <button type="button" className="btn-close" onClick={() => setKeyDialog(false)} />
              </div>
              <div className="modal-body">
                {(keyMode === 'set' || keyMode === 'change') && <p className="muted">Use 4 to 64 letters and numbers.</p>}
                {keyMode === 'unlock' && <p className="muted">Enter your PIN to view hidden expenses.</p>}
                {keyMode === 'forgot' && <p className="muted">{otpSent ? `A one-time reset link is queued for ${otpSentTo}. Open it to choose and confirm a new PIN.` : 'We will email a one-time reset link to your recovery email.'}</p>}
                {keyMode === 'change' && <PasswordInput wrapperClassName="mb-3" autoComplete="current-password" placeholder="Current PIN" value={currentKeyInput} onChange={(e) => setCurrentKeyInput(e.target.value)} required />}
                {keyMode === 'unlock' && <PasswordInput className="form-control" autoComplete="current-password" placeholder="Expense PIN" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} minLength={4} maxLength={64} pattern="[A-Za-z0-9]{4,64}" title="Use 4 to 64 letters or numbers" required />}
                {(keyMode === 'set' || keyMode === 'change') && <>
                  <PasswordInput wrapperClassName="mb-3" autoComplete="new-password" placeholder="New PIN" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} minLength={4} maxLength={64} pattern="[A-Za-z0-9]{4,64}" title="Use 4 to 64 letters or numbers" required />
                  <PasswordInput className="form-control" autoComplete="new-password" placeholder="Confirm new PIN" value={confirmKeyInput} onChange={(e) => setConfirmKeyInput(e.target.value)} minLength={4} maxLength={64} pattern="[A-Za-z0-9]{4,64}" title="Use 4 to 64 letters or numbers" required />
                </>}
                {keyError && <div className="text-danger small mt-2">{keyError}</div>}
              </div>
              <div className="modal-footer justify-content-between">
                {keyMode === 'unlock' ? (
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-link" onClick={() => { setKeyMode('change'); setKeyInput(''); setConfirmKeyInput(''); setCurrentKeyInput(''); setKeyError(''); }}>Reset PIN</button>
                    <button type="button" className="btn btn-link" onClick={() => { setKeyMode('forgot'); setOtpSent(false); setKeyInput(''); setConfirmKeyInput(''); setKeyError(''); }}>Forgot PIN</button>
                  </div>
                ) : <span />}
                <div>
                  <button type="button" className="btn btn-light me-2" onClick={() => setKeyDialog(false)}>Cancel</button>
                  {keyMode === 'forgot' && otpSent ? (
                    <button type="button" className="btn btn-primary" onClick={() => setKeyDialog(false)}>Done</button>
                  ) : (
                    <button className="btn btn-primary">{keyMode === 'set' ? 'Save PIN' : keyMode === 'unlock' ? 'Show hidden expenses' : keyMode === 'change' ? 'Update PIN' : 'Send reset link'}</button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDeleteModal
        open={Boolean(deleteConfirmation)}
        {...deleteConfirmation}
        onCancel={() => setDeleteConfirmation(null)}
      />
    </>
  );
}
