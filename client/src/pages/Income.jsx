import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addIncome, fetchIncome, fetchSummary, removeIncome, removeIncomes } from '../state/store';
import { inr, today, fmtDate } from '../utils';
import CalendarInput from '../components/CalendarInput';
import AmountInput from '../components/AmountInput';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

const emptyForm = () => ({ source: '', amount: '', date: today() });

export default function Income() {
  const dispatch = useDispatch();
  const { data: entries, loading } = useSelector((state) => state.income);
  const summary = useSelector((state) => state.dash.data);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIncomeIds, setSelectedIncomeIds] = useState(() => new Set());
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);

  const load = () => {
    const params = { year: month.slice(0, 4), month: Number(month.slice(5)) };
    dispatch(fetchIncome(params));
    dispatch(fetchSummary(params));
  };
  useEffect(() => {
    load();
    setSelectedIncomeIds(new Set());
  }, [month]);

  const total = (entries || []).reduce((sum, entry) => sum + Number(entry.amount), 0);
  const summaryMatchesMonth =
    summary?.month === Number(month.slice(5)) && summary?.year === Number(month.slice(0, 4));
  const openingBalance = summaryMatchesMonth ? Number(summary.openingBalance || 0) : 0;
  const monthExpenses = summaryMatchesMonth ? Number(summary.totalMonthExpense || 0) : 0;
  const availableFunds = openingBalance + total;
  const remaining = availableFunds - monthExpenses;
  const allIncomeSelected =
    Boolean(entries?.length) && entries.every((entry) => selectedIncomeIds.has(entry._id));
  const deleteSelectedIncome = async () => {
    const ids = [...selectedIncomeIds];
    if (!ids.length) return;
    setDeleteConfirmation({
      title: `Delete ${ids.length} selected income entr${ids.length === 1 ? 'y' : 'ies'}?`,
      description: 'This will remove the selected entries from your income history.',
      confirmLabel: 'Delete income',
      onConfirm: async () => {
        try {
          await dispatch(removeIncomes(ids)).unwrap();
          setSelectedIncomeIds(new Set());
          load();
        } catch {}
        setDeleteConfirmation(null);
      },
    });
  };
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await dispatch(addIncome({ ...form, amount: Number(form.amount) })).unwrap();
      setForm(emptyForm());
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
          <span className="eyebrow">MONEY COMING IN</span>
          <h1>Income</h1>
          <p className="muted">Track pay, freelance income, and other money received.</p>
        </div>
      </div>
      <section className="income-balance-strip section-feature-panel" aria-label="Monthly available balance after expenses">
        <div>
          <small>PREVIOUS BALANCE</small>
          <b>{inr(openingBalance)}</b>
        </div>
        <span className="income-plus" aria-hidden="true">+</span>
        <div>
          <small>INCOME THIS MONTH</small>
          <b>{inr(total)}</b>
        </div>
        <span className="income-equals" aria-hidden="true">=</span>
        <div className="income-available">
          <small>AVAILABLE THIS MONTH</small>
          <b>{inr(availableFunds)}</b>
        </div>
        <span className="income-minus" aria-hidden="true">
          −
        </span>
        <div>
          <small>EXPENSES DEDUCTED</small>
          <b>{inr(monthExpenses)}</b>
        </div>
        <span className="income-equals" aria-hidden="true">
          =
        </span>
        <div className="income-remaining">
          <small>REMAINING</small>
          <b>{inr(remaining)}</b>
        </div>
        <p>Last month's remaining balance carries forward. This month's expenses are deducted from the available total.</p>
      </section>
      <div className="finance-columns">
        <section className="panel finance-form-panel section-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NEW ENTRY</span>
              <h4>Add income</h4>
            </div>
          </div>
          <form onSubmit={submit} className="finance-form">
            <label className="form-label">
              Source
              <input
                className="form-control"
                placeholder="Salary, freelance, refund..."
                value={form.source}
                onChange={(event) => setForm({ ...form, source: event.target.value })}
                required
              />
            </label>
            <label className="form-label">
              Amount
              <div className="input-group">
                <span className="input-group-text">₹</span>
                <AmountInput
                  className="form-control"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  required
                />
              </div>
            </label>
            <label className="form-label">
              Date received
              <CalendarInput
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                required
              />
            </label>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save income'}
            </button>
          </form>
        </section>

        <section className="panel finance-list-panel section-panel">
          <div className="finance-list-heading">
            <div>
              <span className="eyebrow">MONTHLY INCOME</span>
              <h4>{inr(total)}</h4>
            </div>
            <CalendarInput
              type="month"
              className="month-filter"
              aria-label="Income month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </div>
          {!!entries?.length && (
            <div className="bulk-toolbar">
              <label className="bulk-select-all">
                <input
                  type="checkbox"
                  checked={allIncomeSelected}
                  onChange={() =>
                    setSelectedIncomeIds(
                      allIncomeSelected ? new Set() : new Set(entries.map((entry) => entry._id)),
                    )
                  }
                />
                Select all
              </label>
              <span>{selectedIncomeIds.size} selected</span>
              <button
                className="bulk-delete-button"
                disabled={!selectedIncomeIds.size}
                onClick={deleteSelectedIncome}
              >
                <i className="bi bi-trash3" /> Delete selected
              </button>
            </div>
          )}
          {loading && !entries ? (
            <div className="text-center py-5">
              <div className="spinner-border" />
            </div>
          ) : entries?.length ? (
            <div className="finance-entry-list">
              {entries.map((entry) => (
                <div className="finance-entry" key={entry._id}>
                  <input
                    className="bulk-row-checkbox"
                    type="checkbox"
                    aria-label={`Select ${entry.source}`}
                    checked={selectedIncomeIds.has(entry._id)}
                    onChange={() =>
                      setSelectedIncomeIds((current) => {
                        const next = new Set(current);
                        if (next.has(entry._id)) next.delete(entry._id);
                        else next.add(entry._id);
                        return next;
                      })
                    }
                  />
                  <span className="finance-entry-icon income-icon">
                    <i className="bi bi-arrow-down-left" />
                  </span>
                  <div className="finance-entry-name">
                    <b>{entry.source}</b>
                    <small>{fmtDate(entry.date)}</small>
                  </div>
                  <strong>{inr(entry.amount)}</strong>
                  <button
                    className="icon-button danger"
                    aria-label="Delete income"
                    onClick={() => setDeleteConfirmation({
                      title: 'Delete this income entry?',
                      description: 'This will remove it from your income history.',
                      confirmLabel: 'Delete income',
                      onConfirm: () =>
                        dispatch(removeIncome(entry._id))
                          .unwrap()
                          .then(() => {
                            setDeleteConfirmation(null);
                            setSelectedIncomeIds((current) => {
                              const next = new Set(current);
                              next.delete(entry._id);
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
              ))}
            </div>
          ) : (
            <div className="finance-empty">
              <i className="bi bi-cash-coin" />
              <p>No income entries for this month yet.</p>
            </div>
          )}
        </section>
      </div>
      <ConfirmDeleteModal
        open={Boolean(deleteConfirmation)}
        {...deleteConfirmation}
        onCancel={() => setDeleteConfirmation(null)}
      />
    </>
  );
}
