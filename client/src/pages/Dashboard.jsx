import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Chart, registerables } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { fetchSummary } from '../state/store';
import ExpenseModal from '../components/ExpenseModal';
import { getChartColors, getThemeAccent, getThemeAccentHover, inr, fmtDate } from '../utils';
Chart.register(...registerables);
export default function Dashboard() {
  const colorTheme = useSelector((state) => state.colorTheme);
  const appearance = useSelector((state) => state.theme);
  const customAccent = useSelector((state) => state.customAccent);
  const d = useDispatch(),
    { data: s, loading } = useSelector((x) => x.dash),
    [p, setP] = useState({ m: new Date().getMonth() + 1, y: new Date().getFullYear() }),
    [modal, setModal] = useState(null);
  const chartColors = getChartColors(colorTheme, customAccent, appearance);
  const load = () => d(fetchSummary({ month: p.m, year: p.y }));
  useEffect(() => {
    load();
  }, [p]);
  const shift = (n) => {
    const t = new Date(p.y, p.m - 1 + n, 1);
    setP({ m: t.getMonth() + 1, y: t.getFullYear() });
  };
  const dim = new Date(p.y, p.m, 0).getDate(),
    map = Object.fromEntries((s?.dailyBreakdown || []).map((x) => [x._id, x.total])),
    items = s?.itemBreakdown || [],
    hd = s?.highestSpendingDay,
    income = s?.totalMonthIncome || 0,
    expense = s?.totalMonthExpense || 0,
    openingBalance = s?.openingBalance || 0,
    availableFunds = s?.availableFunds ?? openingBalance + income,
    balance = s?.remainingBalance ?? income - expense,
    savingsRate = availableFunds ? Math.round((balance / availableFunds) * 100) : 0;
  const cards = [
    ['Income this month', income, 'bi-arrow-down-left'],
    ['Expenses this month', expense, 'bi-arrow-up-right'],
    ['Remaining balance', balance, 'bi-wallet2'],
    ['Savings rate', `${savingsRate}%`, 'bi-piggy-bank'],
  ];
  return (
    <>
      <div className="page-heading dashboard-hero">
        <div>
          <span className="eyebrow">YOUR MONEY, AT A GLANCE</span>
          <h1>Overview</h1>
          <p className="muted">A little clarity goes a long way.</p>
        </div>
        <button className="btn btn-primary add-button" onClick={() => setModal({})}>
          <i className="bi bi-plus-lg" /> Add expense
        </button>
      </div>
      <div className="period-bar dashboard-period">
        <div className="period-label">
          <span className="eyebrow">MONTHLY VIEW</span>
          <h3>
            {new Date(p.y, p.m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
          </h3>
        </div>
        <div className="period-controls">
          <button className="btn btn-light" onClick={() => shift(-1)} aria-label="Previous month">
            <i className="bi bi-chevron-left" />
          </button>
          <button className="btn btn-light" onClick={() => shift(1)} aria-label="Next month">
            <i className="bi bi-chevron-right" />
          </button>
        </div>
      </div>
      {loading && !s ? (
        <div className="text-center py-5">
          <div className="spinner-border" />
        </div>
      ) : (
        <>
          <div className="row g-3 metric-grid dashboard-metrics">
            {cards.map(([t, v, icon], i) => (
              <div className="col-6 col-xl-3" key={t}>
                <div className={'metric-card dashboard-metric metric-' + i}>
                  <div className="metric-top">
                    <span>{t}</span>
                    <i className={'bi ' + icon} />
                  </div>
                  <strong>{i === 3 ? v : inr(v)}</strong>
                  <small>
                    {
                      ['Money received this month', 'Money spent this month', 'Carryover + income − expenses', 'Of available funds left'][
                        i
                      ]
                    }
                  </small>
                </div>
              </div>
            ))}
          </div>
          <div className="row g-3 chart-grid dashboard-charts">
            <div className="col-lg-8">
              <section className="panel chart-panel dashboard-panel dashboard-spending-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">DAILY ACTIVITY</span>
                    <h4>Spending through the month</h4>
                  </div>
                  <span className="chart-key">
                    <i />
                    Daily total
                  </span>
                </div>
                <div className="bar-wrap">
                  <Bar
                    data={{
                      labels: Array.from({ length: dim }, (_, i) => i + 1),
                      datasets: [
                        {
                          label: 'â‚¹',
                          data: Array.from(
                            { length: dim },
                            (_, i) =>
                              map[
                                `${p.y}-${String(p.m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                              ] || 0,
                          ),
                          backgroundColor: getThemeAccent(colorTheme, appearance, customAccent),
                          hoverBackgroundColor: getThemeAccentHover(colorTheme, appearance, customAccent),
                          borderRadius: 5,
                          maxBarThickness: 22,
                        },
                      ],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { display: false }, ticks: { maxTicksLimit: 16 } },
                        y: {
                          beginAtZero: true,
                          grid: { color: 'rgba(90,100,90,.1)' },
                          ticks: { callback: (v) => 'â‚¹' + v },
                        },
                      },
                    }}
                  />
                </div>
              </section>
            </div>
            <div className="col-lg-4">
              <section className="panel item-panel dashboard-panel dashboard-item-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">WHERE IT GOES</span>
                    <h4>By item</h4>
                  </div>
                </div>
                {items.length ? (
                  <>
                    <div className="donut-wrap">
                      <Doughnut
                        data={{
                          labels: items.map((c) => c._id),
                          datasets: [
                            {
                              data: items.map((c) => c.total),
                              backgroundColor: chartColors,
                              borderWidth: 3,
                              borderColor: 'var(--panel)',
                              hoverOffset: 5,
                            },
                          ],
                        }}
                        options={{ cutout: '72%', plugins: { legend: { display: false } } }}
                      />
                      <div className="donut-center">
                        <b>{items.length}</b>
                        <span>items</span>
                      </div>
                    </div>
                    <div className="item-legend">
                      {items.slice(0, 5).map((c, i) => (
                        <div key={c._id}>
                          <span>
                            <i style={{ background: chartColors[i % chartColors.length] }} />
                            {c._id}
                          </span>
                          <b>{inr(c.total)}</b>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted empty-inline">Your item breakdown will appear here.</p>
                )}
              </section>
            </div>
          </div>
          <div className="row g-3 lower-grid dashboard-lower">
            <div className="col-lg-8">
              <section className="panel recent-panel dashboard-panel dashboard-recent-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">LATEST ACTIVITY</span>
                    <h4>Recent expenses</h4>
                  </div>
                  <Link className="text-link" to="/expenses">
                    See all <i className="bi bi-arrow-up-right" />
                  </Link>
                </div>
                {s?.recentExpenses.length ? (
                  <div className="table-responsive">
                    <table className="table align-middle">
                      <tbody>
                        {s.recentExpenses.map((e) => (
                          <tr key={e._id}>
                            <td>
                              <span className="expense-icon">
                                <i className="bi bi-bag" />
                              </span>
                            </td>
                            <td>
                              <b>{e.item || e.description}</b>
                              <small>{fmtDate(e.date)}</small>
                            </td>
                            <td className="text-end amount-cell">{inr(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted empty-inline">No expenses yet. Add one to get started.</p>
                )}
              </section>
            </div>
            <div className="col-lg-4">
              <section className="panel top-items dashboard-panel dashboard-top-items">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">THIS MONTH</span>
                    <h4>Top items</h4>
                  </div>
                </div>
                {items.length ? (
                  items.slice(0, 5).map((c, i) => (
                    <div className="top-item" key={c._id}>
                      <span className="top-rank">0{i + 1}</span>
                      <span className="top-name">{c._id}</span>
                      <b>{inr(c.total)}</b>
                    </div>
                  ))
                ) : (
                  <p className="muted empty-inline">Items will show here as you add expenses.</p>
                )}
              </section>
            </div>
          </div>
        </>
      )}
      {modal && (
        <ExpenseModal
          item={modal}
          history={s?.recentExpenses || []}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </>
  );
}
