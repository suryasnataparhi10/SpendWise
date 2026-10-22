import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { resetHiddenExpenseKey } from '../state/store';
import PasswordInput from '../components/PasswordInput';

export default function ResetHiddenExpensePin() {
  const { token } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    setSaving(true);
    try {
      await dispatch(resetHiddenExpenseKey({ token, key: pin })).unwrap();
      navigate(localStorage.getItem('token') ? '/expenses' : '/login', { replace: true });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="reset-pin-page">
      <div className="ambient-scene" aria-hidden="true">
        <span className="ambient-orb ambient-orb-one" />
        <span className="ambient-orb ambient-orb-two" />
        <span className="ambient-orb ambient-orb-three" />
      </div>
      <section className="reset-pin-card">
        <span className="eyebrow">HIDDEN EXPENSES</span>
        <h1>Set a new PIN</h1>
        <p className="muted">Choose a PIN using 4 to 64 letters and numbers.</p>
        <form className="reset-pin-form" onSubmit={submit}>
          <label className="form-label" htmlFor="new-hidden-pin">New PIN</label>
          <PasswordInput
            id="new-hidden-pin"
            className="form-control"
            autoComplete="new-password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            minLength={4}
            maxLength={64}
            pattern="[A-Za-z0-9]{4,64}"
            title="Use 4 to 64 letters or numbers"
            required
          />
          <label className="form-label" htmlFor="confirm-hidden-pin">Confirm new PIN</label>
          <PasswordInput
            id="confirm-hidden-pin"
            className="form-control"
            autoComplete="new-password"
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value)}
            minLength={4}
            maxLength={64}
            pattern="[A-Za-z0-9]{4,64}"
            title="Use 4 to 64 letters or numbers"
            required
          />
          {error && <div className="text-danger small">{error}</div>}
          <button className="btn btn-primary w-100" disabled={saving}>
            {saving ? 'Updating PIN…' : 'Update PIN'}
          </button>
        </form>
        <Link to="/login" className="auth-back-link">Back to SpendWise</Link>
      </section>
    </main>
  );
}
