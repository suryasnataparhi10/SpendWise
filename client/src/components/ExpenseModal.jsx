import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { saveExpense, saveExpenses } from '../state/store';
import api from '../services/api';
import CalendarInput from './CalendarInput';
import AmountInput from './AmountInput';
import PaymentMethodSelect from './PaymentMethodSelect';
import { PAY, today } from '../utils';

function ExpenseField({ field, label, error, children }) {
  return (
    <div>
      <label className="form-label" htmlFor={field}>
        {label}
      </label>
      {children}
      {error && <div className="text-danger small mt-1">{error}</div>}
    </div>
  );
}
const blankRow = () => ({
  item: '',
  category: '',
  amount: '',
  paymentMethod: 'Cash',
  hasSubtypes: false,
  subtypes: [{ type: '', amount: '', paymentMethod: 'Cash' }],
  expanded: true,
});
export default function ExpenseModal({ item, onClose, onSaved, history = [] }) {
  const dispatch = useDispatch(),
    editing = Boolean(item._id),
    [note, setNote] = useState(''),
    [globalSuggestions, setGlobalSuggestions] = useState({ items: [], subtypes: [] });
  const [groups, setGroups] = useState([
      { date: (item.date || today()).slice(0, 10), rows: [{
        item: item.item ?? item.description ?? '',
        amount: item.amount ?? '',
        paymentMethod: item.paymentMethod || 'Cash',
        category: item.category || '',
        hasSubtypes: Boolean(item.hasSubtypes),
        subtypes: item.subtypes?.length
          ? item.subtypes
          : [{ type: '', amount: '', paymentMethod: 'Cash' }],
        expanded: true,
      }] },
    ]),
    [activeGroup, setActiveGroup] = useState(0),
    [errors, setErrors] = useState({}),
    [saving, setSaving] = useState(false);
  const rows = groups[activeGroup]?.rows || [];
  useEffect(() => {
    api
      .get('/expenses/suggestions')
      .then(setGlobalSuggestions)
      .catch(() => {});
  }, []);
  const update = (index, key, value) =>
    setGroups((old) => old.map((group, groupIndex) => groupIndex === activeGroup
      ? { ...group, rows: group.rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)) }
      : group));
  const updateSubtype = (index, subIndex, key, value) =>
    setGroups((old) => old.map((group, groupIndex) => groupIndex === activeGroup
      ? { ...group, rows: group.rows.map((row, i) => i === index
        ? { ...row, subtypes: row.subtypes.map((sub, j) => j === subIndex ? { ...sub, [key]: value } : sub) }
        : row) }
      : group));
  const knownItems = [
    ...new Set(
      [
        ...globalSuggestions.items,
        ...history.map((entry) => entry.item || entry.description),
      ].filter(Boolean),
    ),
  ];
  const knownSubtypes = [
    ...new Set(
      [
        ...history.flatMap((entry) => (entry.subtypes || []).map((sub) => sub.type)),
        ...globalSuggestions.subtypes,
      ].filter(Boolean),
    ),
  ];
  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    const totalCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
    if (totalCount > 100)
      next.dates = 'You can save up to 100 expenses at a time';
    groups.forEach((group, groupIndex) => {
      if (!group.date) next[`date-${groupIndex}`] = 'Date is required';
      group.rows.forEach((row, i) => {
      const key = `${groupIndex}-${i}`;
      if (!row.item.trim()) next[`item-${key}`] = 'Enter an item';
      if (!row.hasSubtypes && (!Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0))
        next[`amount-${key}`] = 'Enter an amount greater than zero';
      if (row.hasSubtypes) {
        if (!row.subtypes.length) next[`subtypes-${key}`] = 'Add at least one subtype';
        row.subtypes.forEach((sub, j) => {
          if (!sub.type.trim()) next[`subtype-type-${key}-${j}`] = 'Enter a subtype';
          if (!Number.isFinite(Number(sub.amount)) || Number(sub.amount) <= 0)
            next[`subtype-amount-${key}-${j}`] = 'Enter an amount greater than zero';
        });
      }
      });
    });
    setErrors(next);
    const firstInvalidGroup = groups.findIndex((group, groupIndex) => Object.keys(next).some((key) => key.startsWith(`date-${groupIndex}`) || key.includes(`-${groupIndex}-`)));
    if (Object.keys(next).length) {
      if (firstInvalidGroup >= 0) setActiveGroup(firstInvalidGroup);
      return;
    }
    const records = groups.flatMap((group) => group.rows.map((row) => ({
      date: group.date,
      amount: row.hasSubtypes
        ? row.subtypes.reduce((sum, sub) => sum + Number(sub.amount), 0)
        : Number(row.amount),
      item: row.item.trim(),
      description: row.item.trim(),
      category: row.category.trim() || 'Other',
      hasSubtypes: row.hasSubtypes,
      subtypes: row.hasSubtypes
        ? row.subtypes.map((sub) => ({ ...sub, type: sub.type.trim(), amount: Number(sub.amount) }))
        : [],
      paymentMethod: row.paymentMethod,
    })));
    setSaving(true);
    try {
      if (editing)
        await dispatch(saveExpense({ ...records[0], _id: item._id, isLocked: Boolean(item.isLocked) })).unwrap();
      else await dispatch(saveExpenses(records)).unwrap();
      onSaved();
      onClose();
    } catch {
    } finally {
      setSaving(false);
    }
  };
  return createPortal(
    <div className="modal d-block modal-backdrop-custom">
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
        <form className="modal-content expense-modal" onSubmit={submit}>
          <div className="modal-header">
            <div>
              <span className="eyebrow">EXPENSE DETAILS</span>
              <h5>{editing ? 'Edit expense' : 'Add expenses'}</h5>
            </div>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {!editing && <div className="date-batch-selector mb-3">
              <div className="d-flex flex-wrap gap-2 align-items-center">
                {groups.map((group, index) => (
                  <button key={index} type="button" className={`btn ${activeGroup === index ? 'btn-primary' : 'btn-light'}`} onClick={() => setActiveGroup(index)}>
                    {group.date ? new Date(`${group.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : `Date ${index + 1}`}
                    <span className="ms-2 badge text-bg-light">{group.rows.length}</span>
                  </button>
                ))}
                <button type="button" className="btn btn-light" onClick={() => {
                  const nextGroup = { date: today(), rows: [blankRow()] };
                  setGroups((old) => [...old, nextGroup]);
                  setActiveGroup(groups.length);
                }}>
                  <i className="bi bi-plus-lg me-1" /> Add expenses for another date
                </button>
              </div>
            </div>}
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <ExpenseField field={`expense-date-${activeGroup}`} label="Date" error={errors[`date-${activeGroup}`]}>
                  <CalendarInput id={`expense-date-${activeGroup}`} type="date" value={groups[activeGroup]?.date || ''} onChange={(e) => setGroups((old) => old.map((group, index) => index === activeGroup ? { ...group, date: e.target.value } : group))} />
                </ExpenseField>
              </div>
              {!editing && groups.length > 1 && <div className="col-md-6 d-flex align-items-end">
                <button type="button" className="btn btn-light text-danger" onClick={() => {
                  setGroups((old) => old.filter((_, index) => index !== activeGroup));
                  setActiveGroup((index) => Math.max(0, index - 1));
                }}><i className="bi bi-trash3 me-1" /> Remove this date</button>
              </div>}
            </div>
            <div className="batch-title">
              <div>
                <b>{editing ? 'Item' : 'Items'}</b>
                <small>
                  {editing ? 'Update this expense' : 'Add items for this date, then add another date to enter more expenses.'}
                </small>
              </div>
            </div>
            <div className="batch-rows">
              {rows.map((row, index) => (
                <div className="batch-row" key={index}>
                  <div className="batch-number">{String(index + 1).padStart(2, '0')}</div>
                  <div className="batch-item">
                    <ExpenseField
                      field={`expense-item-${index}`}
                      label="Item"
                      error={errors[`item-${activeGroup}-${index}`]}
                    >
                      <input
                        id={`expense-item-${index}`}
                        autoFocus={index === 0}
                        className="form-control"
                        list={`expense-item-suggestions-${index}`}
                        placeholder="What did you spend on?"
                        value={row.item}
                        onChange={(e) => update(index, 'item', e.target.value)}
                      />
                      <datalist id={`expense-item-suggestions-${index}`}>
                        {knownItems.map((suggestion) => (
                          <option key={suggestion} value={suggestion} />
                        ))}
                      </datalist>
                    </ExpenseField>
                  </div>
                  <button
                    type="button"
                    className={`subtype-toggle ${row.hasSubtypes ? 'is-on' : ''}`}
                    aria-pressed={row.hasSubtypes}
                    onClick={() => update(index, 'hasSubtypes', !row.hasSubtypes)}
                  >
                    <span className="subtype-switch" aria-hidden="true">
                      <i />
                    </span>
                    {row.hasSubtypes ? 'Subtype mode' : 'Add subtypes'}
                  </button>
                  {row.hasSubtypes ? (
                    <div className="subtype-panel">
                      <button
                        type="button"
                        className="subtype-heading"
                        onClick={() => update(index, 'expanded', !row.expanded)}
                        aria-expanded={row.expanded}
                      >
                        <span>
                          <b>Subtype breakdown</b>
                          <small>
                            {row.subtypes.length} entries ·{' '}
                            {row.subtypes
                              .reduce((sum, sub) => sum + (Number(sub.amount) || 0), 0)
                              .toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                          </small>
                        </span>
                        <i className={`bi ${row.expanded ? 'bi-dash-lg' : 'bi-plus-lg'}`} />
                      </button>
                      {row.expanded && (
                        <div className="subtype-list">
                          {row.subtypes.map((sub, subIndex) => (
                            <div className="subtype-row" key={subIndex}>
                              <input
                                className="form-control"
                                list={`expense-subtype-suggestions-${index}-${subIndex}`}
                                aria-label="Subtype"
                                placeholder="Subtype (e.g. lunch)"
                                value={sub.type}
                                onChange={(e) =>
                                  updateSubtype(index, subIndex, 'type', e.target.value)
                                }
                              />
                              <datalist id={`expense-subtype-suggestions-${index}-${subIndex}`}>
                                {knownSubtypes.map((suggestion) => (
                                  <option key={suggestion} value={suggestion} />
                                ))}
                              </datalist>
                              <AmountInput
                                className="form-control"
                                aria-label="Subtype amount"
                                placeholder="Amount"
                                value={sub.amount}
                                onChange={(e) =>
                                  updateSubtype(index, subIndex, 'amount', e.target.value)
                                }
                              />
                              <PaymentMethodSelect
                                className="form-select-wrap"
                                ariaLabel="Subtype payment method"
                                value={sub.paymentMethod}
                                options={PAY}
                                onChange={(value) =>
                                  updateSubtype(index, subIndex, 'paymentMethod', value)
                                }
                              />
                              <button
                                type="button"
                                className="batch-remove"
                                aria-label="Remove subtype"
                                onClick={() =>
                                  update(
                                    index,
                                    'subtypes',
                                    row.subtypes.filter((_, j) => j !== subIndex),
                                  )
                                }
                              >
                                <i className="bi bi-x-lg" />
                              </button>
                              {(errors[`subtype-type-${activeGroup}-${index}-${subIndex}`] ||
                                errors[`subtype-amount-${activeGroup}-${index}-${subIndex}`]) && (
                                <small className="text-danger">
                                  {errors[`subtype-type-${activeGroup}-${index}-${subIndex}`] ||
                                    errors[`subtype-amount-${activeGroup}-${index}-${subIndex}`]}
                                </small>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            className="subtype-add"
                            onClick={() =>
                              update(index, 'subtypes', [
                                ...row.subtypes,
                                { type: '', amount: '', paymentMethod: 'Cash' },
                              ])
                            }
                          >
                            <i className="bi bi-plus-lg" /> Add subtype
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="batch-amount">
                        <ExpenseField
                          field={`expense-amount-${index}`}
                          label="Amount"
                          error={errors[`amount-${activeGroup}-${index}`]}
                        >
                          <div className="input-group">
                            <span className="input-group-text">₹</span>
                            <AmountInput
                              id={`expense-amount-${index}`}
                              inputMode="decimal"
                              className="form-control"
                              placeholder="0.00"
                              value={row.amount}
                              onChange={(e) => update(index, 'amount', e.target.value)}
                            />
                          </div>
                        </ExpenseField>
                      </div>
                      <div className="batch-payment">
                        <ExpenseField field={`expense-payment-${index}`} label="Payment method">
                          <PaymentMethodSelect
                            id={`expense-payment-${index}`}
                            ariaLabel="Payment method"
                            value={row.paymentMethod}
                            options={PAY}
                            onChange={(value) => update(index, 'paymentMethod', value)}
                          />
                        </ExpenseField>
                      </div>
                    </>
                  )}
                  {!editing && rows.length > 1 && (
                    <button
                      type="button"
                      className="batch-remove"
                      aria-label="Remove item"
                      onClick={() => setGroups((old) => old.map((group, groupIndex) => groupIndex === activeGroup ? { ...group, rows: group.rows.filter((_, i) => i !== index) } : group))}
                    >
                      <i className="bi bi-x-lg" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {errors.dates && <div className="text-danger small mt-2">{errors.dates}</div>}
            {!editing && (
              <button
                type="button"
                className="add-item-bottom"
                onClick={() => setGroups((old) => old.map((group, groupIndex) => groupIndex === activeGroup ? { ...group, rows: [...group.rows, blankRow()] } : group))}
              >
                <i className="bi bi-plus-circle me-2" />
                Add another item
              </button>
            )}
            <label className="form-label mt-3" htmlFor="expense-note">
              Note <span className="muted fw-normal">· temporary, not saved</span>
            </label>
            <textarea
              id="expense-note"
              className="form-control"
              rows="2"
              placeholder="A reminder for this moment…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="modal-footer">
            <span className="batch-total">
              {groups.reduce((sum, group) => sum + group.rows.length, 0)} {groups.reduce((sum, group) => sum + group.rows.length, 0) === 1 ? 'expense' : 'expenses'} ·{' '}
              {groups.flatMap((group) => group.rows)
                .reduce(
                  (total, row) =>
                    total +
                    (row.hasSubtypes
                      ? row.subtypes.reduce((sum, sub) => sum + (Number(sub.amount) || 0), 0)
                      : Number(row.amount) || 0),
                  0,
                )
                .toLocaleString('en-IN', {
                  style: 'currency',
                  currency: 'INR',
                  minimumFractionDigits: 2,
                })}
            </span>
            <button type="button" className="btn btn-light" onClick={onClose}>
              Cancel
            </button>
            <button disabled={saving} className="btn btn-primary">
              {saving
                ? 'Saving…'
                : editing
                  ? 'Save changes'
                  : `Save ${groups.reduce((sum, group) => sum + group.rows.length, 0)} ${groups.reduce((sum, group) => sum + group.rows.length, 0) === 1 ? 'expense' : 'expenses'}`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
