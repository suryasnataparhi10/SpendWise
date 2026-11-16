import { useEffect, useRef, useState } from 'react';
import Icon from '../theme/Icon';
import FloatingPanel from './FloatingPanel';
const pad = (number) => String(number).padStart(2, '0');
const months = Array.from({ length: 12 }, (_, month) =>
  new Date(2020, month, 1).toLocaleDateString('en-IN', { month: 'short' }),
);
const parseValue = (value, type) => {
  if (value) {
    const [year, month, day] = value.split('-').map(Number);
    if (year && month) return new Date(year, month - 1, type === 'date' ? day || 1 : 1);
  }
  return new Date();
};

export default function CalendarInput({
  className = '',
  type = 'date',
  value = '',
  onChange,
  ...props
}) {
  const root = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parseValue(value, type));
  const [panel, setPanel] = useState(type === 'month' ? 'months' : 'days');
  useEffect(() => setView(parseValue(value, type)), [value, type]);
  useEffect(() => {
    if (!open) return;
    setPanel(type === 'month' ? 'months' : 'days');
    setView(parseValue(value, type));
  }, [open]);

  const choose = (nextValue) => {
    onChange?.({ target: { value: nextValue } });
    setOpen(false);
  };
  const move = (amount) =>
    setView((current) => {
      if (panel === 'years') return new Date(current.getFullYear() + amount * 12, current.getMonth(), 1);
      if (panel === 'months') return new Date(current.getFullYear() + amount, current.getMonth(), 1);
      return new Date(current.getFullYear(), current.getMonth() + amount, 1);
    });
  const showDate = value
    ? parseValue(value, type).toLocaleDateString('en-IN', {
        weekday: type === 'date' ? 'short' : undefined,
        day: type === 'date' ? 'numeric' : undefined,
        month: type === 'month' ? 'long' : 'short',
        year: 'numeric',
      })
    : '';
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const offset = (new Date(view.getFullYear(), view.getMonth(), 1).getDay() + 6) % 7;
  const chooseMonth = (month) => {
    if (type === 'month') choose(`${view.getFullYear()}-${pad(month + 1)}`);
    else {
      setView(new Date(view.getFullYear(), month, 1));
      setPanel('days');
    }
  };
  const chooseYear = (year) => {
    setView(new Date(year, view.getMonth(), 1));
    setPanel('months');
  };

  return (
    <span className={`calendar-field ${className}`} ref={root}>
      <input
        {...props}
        type="text"
        readOnly
        value={showDate}
        className="form-control calendar-input"
        onClick={() => setOpen(true)}
        onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      />
      <button
        type="button"
        className="calendar-trigger"
        aria-label={`Choose ${type === 'month' ? 'month and year' : 'date'}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="calendar" />
      </button>
      <FloatingPanel
        anchor={root}
        open={open}
        onClose={() => setOpen(false)}
        className="calendar-popover"
        role="dialog"
        aria-label={type === 'month' ? 'Choose a month' : 'Choose a date'}
      >
          <div className="calendar-popover-heading">
            <button type="button" aria-label="Previous" onClick={() => move(-1)}>
              <Icon name="chevronLeft" />
            </button>
            <div>
              {panel === 'days' && (
                <button type="button" onClick={() => setPanel('months')}>
                  {view.toLocaleDateString('en-IN', { month: 'long' })}
                </button>
              )}
              <button type="button" onClick={() => setPanel(panel === 'years' ? 'months' : 'years')}>
                {panel === 'years'
                  ? `${view.getFullYear() - 5} – ${view.getFullYear() + 6}`
                  : view.getFullYear()}
              </button>
            </div>
            <button type="button" aria-label="Next" onClick={() => move(1)}>
              <Icon name="chevronRight" />
            </button>
          </div>
          {panel === 'days' && type === 'date' && (
            <>
              <div className="calendar-weekdays">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>
              <div className="calendar-day-grid">
                {Array.from({ length: offset }, (_, index) => (
                  <span key={`blank-${index}`} />
                ))}
                {Array.from({ length: days }, (_, index) => {
                  const day = index + 1;
                  const selected =
                    value === `${view.getFullYear()}-${pad(view.getMonth() + 1)}-${pad(day)}`;
                  return (
                    <button
                      key={day}
                      type="button"
                      className={selected ? 'selected' : ''}
                      onClick={() =>
                        choose(`${view.getFullYear()}-${pad(view.getMonth() + 1)}-${pad(day)}`)
                      }
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {panel === 'months' && (
            <div className="calendar-month-grid">
              {months.map((month, index) => (
                <button
                  key={month}
                  type="button"
                  className={
                    value === `${view.getFullYear()}-${pad(index + 1)}` ||
                    (type === 'date' &&
                      parseValue(value, type).getFullYear() === view.getFullYear() &&
                      parseValue(value, type).getMonth() === index)
                      ? 'selected'
                      : ''
                  }
                  onClick={() => chooseMonth(index)}
                >
                  {month}
                </button>
              ))}
            </div>
          )}
          {panel === 'years' && (
            <div className="calendar-year-grid">
              {Array.from({ length: 12 }, (_, index) => view.getFullYear() - 5 + index).map(
                (year) => (
                  <button
                    key={year}
                    type="button"
                    className={year === parseValue(value, type).getFullYear() ? 'selected' : ''}
                    onClick={() => chooseYear(year)}
                  >
                    {year}
                  </button>
                ),
              )}
            </div>
          )}
      </FloatingPanel>
    </span>
  );
}
