import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBudgets, saveBudget } from '../state/store';
import { inr, today } from '../utils';
import CalendarInput from '../components/CalendarInput';
import AmountInput from '../components/AmountInput';

export default function Budgets() {
  const dispatch = useDispatch();
  const { data: budgets, loading } = useSelector((state) => state.budgets);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [limit, setLimit] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5));

  const load = () => dispatch(fetchBudgets({ year }));
  useEffect(() => {
    load();
  }, [year]);

  const budget = useMemo(
    () => budgets?.find((entry) => entry.year === year && entry.month === monthNumber),
    [budgets, year, monthNumber],
  );
  useEffect(() => {
    setLimit(budget ? String(budget.limit) : '');
  }, [budget]);

  const spent = budget?.spent || 0;
  const remaining = Math.max((Number(limit) || 0) - spent, 0);
  const percentage = Number(limit) > 0 ? Math.min((spent / Number(limit)) * 100, 100) : 0;
  const overBudget = Number(limit) > 0 && spent > Number(limit);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await dispatch(saveBudget({ month: monthNumber, year, limit: Number(limit) })).unwrap();
      load();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-heading section-hero">
        <div>
          <span className="eyebrow">SPENDING PLAN</span>
          <h1>Budgets</h1>
          <p className="muted">Set a monthly limit and see how much is left.</p>
        </div>
      </div>
      <div className="finance-columns">
        <section className="panel finance-form-panel section-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">MONTHLY LIMIT</span>
              <h4>Plan your spending</h4>
            </div>
          </div>
          <form className="finance-form" onSubmit={submit}>
            <label className="form-label">
              Month
              <CalendarInput
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                required
              />
            </label>
            <label className="form-label">
              Spending limit
              <div className="input-group">
                <span className="input-group-text">₹</span>
                <AmountInput
                  className="form-control"
                  placeholder="0.00"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  required
                />
              </div>
            </label>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save monthly budget'}
            </button>
          </form>
        </section>

        <section className="panel budget-status-panel section-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">BUDGET STATUS</span>
              <h4>
                {new Date(year, monthNumber - 1).toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                })}
              </h4>
            </div>
            <span className={`budget-status ${overBudget ? 'is-over' : 'is-on-track'}`}>
              {overBudget ? 'Over budget' : budget ? 'On track' : 'Not set'}
            </span>
          </div>
          {loading && !budgets ? (
            <div className="text-center py-5">
              <div className="spinner-border" />
            </div>
          ) : budget ? (
            <>
              <div className="budget-numbers">
                <div>
                  <small>SPENT</small>
                  <b>{inr(spent)}</b>
                </div>
                <div>
                  <small>MONTHLY LIMIT</small>
                  <b>{inr(limit)}</b>
                </div>
              </div>
              <div className={`budget-progress ${overBudget ? 'is-over' : ''}`}>
                <span style={{ width: `${percentage}%` }} />
              </div>
              <div className="budget-remaining">
                {overBudget ? (
                  <>
                    <b>{inr(spent - Number(limit))} over your limit</b>
                    <span>Review the month's spending to get back on track.</span>
                  </>
                ) : (
                  <>
                    <b>{inr(remaining)} remaining</b>
                    <span>{Math.round(percentage)}% of your monthly budget used</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="finance-empty">
              <i className="bi bi-speedometer2" />
              <p>Set a limit to start tracking this month's budget.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
