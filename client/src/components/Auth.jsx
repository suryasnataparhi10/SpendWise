import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { authenticate, requestPasswordReset, resetPassword } from '../state/store';
import PasswordInput from './PasswordInput';
import Icon from '../theme/Icon';
const copy = {
  login: {
    eyebrow: 'WELCOME BACK',
    title: 'Good to see you.',
    description: 'Sign in to pick up where you left off.',
    button: 'Sign in',
  },
  register: {
    eyebrow: 'GET STARTED',
    title: 'Make it yours.',
    description: 'Create an account and get a better view of your spending.',
    button: 'Create account',
  },
  forgot: {
    eyebrow: 'ACCOUNT RECOVERY',
    title: 'Forgot your password?',
    description: 'We’ll email you a link to choose a new password.',
    button: 'Send reset link',
  },
  reset: {
    eyebrow: 'NEW PASSWORD',
    title: 'Set a new password.',
    description: 'Choose a new password for your account.',
    button: 'Update password',
  },
};

function Brand({ light = false }) {
  return (
    <Link className={`brand${light ? ' brand-light' : ''}`} to="/login">
      <span className="brand-mark">
        <Icon name="wallet" />
      </span>
      pocketwise
    </Link>
  );
}

const particles = Array.from({ length: 14 }, (_, index) => index);

function Story() {
  const story = useRef(null);
  const frame = useRef(0);
  // Feed the pointer position to CSS so the illustration layers drift with the cursor.
  const tilt = (event) => {
    const node = story.current;
    if (!node || frame.current) return;
    const { clientX, clientY } = event;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const rect = node.getBoundingClientRect();
      node.style.setProperty('--mx', ((clientX - rect.left) / rect.width - 0.5).toFixed(3));
      node.style.setProperty('--my', ((clientY - rect.top) / rect.height - 0.5).toFixed(3));
    });
  };
  const reset = () => {
    story.current?.style.setProperty('--mx', 0);
    story.current?.style.setProperty('--my', 0);
  };
  return (
    <section className="auth-story" ref={story} onPointerMove={tilt} onPointerLeave={reset}>
      <div className="story-aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="story-particles" aria-hidden="true">
        {particles.map((index) => (
          <i key={index} style={{ '--i': index, '--size': `${3 + ((index * 3) % 5)}px` }} />
        ))}
      </div>
      <Brand light />
      <div className="story-copy">
        <span className="eyebrow">A clearer view of your money</span>
        <h1>
          <span className="story-line">
            <span>Small expenses.</span>
          </span>
          <span className="story-line">
            <em>Big picture.</em>
          </span>
        </h1>
        <p>A calm place to keep track of what you spend, one item at a time.</p>
        <div className="story-stat">
          <span className="story-dot" /> Your spending, made simple
        </div>
      </div>
      <div className="money-scene" aria-hidden="true">
        <div className="scene-orbit orbit-one" />
        <div className="scene-orbit orbit-two" />
        <div className="scene-coin coin-back">₹</div>
        <div className="scene-receipt">
          <div className="receipt-head">
            <Icon name="shoppingHeart" />
            <span>today</span>
          </div>
          <div className="receipt-line wide" />
          <div className="receipt-line" />
          <div className="receipt-line short" />
          <div className="receipt-total">
            <span>total</span>
            <b>₹1,240</b>
          </div>
        </div>
        <div className="scene-mascot">
          <div className="mascot-face">
            <i />
            <i />
            <span />
          </div>
          <div className="mascot-arm" />
          <div className="mascot-leg left" />
          <div className="mascot-leg right" />
        </div>
        <div className="scene-coin coin-front">₹</div>
        <div className="scene-spark spark-one">✦</div>
        <div className="scene-spark spark-two">✧</div>
      </div>
      <div className="story-bottom">Personal finance, with room to breathe.</div>
    </section>
  );
}

export default function Auth({ mode }) {
  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useParams();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(
    location.state?.passwordReset ? 'Password updated. You can now sign in.' : '',
  );
  const details = copy[mode];
  const isRecovery = mode === 'forgot' || mode === 'reset';

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setError('');
  };

  const fail = (message) => {
    setError(message);
    setErrorCount((count) => count + 1);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);

    try {
      if (mode === 'login' || mode === 'register') {
        await dispatch(authenticate({ mode, ...form })).unwrap();
        navigate('/dashboard');
      } else if (mode === 'forgot') {
        const result = await dispatch(requestPasswordReset(form.email)).unwrap();
        setSuccess(result.message);
      } else {
        if (form.password.length < 6) {
          fail('Password must be at least 6 characters.');
          return;
        }
        if (form.password !== form.confirm) {
          fail('The passwords do not match.');
          return;
        }
        await dispatch(resetPassword({ token, password: form.password })).unwrap();
        navigate('/login', { state: { passwordReset: true } });
      }
    } catch (reason) {
      fail(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="ambient-scene" aria-hidden="true">
        <span className="ambient-orb ambient-orb-one" />
        <span className="ambient-orb ambient-orb-two" />
        <span className="ambient-orb ambient-orb-three" />
      </div>
      <Story />
      <section className="auth-form-wrap">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <form
          key={mode}
          className={`auth-form${error ? ' has-error' : ''}`}
          data-shake={errorCount % 2}
          onSubmit={submit}
          aria-busy={busy}
        >
          <span className="eyebrow">{details.eyebrow}</span>
          <h2>{details.title}</h2>
          <p className="muted">{details.description}</p>

          {mode === 'register' && (
            <label>
              Your name
              <input
                className="form-control"
                placeholder="e.g. Alex Morgan"
                value={form.name}
                onChange={update('name')}
                required
              />
            </label>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <label>
              Email address
              <input
                className="form-control"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={update('email')}
                required
              />
            </label>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <label>
              {mode === 'reset' ? 'New password' : 'Password'}
              <PasswordInput
                className="form-control"
                placeholder="At least 6 characters"
                value={form.password}
                onChange={update('password')}
                required
                minLength={6}
              />
            </label>
          )}

          {mode === 'reset' && (
            <label>
              Confirm password
              <PasswordInput
                className="form-control"
                placeholder="Enter your new password again"
                value={form.confirm}
                onChange={update('confirm')}
                required
                minLength={6}
              />
            </label>
          )}

          {mode === 'login' && (
            <div className="forgot-link-row">
              <Link to="/forgot-password">Forgot password?</Link>
            </div>
          )}
          {error && (
            <div key={errorCount} className="alert alert-danger py-2 auth-alert" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="alert alert-success py-2 auth-alert" role="status">
              {success}
            </div>
          )}

          <button className={`btn btn-primary auth-submit${busy ? ' is-busy' : ''}`} disabled={busy}>
            <span className="auth-submit-label">
              {details.button}
              <Icon name="arrowRight" className="ms-2 auth-submit-arrow" />
            </span>
            {busy && <span className="auth-spinner" aria-label="Please wait" />}
          </button>

          <p className="auth-switch">
            {mode === 'login' && (
              <>
                New to pocketwise? <Link to="/register">Create an account</Link>
              </>
            )}
            {mode === 'register' && (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            )}
            {isRecovery && <Link to="/login">Back to sign in</Link>}
          </p>
        </form>
        <div className="auth-foot">Your finances stay personal.</div>
      </section>
    </div>
  );
}
