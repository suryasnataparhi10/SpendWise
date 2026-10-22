import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addReminder,
  deleteReminder,
  deleteReminders,
  fetchReminders,
  updateReminder,
} from '../state/store';
import { inr, today } from '../utils';
import CalendarInput from '../components/CalendarInput';
import AmountInput from '../components/AmountInput';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

const emptyReminder = () => ({ title: '', dueDate: today(), amount: '' });

export default function Reminders() {
  const dispatch = useDispatch();
  const { data: reminders, loading } = useSelector((state) => state.reminders);
  const [form, setForm] = useState(emptyReminder());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedReminderIds, setSelectedReminderIds] = useState(() => new Set());
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  useEffect(() => {
    dispatch(fetchReminders());
  }, []);

  const sorted = useMemo(() => {
    const pending = (reminders || []).filter((reminder) => !reminder.completed);
    const completed = (reminders || []).filter((reminder) => reminder.completed);
    return [...pending, ...completed];
  }, [reminders]);
  const allRemindersSelected =
    sorted.length > 0 && sorted.every((reminder) => selectedReminderIds.has(reminder._id));
  const deleteSelectedReminders = async () => {
    const ids = [...selectedReminderIds];
    if (!ids.length) return;
    setDeleteConfirmation({
      title: `Delete ${ids.length} selected reminder${ids.length === 1 ? '' : 's'}?`,
      description: 'This will remove the selected reminders from your reminder list.',
      confirmLabel: 'Delete reminders',
      onConfirm: async () => {
        try {
          await dispatch(deleteReminders(ids)).unwrap();
          setSelectedReminderIds(new Set());
          dispatch(fetchReminders());
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
      await dispatch(
        addReminder({ ...form, amount: form.amount === '' ? undefined : Number(form.amount) }),
      ).unwrap();
      setForm(emptyReminder());
      dispatch(fetchReminders());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  const status = (reminder) => {
    if (reminder.completed) return { label: 'Paid', className: 'reminder-done' };
    const due = reminder.dueDate.slice(0, 10);
    if (due < today()) return { label: 'Overdue', className: 'reminder-overdue' };
    if (due === today()) return { label: 'Due today', className: 'reminder-today' };
    return { label: 'Upcoming', className: 'reminder-upcoming' };
  };

  return (
    <>
      <div className="page-heading section-hero">
        <div>
          <span className="eyebrow">BILLS AND IMPORTANT DATES</span>
          <h1>Reminders</h1>
          <p className="muted">Keep due dates visible and mark payments when they’re done.</p>
        </div>
      </div>
      <div className="finance-columns">
        <section className="panel finance-form-panel section-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NEW REMINDER</span>
              <h4>Add a bill or payment</h4>
            </div>
          </div>
          <form className="finance-form" onSubmit={submit}>
            <label className="form-label">
              Reminder
              <input
                className="form-control"
                placeholder="Rent, electricity, subscription..."
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                required
              />
            </label>
            <label className="form-label">
              Due date
              <CalendarInput
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                required
              />
            </label>
            <label className="form-label">
              Expected amount <span className="muted fw-normal">(optional)</span>
              <div className="input-group">
                <span className="input-group-text">₹</span>
                <AmountInput
                  className="form-control"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </div>
            </label>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save reminder'}
            </button>
          </form>
        </section>

        <section className="panel finance-list-panel section-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR SCHEDULE</span>
              <h4>Upcoming and overdue</h4>
            </div>
          </div>
          {!!sorted.length && (
            <div className="bulk-toolbar">
              <label className="bulk-select-all">
                <input
                  type="checkbox"
                  checked={allRemindersSelected}
                  onChange={() =>
                    setSelectedReminderIds(
                      allRemindersSelected
                        ? new Set()
                        : new Set(sorted.map((reminder) => reminder._id)),
                    )
                  }
                />
                Select all
              </label>
              <span>{selectedReminderIds.size} selected</span>
              <button
                className="bulk-delete-button"
                disabled={!selectedReminderIds.size}
                onClick={deleteSelectedReminders}
              >
                <i className="bi bi-trash3" /> Delete selected
              </button>
            </div>
          )}
          {loading && !reminders ? (
            <div className="text-center py-5">
              <div className="spinner-border" />
            </div>
          ) : sorted.length ? (
            <div className="reminder-list">
              {sorted.map((reminder) => {
                const dueStatus = status(reminder);
                return (
                  <article
                    className={`reminder-card ${reminder.completed ? 'is-complete' : ''}`}
                    key={reminder._id}
                  >
                    <input
                      className="bulk-row-checkbox"
                      type="checkbox"
                      aria-label={`Select ${reminder.title}`}
                      checked={selectedReminderIds.has(reminder._id)}
                      onChange={() =>
                        setSelectedReminderIds((current) => {
                          const next = new Set(current);
                          if (next.has(reminder._id)) next.delete(reminder._id);
                          else next.add(reminder._id);
                          return next;
                        })
                      }
                    />
                    <span className={`reminder-date-icon ${dueStatus.className}`}>
                      <i className="bi bi-calendar-event" />
                    </span>
                    <div className="reminder-copy">
                      <div>
                        <b>{reminder.title}</b>
                        <span className={`reminder-badge ${dueStatus.className}`}>
                          {dueStatus.label}
                        </span>
                      </div>
                      <small>
                        {new Date(reminder.dueDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                        {reminder.amount ? ` · ${inr(reminder.amount)}` : ''}
                      </small>
                    </div>
                    <div className="reminder-actions">
                      <button
                        className={`icon-button ${reminder.completed ? 'reminder-unpay-action' : ''}`}
                        title={reminder.completed ? 'Mark as unpaid' : 'Mark as paid'}
                        aria-label={reminder.completed ? 'Mark as unpaid' : 'Mark as paid'}
                        onClick={() =>
                          dispatch(updateReminder({ id: reminder._id, completed: !reminder.completed }))
                            .unwrap()
                            .then(() => dispatch(fetchReminders()))
                        }
                      >
                        <i className={`bi ${reminder.completed ? 'bi-arrow-counterclockwise' : 'bi-check2-circle'}`} />
                      </button>
                      <button
                        className="icon-button danger"
                        title="Delete reminder"
                        aria-label="Delete reminder"
                        onClick={() => setDeleteConfirmation({
                          title: 'Delete this reminder?',
                          description: 'This will remove it from your reminder list.',
                          confirmLabel: 'Delete reminder',
                          onConfirm: () =>
                            dispatch(deleteReminder(reminder._id))
                              .unwrap()
                              .then(() => {
                                setDeleteConfirmation(null);
                                setSelectedReminderIds((current) => {
                                  const next = new Set(current);
                                  next.delete(reminder._id);
                                  return next;
                                });
                                dispatch(fetchReminders());
                              })
                              .catch(() => setDeleteConfirmation(null)),
                        })}
                      >
                        <i className="bi bi-trash3" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="finance-empty">
              <i className="bi bi-calendar2-check" />
              <p>No reminders yet. Add a due date to keep it on your radar.</p>
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
