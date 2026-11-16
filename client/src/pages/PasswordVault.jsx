import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import PasswordInput from '../components/PasswordInput';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import {
  decryptVault,
  deriveVaultKey,
  encryptVault,
  fromBase64,
  toBase64,
} from '../utils/passwordVaultCrypto';
import Icon from '../theme/Icon';
const emptyEntry = () => ({ item: '', username: '', password: '', notes: '' });
const minimumPasswordLength = 12;

function validEntries(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry.id === 'string' &&
        typeof entry.item === 'string' &&
        typeof entry.username === 'string' &&
        typeof entry.password === 'string' &&
        typeof entry.notes === 'string',
    )
  );
}

export default function PasswordVault() {
  const [encryptedVault, setEncryptedVault] = useState(null);
  const [entries, setEntries] = useState(null);
  const [key, setKey] = useState(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [form, setForm] = useState(emptyEntry());
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get('/password-vault')
      .then((vault) => {
        if (active) setEncryptedVault(vault);
      })
      .catch((reason) => {
        if (active) {
          setError(String(reason));
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (entries || []).filter((entry) =>
      [entry.item, entry.username, entry.notes].some((value) =>
        value.toLocaleLowerCase().includes(term),
      ),
    );
  }, [entries, search]);

  const unlock = async (event) => {
    event.preventDefault();
    setError('');
    if (masterPassword.length < minimumPasswordLength) {
      setError(`Use a master password with at least ${minimumPasswordLength} characters.`);
      return;
    }
    if (!encryptedVault && masterPassword !== confirmPassword) {
      setError('Master passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const salt = encryptedVault
        ? fromBase64(encryptedVault.salt)
        : crypto.getRandomValues(new Uint8Array(16));
      const derivedKey = await deriveVaultKey(masterPassword, salt);
      const decryptedEntries = encryptedVault ? await decryptVault(derivedKey, encryptedVault) : [];
      if (!validEntries(decryptedEntries)) throw new Error('Vault data is invalid.');
      if (!encryptedVault) {
        const initial = await encryptVault(derivedKey, decryptedEntries);
        const saved = await api.put('/password-vault', {
          salt: toBase64(salt),
          ...initial,
        });
        setEncryptedVault(saved);
      }
      setEntries(decryptedEntries);
      setKey(derivedKey);
      setMasterPassword('');
      setConfirmPassword('');
      setNotice('');
    } catch {
      setError(
        encryptedVault
          ? 'Could not unlock the vault. Check your master password and try again.'
          : 'Could not create the vault. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveEntries = async (nextEntries) => {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const encrypted = await encryptVault(key, nextEntries);
      const saved = await api.put('/password-vault', {
        salt: encryptedVault.salt,
        ...encrypted,
      });
      setEncryptedVault(saved);
      setEntries(nextEntries);
      setNotice('Vault saved securely.');
      return true;
    } catch (reason) {
      setError(String(reason));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveEntry = async (event) => {
    event.preventDefault();
    const nextEntries = editingId
      ? entries.map((entry) => (entry.id === editingId ? { ...form, id: editingId } : entry))
      : [...entries, { ...form, id: crypto.randomUUID() }];
    if (await saveEntries(nextEntries)) {
      setForm(emptyEntry());
      setEditingId(null);
    }
  };

  const editEntry = (entry) => {
    setForm({
      item: entry.item,
      username: entry.username,
      password: entry.password,
      notes: entry.notes,
    });
    setEditingId(entry.id);
    setError('');
    setNotice('');
  };

  const deleteEntry = async (id) => {
    if (await saveEntries(entries.filter((entry) => entry.id !== id))) {
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyEntry());
      }
      setVisiblePasswords((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const confirmDeleteEntry = (entry) => {
    setDeleteConfirmation({
      title: `Delete the ${entry.item} password?`,
      description: 'This will permanently remove this login from your encrypted vault.',
      confirmLabel: 'Delete password',
      onConfirm: async () => {
        await deleteEntry(entry.id);
        setDeleteConfirmation(null);
      },
    });
  };

  const lock = () => {
    setEntries(null);
    setKey(null);
    setVisiblePasswords(new Set());
    setSearch('');
    setForm(emptyEntry());
    setEditingId(null);
    setNotice('');
    setError('');
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" role="status" aria-label="Loading password vault" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <section className="panel section-panel vault-unlock-panel">
        <span className="eyebrow">PASSWORD VAULT</span>
        <h4>Unable to load your vault</h4>
        <p className="alert alert-danger py-2">{error}</p>
        <button
          type="button"
          className="btn btn-outline-primary"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <>
      <div className="page-heading section-hero">
        <div>
          <span className="eyebrow">PRIVATE CREDENTIALS</span>
          <h1>Password vault</h1>
          <p className="muted">
            Keep the passwords for your bank, Aadhaar, and other accounts easy to find.
          </p>
        </div>
        {entries && (
          <button type="button" className="btn btn-outline-primary" onClick={lock}>
            <Icon name="lock" /> Lock vault
          </button>
        )}
      </div>

      {entries == null ? (
        <section className="panel section-panel vault-unlock-panel">
          <span className="eyebrow">{encryptedVault ? 'VAULT LOCKED' : 'CREATE YOUR VAULT'}</span>
          <h4>{encryptedVault ? 'Unlock your password vault' : 'Choose a master password'}</h4>
          <p className="muted">
            Your entries are encrypted in your browser before they are saved. Use a unique master
            password with at least 12 characters. It is never sent to the server and cannot be
            recovered if forgotten.
          </p>
          <form className="finance-form" onSubmit={unlock}>
            <label className="form-label">
              Master password
              <PasswordInput
                className="form-control"
                autoComplete="off"
                maxLength={1024}
                value={masterPassword}
                onChange={(event) => setMasterPassword(event.target.value)}
                required
              />
            </label>
            {!encryptedVault && (
              <label className="form-label">
                Confirm master password
                <PasswordInput
                  className="form-control"
                  autoComplete="off"
                  maxLength={1024}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </label>
            )}
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? 'Please wait...'
                : encryptedVault
                  ? 'Unlock vault'
                  : 'Create encrypted vault'}
            </button>
          </form>
        </section>
      ) : (
        <div className="vault-columns">
          <section className="panel section-panel vault-form-panel">
            <span className="eyebrow">{editingId ? 'EDIT LOGIN' : 'NEW LOGIN'}</span>
            <h4>{editingId ? 'Update password' : 'Add a password'}</h4>
            <form className="finance-form" onSubmit={saveEntry}>
              <label className="form-label">
                Website or item name
                <input
                  className="form-control"
                  placeholder="Bank, Aadhaar, email..."
                  value={form.item}
                  onChange={(event) => setForm({ ...form, item: event.target.value })}
                  required
                />
              </label>
              <label className="form-label">
                Username or email
                <input
                  className="form-control"
                  autoComplete="username"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                />
              </label>
              <label className="form-label">
                Password
                <PasswordInput
                  className="form-control"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                />
              </label>
              <label className="form-label">
                Notes <span className="muted fw-normal">(optional)</span>
                <textarea
                  className="form-control"
                  rows="3"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </label>
              <div className="d-flex gap-2">
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update password' : 'Save password'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setForm(emptyEntry());
                      setEditingId(null);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="panel section-panel vault-list-panel">
            <div className="vault-list-heading">
              <div>
                <span className="eyebrow">YOUR SAVED LOGINS</span>
                <h4>
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                </h4>
              </div>
              <input
                className="form-control vault-search"
                type="search"
                aria-label="Search password entries"
                placeholder="Search entries..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            {notice && <div className="alert alert-success py-2">{notice}</div>}
            {filteredEntries.length ? (
              <div className="vault-entry-list">
                {filteredEntries.map((entry) => {
                  const visible = visiblePasswords.has(entry.id);
                  return (
                    <article className="vault-entry" key={entry.id}>
                      <div className="vault-entry-heading">
                        <div>
                          <h5>{entry.item}</h5>
                          {entry.username && <small>{entry.username}</small>}
                        </div>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Edit ${entry.item}`}
                          title="Edit entry"
                          disabled={saving}
                          onClick={() => editEntry(entry)}
                        >
                          <Icon name="edit" />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          aria-label={`Delete ${entry.item}`}
                          title="Delete entry"
                          disabled={saving}
                          onClick={() => confirmDeleteEntry(entry)}
                        >
                          <Icon name="delete" />
                        </button>
                      </div>
                      <div className="vault-password">
                        <span>
                          {visible
                            ? entry.password
                            : '•'.repeat(Math.min(entry.password.length, 20))}
                        </span>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={
                            visible ? `Hide ${entry.item} password` : `Show ${entry.item} password`
                          }
                          aria-pressed={visible}
                          onClick={() =>
                            setVisiblePasswords((current) => {
                              const next = new Set(current);
                              if (visible) next.delete(entry.id);
                              else next.add(entry.id);
                              return next;
                            })
                          }
                        >
                          <Icon name={visible ? 'hide' : 'show'} />
                        </button>
                      </div>
                      {entry.notes && <p className="vault-entry-notes">{entry.notes}</p>}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="finance-empty">
                <Icon name="vault" />
                <p>
                  {entries.length
                    ? 'No entries match your search.'
                    : 'Your vault is empty. Add a login to get started.'}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      <ConfirmDeleteModal
        open={Boolean(deleteConfirmation)}
        {...deleteConfirmation}
        onCancel={() => setDeleteConfirmation(null)}
      />
    </>
  );
}
