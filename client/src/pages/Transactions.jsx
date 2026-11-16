import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTransactions } from '../state/store';
import { fmtDate, inr } from '../utils';
import Icon from '../theme/Icon';
const transactionLabels = {
  income: 'Income',
  expense: 'Expense',
  reminder_payment: 'Reminder payment',
};

function monthRange(offset = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() + offset, 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, date.getMonth() + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export default function Transactions() {
  const dispatch = useDispatch();
  const { data: statement, loading } = useSelector((state) => state.transactions);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = () => dispatch(fetchTransactions({ from, to, page, pageSize: 50 }));
    load();
    // Expenses deleted or restored in another tab or window must drop out of the statement too.
    const refreshOnReturn = () => document.visibilityState === 'visible' && load();
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [dispatch, from, to, page]);

  const changeDate = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };
  const setRange = (range) => {
    setFrom(range.from);
    setTo(range.to);
    setPage(1);
  };
  const periodLabel =
    from || to
      ? `${from ? fmtDate(`${from}T00:00:00`) : 'Beginning'} – ${to ? fmtDate(`${to}T00:00:00`) : 'Today'}`
      : 'All time';
  const thisMonth = monthRange();
  const lastMonth = monthRange(-1);
  const isThisMonth = from === thisMonth.from && to === thisMonth.to;
  const isLastMonth = from === lastMonth.from && to === lastMonth.to;
  const summaryCards = [
    {
      label: 'Opening balance',
      amount: statement?.openingBalance,
      icon: 'wallet',
      detail: from ? 'Balance before this period' : 'Starting balance',
      tone: 'opening',
    },
    {
      label: 'Money in',
      amount: statement?.credits,
      icon: 'incoming',
      detail: 'Income received',
      tone: 'credit',
    },
    {
      label: 'Money out',
      amount: statement?.debits,
      icon: 'outgoing',
      detail: 'Expenses and payments',
      tone: 'debit',
    },
    {
      label: 'Closing balance',
      amount: statement?.closingBalance,
      icon: 'bank',
      detail: 'Balance at period end',
      tone: 'closing',
    },
  ];

  return (
    <>
      <div className="page-heading section-hero">
        <div className="transaction-hero-copy">
          <span className="eyebrow">YOUR ACCOUNT ACTIVITY</span>
          <h1>Transactions</h1>
          <p className="muted">Every credit and debit, together in one clear statement.</p>
          <span className="transaction-period-label">
            <Icon name="calendar" />
            {periodLabel}
          </span>
        </div>
        {loading && statement && (
          <span className="transaction-refreshing">
            <span className="spinner-border spinner-border-sm" aria-hidden="true" />
            Updating statement
          </span>
        )}
      </div>

      <div className="row g-3 metric-grid section-metrics">
        {summaryCards.map(({ label, amount, icon, detail, tone }) => (
          <div className="col-6 col-xl-3" key={label}>
            <div
              className={`metric-card section-metric transaction-summary-card transaction-summary-${tone}`}
            >
              <div className="metric-top">
                <span>{label}</span>
                <Icon name={icon} />
              </div>
              <strong>{inr(amount)}</strong>
              <small>{detail}</small>
            </div>
          </div>
        ))}
      </div>

      <section className="panel transaction-panel section-panel">
        <div className="panel-heading transaction-heading">
          <div>
            <span className="eyebrow">ACCOUNT STATEMENT</span>
            <h4>Transaction history</h4>
            <p className="muted mb-0">
              {statement?.total || 0} {statement?.total === 1 ? 'transaction' : 'transactions'} ·
              Newest first
            </p>
          </div>
          <div className="transaction-date-filters">
            <div className="transaction-range-presets" aria-label="Quick date ranges">
              <button
                type="button"
                className={!from && !to ? 'active' : ''}
                onClick={() => setRange({ from: '', to: '' })}
              >
                All time
              </button>
              <button
                type="button"
                className={isThisMonth ? 'active' : ''}
                onClick={() => setRange(thisMonth)}
              >
                This month
              </button>
              <button
                type="button"
                className={isLastMonth ? 'active' : ''}
                onClick={() => setRange(lastMonth)}
              >
                Last month
              </button>
            </div>
            <label>
              <span>From</span>
              <input
                className="form-control"
                type="date"
                value={from}
                max={to || undefined}
                onChange={changeDate(setFrom)}
              />
            </label>
            <label>
              <span>To</span>
              <input
                className="form-control"
                type="date"
                value={to}
                min={from || undefined}
                onChange={changeDate(setTo)}
              />
            </label>
            {(from || to) && (
              <button
                className="btn btn-outline-secondary transaction-clear"
                type="button"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setPage(1);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading && !statement ? (
          <div className="text-center py-5">
            <div className="spinner-border" />
          </div>
        ) : statement?.items.length ? (
          <>
            <div className="table-responsive transaction-table-wrap">
              <table className="table align-middle transaction-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction</th>
                    <th>Type</th>
                    <th className="text-end">Money movement</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.items.map((item) => (
                    <tr
                      key={`${item.type}-${item.id}`}
                      className={`transaction-row transaction-row-${item.type}`}
                    >
                      <td className="transaction-date-cell">
                        <b>
                          {new Date(item.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            timeZone: 'UTC',
                          })}
                        </b>
                        <small>
                          {new Date(item.date).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            year: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </small>
                      </td>
                      <td>
                        <div className="transaction-main">
                          <span
                            className={`transaction-icon transaction-icon-${item.credit ? 'income' : 'expense'}`}
                          >
                            <Icon name={item.credit ? 'incoming' : item.type === 'reminder_payment' ? 'reminders' : 'outgoing'} />
                          </span>
                          <div className="transaction-copy">
                            <b className="transaction-description">{item.description}</b>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`transaction-type transaction-type-${item.type}`}>
                          {transactionLabels[item.type] || item.type}
                        </span>
                      </td>
                      <td className="text-end transaction-amount-cell">
                        <div
                          className={`transaction-amount ${item.credit ? 'transaction-credit' : 'transaction-debit'}`}
                        >
                          <span>{item.credit ? 'Money in' : 'Money out'}</span>
                          <b>{item.credit ? `+${inr(item.credit)}` : `−${inr(item.debit)}`}</b>
                        </div>
                        <small className="transaction-balance-hint">
                          <Icon name="subItem" />
                          Balance {inr(item.balance)}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="transaction-pagination">
              <span>
                Showing {(statement.page - 1) * statement.pageSize + 1}–
                {Math.min(statement.page * statement.pageSize, statement.total)} of{' '}
                {statement.total}
              </span>
              <div>
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  disabled={page >= statement.pageCount || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="finance-empty">
            <Icon name="expenses" />
            <p>No transactions found for this period.</p>
          </div>
        )}
      </section>
    </>
  );
}
