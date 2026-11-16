import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDeletedExpenses, purgeExpenses, restoreExpenses } from '../state/store';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { PaymentMethodBadge } from '../components/PaymentMethodSelect';
import { fmtDate, inr } from '../utils';
import Icon from '../theme/Icon';

const plural = (count, word = 'expense') => `${count} ${word}${count === 1 ? '' : 's'}`;

function deletedAgo(value) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return 'Deleted today';
  if (days === 1) return 'Deleted yesterday';
  return `Deleted ${days} days ago`;
}

export default function DeletedExpenses() {
  const dispatch = useDispatch();
  const { data: items, loading } = useSelector((state) => state.deletedExpenses);
  const [selected, setSelected] = useState(new Set());
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const load = () => dispatch(fetchDeletedExpenses());
  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (items || []).filter(
      (expense) => !term || String(expense.item || expense.description || '').toLowerCase().includes(term),
    );
  }, [items, search]);
  // Drop selections that disappeared after a restore, delete or search.
  useEffect(() => {
    const ids = new Set(visible.map((expense) => expense._id));
    setSelected((current) => new Set([...current].filter((id) => ids.has(id))));
  }, [visible]);

  const allSelected = visible.length > 0 && visible.every((expense) => selected.has(expense._id));
  const selectedTotal = visible
    .filter((expense) => selected.has(expense._id))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ask = (action, ids) => {
    const count = ids.length;
    const restore = action === 'restore';
    const amount = inr(
      (items || []).filter((expense) => ids.includes(expense._id)).reduce((sum, e) => sum + Number(e.amount || 0), 0),
    );
    setConfirmation({
      eyebrow: restore ? 'CONFIRM RESTORE' : 'CONFIRM PERMANENT DELETION',
      title: restore ? `Restore ${plural(count)}?` : `Permanently delete ${plural(count)}?`,
      description: restore
        ? `${amount} will go back to your expenses and be counted in that month's spending and balance again.`
        : `${amount} will be erased for good, including any subtypes. This cannot be undone.`,
      confirmLabel: restore ? `Restore ${plural(count)}` : 'Delete permanently',
      tone: restore ? 'primary' : 'danger',
      onConfirm: async () => {
        setBusy(true);
        try {
          await dispatch(restore ? restoreExpenses(ids) : purgeExpenses(ids)).unwrap();
          setSelected(new Set());
          await load();
        } catch {
        } finally {
          setBusy(false);
          setConfirmation(null);
        }
      },
    });
  };
  const selectedIds = [...selected];

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RECOVER OR CLEAN UP</span>
          <h1>Deleted items</h1>
          <p className="muted">
            Deleted expenses wait here. Restore them, or delete them permanently.
          </p>
        </div>
      </div>

      <section className="panel section-panel trash-panel">
        <div className="trash-toolbar">
          <label className="bulk-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={!visible.length}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(visible.map((expense) => expense._id)))
              }
            />
            <span>{selected.size ? `${selected.size} selected · ${inr(selectedTotal)}` : 'Select all'}</span>
          </label>
          <div className="search-wrap trash-search">
            <Icon name="search" />
            <input
              className="form-control"
              placeholder="Search deleted items…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="trash-actions">
            <button
              type="button"
              className="btn btn-light"
              disabled={!selected.size}
              onClick={() => ask('restore', selectedIds)}
            >
              <Icon name="undo" className="me-1" /> Restore
            </button>
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={!selected.size}
              onClick={() => ask('purge', selectedIds)}
            >
              <Icon name="delete" className="me-1" /> Delete permanently
            </button>
          </div>
        </div>

        {loading && !items ? (
          <div className="text-center py-5">
            <div className="spinner-border" />
          </div>
        ) : visible.length ? (
          <ul className="trash-list">
            {visible.map((expense) => (
              <li key={expense._id} className={selected.has(expense._id) ? 'is-selected' : ''}>
                <input
                  type="checkbox"
                  aria-label={`Select ${expense.item}`}
                  checked={selected.has(expense._id)}
                  onChange={() => toggle(expense._id)}
                />
                <div className="trash-main">
                  <b>
                    {expense.isLocked && <Icon name="lock" className="me-1" />}
                    {expense.item || expense.description}
                  </b>
                  <small>
                    {fmtDate(expense.date)} · {deletedAgo(expense.deletedAt)}
                    {expense.subtypes?.length ? ` · ${plural(expense.subtypes.length, 'subtype')}` : ''}
                  </small>
                </div>
                <span className="trash-payment">
                  <PaymentMethodBadge method={expense.paymentMethod} />
                </span>
                <strong className="trash-amount">{inr(expense.amount)}</strong>
                <div className="trash-row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    title="Restore"
                    aria-label={`Restore ${expense.item}`}
                    onClick={() => ask('restore', [expense._id])}
                  >
                    <Icon name="undo" />
                  </button>
                  <button
                    type="button"
                    className="icon-button text-danger"
                    title="Delete permanently"
                    aria-label={`Delete ${expense.item} permanently`}
                    onClick={() => ask('purge', [expense._id])}
                  >
                    <Icon name="delete" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="trash-empty">
            <span>
              <Icon name="delete" />
            </span>
            <b>{search ? 'No deleted items match your search' : 'Nothing here'}</b>
            <p className="muted mb-0">
              {search ? 'Try a different name.' : 'Expenses you delete will appear here.'}
            </p>
          </div>
        )}
      </section>

      <ConfirmDeleteModal
        open={Boolean(confirmation)}
        {...confirmation}
        busy={busy}
        onCancel={() => !busy && setConfirmation(null)}
      />
    </>
  );
}
