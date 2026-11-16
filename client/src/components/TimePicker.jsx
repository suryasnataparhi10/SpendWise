import { useRef, useState } from 'react';
import Icon from '../theme/Icon';
import FloatingPanel from './FloatingPanel';
export default function TimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const [rawHour = '09', rawMinute = '00'] = (value || '09:00').split(':');
  const hour24 = Number(rawHour) % 24;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  const update = (nextHour, nextMinute, nextPeriod) => {
    let hour = Number(nextHour) % 12;
    if (nextPeriod === 'PM') hour += 12;
    onChange(`${String(hour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`);
  };

  return (
    <div className="time-picker" ref={root}>
      <button
        type="button"
        className="form-control time-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{String(hour12).padStart(2, '0')}:{rawMinute} <small>{period}</small></span>
        <Icon name="clock" />
      </button>
      <FloatingPanel
        anchor={root}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        className="time-picker-popover"
        role="dialog"
        aria-label="Choose a send time"
      >
          <div className="time-picker-heading">
            <span className="eyebrow">SEND TIME</span>
            <strong>{String(hour12).padStart(2, '0')}:{rawMinute} {period}</strong>
          </div>
          <div className="time-picker-selects">
            <label>Hour
              <select aria-label="Hour" value={hour12} onChange={(event) => update(event.target.value, rawMinute, period)}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}</option>)}
              </select>
            </label>
            <label>Minute
              <select aria-label="Minute" value={rawMinute} onChange={(event) => update(hour12, event.target.value, period)}>
                {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0')).map((minute) => <option key={minute} value={minute}>{minute}</option>)}
              </select>
            </label>
            <label>Period
              <select aria-label="AM or PM" value={period} onChange={(event) => update(hour12, rawMinute, event.target.value)}>
                <option>AM</option><option>PM</option>
              </select>
            </label>
          </div>
          <button type="button" className="btn btn-primary time-picker-done" onClick={() => setOpen(false)}>Done</button>
      </FloatingPanel>
    </div>
  );
}
