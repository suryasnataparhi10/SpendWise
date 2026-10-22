import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Bar } from 'react-chartjs-2';
import { fetchReport } from '../state/store';
import { getThemeAccent, getThemeAccentHover, inr } from '../utils';

export default function Reports() {
  const dispatch = useDispatch();
  const { data: months, loading } = useSelector((state) => state.reports);
  const colorTheme = useSelector((state) => state.colorTheme);
  const appearance = useSelector((state) => state.theme);
  const customAccent = useSelector((state) => state.customAccent);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    dispatch(fetchReport(year));
  }, [year]);

  const totals = useMemo(
    () =>
      (months || []).reduce(
        (result, month) => ({
          income: result.income + month.income,
          expenses: result.expenses + month.expenses,
          net: result.net + month.net,
        }),
        { income: 0, expenses: 0, net: 0 },
      ),
    [months],
  );
  const labels = (months || []).map((month) =>
    new Date(year, month.month - 1).toLocaleDateString('en-IN', { month: 'short' }),
  );
  const chartData = {
    labels,
    datasets: [
      {
        label: 'Income',
        data: (months || []).map((month) => month.income),
        backgroundColor: getThemeAccent(colorTheme, appearance, customAccent),
        borderRadius: 5,
        maxBarThickness: 28,
      },
      {
        label: 'Expenses',
        data: (months || []).map((month) => month.expenses),
        backgroundColor: getThemeAccentHover(colorTheme, appearance, customAccent),
        borderRadius: 5,
        maxBarThickness: 28,
      },
    ],
  };
  const chartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(90,100,90,.1)' },
        ticks: { callback: (value) => `₹${value}` },
      },
    },
  };

  return (
    <>
      <div className="page-heading section-hero">
        <div>
          <span className="eyebrow">YOUR FINANCIAL TRENDS</span>
          <h1>Reports</h1>
          <p className="muted">See how income, spending, and savings change over time.</p>
        </div>
        <select
          className="form-select report-year"
          aria-label="Report year"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index).map(
            (option) => (
              <option key={option}>{option}</option>
            ),
          )}
        </select>
      </div>

      <div className="row g-3 metric-grid section-metrics">
        {[
          ['Income', totals.income, 'bi-arrow-down-left'],
          ['Expenses', totals.expenses, 'bi-arrow-up-right'],
          ['Net savings', totals.net, 'bi-piggy-bank'],
        ].map(([label, amount, icon]) => (
          <div className="col-md-4" key={label}>
            <div className="metric-card report-metric section-metric">
              <div className="metric-top">
                <span>
                  {label} · {year}
                </span>
                <i className={`bi ${icon}`} />
              </div>
              <strong>{inr(amount)}</strong>
              <small>
                {label === 'Net savings'
                  ? 'Income minus expenses'
                  : `Recorded ${label.toLowerCase()} this year`}
              </small>
            </div>
          </div>
        ))}
      </div>

      <section className="panel report-chart-panel section-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">MONTH BY MONTH</span>
            <h4>Income and expenses</h4>
          </div>
          <div className="report-legend">
            <span>
              <i className="income-legend" />
              Income
            </span>
            <span>
              <i className="expense-legend" />
              Expenses
            </span>
          </div>
        </div>
        {loading && !months ? (
          <div className="text-center py-5">
            <div className="spinner-border" />
          </div>
        ) : (
          <div className="report-chart">
            <Bar data={chartData} options={chartOptions} />
          </div>
        )}
      </section>

      <section className="panel report-table-panel section-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">CASH FLOW</span>
            <h4>Monthly breakdown</h4>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-end">Income</th>
                <th className="text-end">Expenses</th>
                <th className="text-end">Net</th>
              </tr>
            </thead>
            <tbody>
              {(months || []).map((month) => (
                <tr key={month.month}>
                  <td>
                    {new Date(year, month.month - 1).toLocaleDateString('en-IN', { month: 'long' })}
                  </td>
                  <td className="text-end">{inr(month.income)}</td>
                  <td className="text-end">{inr(month.expenses)}</td>
                  <td className={`text-end fw-semibold ${month.net < 0 ? 'negative-net' : ''}`}>
                    {inr(month.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
