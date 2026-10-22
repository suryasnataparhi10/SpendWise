import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadMe, logout, toggleTheme, clearMsg, updateProfile, setColorTheme, setCustomAccent } from '../state/store';

const initials = (name, email) => (name || email || 'U').trim().charAt(0).toUpperCase();
const THEME_ICONS = {
  'midnight-mint': 'flower3',
  'ocean-blue': 'water',
  'warm-ledger': 'journal-bookmark-fill',
  'lavender-graphite': 'stars',
  'sunset-coral': 'sunset-fill',
  monochrome: 'circle-half',
  'sage-sand': 'leaf-fill',
  'berry-night': 'flower1',
  'arctic-frost': 'snow2',
  rosewood: 'flower2',
  'citrus-grove': 'lemon',
  'royal-indigo': 'gem',
  'aurora-glow': 'stars',
  sakura: 'flower1',
  'midnight-orchid': 'moon-stars-fill',
  'coastal-sand': 'water',
  custom: 'palette-fill',
};
const THEME_OPTIONS = [
  { id: 'midnight-mint', name: 'Midnight Mint', colors: ['#79e0c2', '#151f30', '#203c3d'] },
  { id: 'ocean-blue', name: 'Ocean Blue', colors: ['#3484a6', '#fbfeff', '#dceef4'] },
  { id: 'warm-ledger', name: 'Warm Ledger', colors: ['#9a7040', '#fffdf8', '#eee2cb'] },
  { id: 'lavender-graphite', name: 'Lavender Graphite', colors: ['#7867b2', '#fcfbff', '#e5e0f3'] },
  { id: 'sunset-coral', name: 'Sunset Coral', colors: ['#d46f5c', '#fffaf7', '#f8e1d9'] },
  { id: 'monochrome', name: 'Monochrome', colors: ['#525252', '#ffffff', '#e9e9e9'] },
  { id: 'sage-sand', name: 'Sage & Sand', colors: ['#71866b', '#fffdf7', '#e8eadc'] },
  { id: 'berry-night', name: 'Berry Night', colors: ['#a34e83', '#fffaff', '#f0e1ed'] },
  { id: 'arctic-frost', name: 'Arctic Frost', colors: ['#527fa8', '#fbfdff', '#dce9f5'] },
  { id: 'rosewood', name: 'Rosewood', colors: ['#a65970', '#fffafd', '#f2e0e7'] },
  { id: 'citrus-grove', name: 'Citrus Grove', colors: ['#728a3c', '#fffef8', '#e8edcf'] },
  { id: 'royal-indigo', name: 'Royal Indigo', colors: ['#5d5fb0', '#fcfcff', '#e1e2f7'] },
  { id: 'aurora-glow', name: 'Aurora Glow', colors: ['#3c9d96', '#f7fbfa', '#dff3ef'] },
  { id: 'sakura', name: 'Sakura', colors: ['#c7668a', '#fff9fb', '#f8e4eb'] },
  { id: 'midnight-orchid', name: 'Midnight Orchid', colors: ['#a88be0', '#201b2d', '#3c3150'] },
  { id: 'coastal-sand', name: 'Coastal Sand', colors: ['#4c9290', '#fffdf6', '#eee8d8'] },
  { id: 'custom', name: 'Custom', colors: ['#7c6ee8', '#ffffff', '#eeeaff'] },
];

const prepareProfilePhoto = (file) => new Promise((resolve, reject) => {
  if (!file?.type?.startsWith('image/')) return reject(new Error('Choose an image file.'));
  if (file.size > 12 * 1024 * 1024) return reject(new Error('Choose an image smaller than 12 MB.'));
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const size = 420;
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    URL.revokeObjectURL(url);
    resolve(canvas.toDataURL('image/jpeg', 0.78));
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('That image could not be opened.'));
  };
  image.src = url;
});
export default function Layout() {
  const d = useDispatch(),
    { user, token } = useSelector((s) => s.auth),
    theme = useSelector((s) => s.theme),
    colorTheme = useSelector((s) => s.colorTheme),
    customAccent = useSelector((s) => s.customAccent),
    msg = useSelector((s) => s.ui.msg),
    [open, setOpen] = useState(false),
    [themePickerOpen, setThemePickerOpen] = useState(false),
    [customizingTheme, setCustomizingTheme] = useState(false),
    [customAccentDraft, setCustomAccentDraft] = useState(customAccent),
    [globalSearch, setGlobalSearch] = useState(''),
    [profileOpen, setProfileOpen] = useState(false),
    [profileName, setProfileName] = useState(''),
    [profileAvatar, setProfileAvatar] = useState(''),
    [profileError, setProfileError] = useState(''),
    [profileSaved, setProfileSaved] = useState(false),
    [profileSaving, setProfileSaving] = useState(false),
    photoInput = useRef(null),
    navigate = useNavigate();
  const themeOptions = THEME_OPTIONS.map((option) => option.id === 'custom'
    ? { ...option, colors: [customAccent, '#ffffff', `${customAccent}22`] }
    : option);
  const currentTheme = themeOptions.find((option) => option.id === colorTheme);
  useEffect(() => {
    document.documentElement.dataset.bsTheme = theme;
  }, [theme]);
  useEffect(() => {
    if (token) d(loadMe());
  }, [token]);
  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => d(clearMsg()), 3000);
      return () => clearTimeout(t);
    }
  }, [msg]);
  if (!token) return <Navigate to="/login" />;
  const submitSearch = (event) => {
    event.preventDefault();
    const term = globalSearch.trim();
    navigate(term ? `/expenses?search=${encodeURIComponent(term)}` : '/expenses');
    setOpen(false);
  };
  const showProfile = () => {
    setProfileName(user?.name || '');
    setProfileAvatar(user?.avatar || '');
    setProfileError('');
    setProfileSaved(false);
    setProfileOpen(true);
  };
  const chooseProfilePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProfileError('');
    setProfileSaved(false);
    try {
      setProfileAvatar(await prepareProfilePhoto(file));
    } catch (error) {
      setProfileError(error.message || 'Unable to use that image.');
    }
  };
  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    try {
      await d(updateProfile({ name: profileName, avatar: profileAvatar })).unwrap();
      setProfileSaved(true);
    } catch (error) {
      setProfileError(String(error));
    } finally {
      setProfileSaving(false);
    }
  };
  return (
    <div className="app-shell">
      <div className="ambient-scene" aria-hidden="true">
        <span className="ambient-orb ambient-orb-one" />
        <span className="ambient-orb ambient-orb-two" />
        <span className="ambient-orb ambient-orb-three" />
      </div>
      <aside className={'side' + (open ? ' open' : '')}>
        <Link className="brand" to="/dashboard">
          <span className="brand-mark">
            <i className="bi bi-wallet2" />
          </span>
          pocketwise
        </Link>
        <div className="nav-caption">YOUR SPACE</div>
        <NavLink to="/dashboard" onClick={() => setOpen(false)}>
          <i className="bi bi-grid-1x2" />
          Overview
        </NavLink>
        <NavLink to="/expenses" onClick={() => setOpen(false)}>
          <i className="bi bi-receipt" />
          Expenses
        </NavLink>
        <NavLink to="/income" onClick={() => setOpen(false)}>
          <i className="bi bi-cash-stack" />
          Income
        </NavLink>
        <div className="nav-caption nav-caption-spaced">PLAN AHEAD</div>
        <NavLink to="/budgets" onClick={() => setOpen(false)}>
          <i className="bi bi-speedometer2" />
          Budgets
        </NavLink>
        <NavLink to="/reminders" onClick={() => setOpen(false)}>
          <i className="bi bi-calendar2-check" />
          Reminders
        </NavLink>
        <NavLink to="/messages" onClick={() => setOpen(false)}>
          <span className="scheduled-nav-icon" aria-hidden="true">
            <i className="bi bi-send-fill" />
            <i className="bi bi-clock-fill" />
          </span>
          Scheduled messages
        </NavLink>
        <NavLink to="/reports" onClick={() => setOpen(false)}>
          <i className="bi bi-graph-up-arrow" />
          Reports
        </NavLink>
        <div className="side-bottom">
          <button className="side-profile" type="button" onClick={showProfile} aria-label="Open your profile">
            <span className="avatar">
              {user?.avatar ? <img src={user.avatar} alt="" /> : initials(user?.name, user?.email)}
            </span>
            <div className="profile-copy">
              <b>{user?.name || 'Your account'}</b>
              <small>{user?.email}</small>
            </div>
            <i className="bi bi-chevron-right profile-chevron" aria-hidden="true" />
          </button>
          <button className="side-action" onClick={() => d(toggleTheme())}>
            <i className={'bi bi-' + (theme === 'dark' ? 'sun' : 'moon-stars')} />
            {theme === 'dark' ? 'Light appearance' : 'Dark appearance'}
          </button>
          <button className="side-action logout" onClick={() => d(logout())}>
            <i className="bi bi-box-arrow-left" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setOpen(!open)}>
            <i className="bi bi-list" />
          </button>
          <div className="topbar-label">PERSONAL FINANCE</div>
          <form className="global-search" onSubmit={submitSearch} role="search">
            <i className="bi bi-search" aria-hidden="true" />
            <input
              aria-label="Search all expenses"
              placeholder="Search all expenses..."
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
            />
            <button type="submit">Search</button>
          </form>
          <button className="topbar-theme-picker" type="button" onClick={() => setThemePickerOpen(true)} aria-haspopup="dialog" aria-expanded={themePickerOpen} aria-label="Choose color theme">
            <span className="theme-current-swatch" style={{ '--theme-swatch': currentTheme?.colors[0] || 'var(--primary)' }} />
            <i className={`bi bi-${THEME_ICONS[colorTheme] || 'palette2'} theme-choice-icon`} aria-hidden="true" />
            <span className="theme-current-name">{currentTheme?.name || 'Color theme'}</span>
            <i className="bi bi-chevron-down theme-picker-chevron" aria-hidden="true" />
          </button>
          <div className="topbar-date">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </div>
          <button className="topbar-profile" type="button" onClick={showProfile} aria-label="Open your profile">
            {user?.avatar ? <img src={user.avatar} alt="" /> : initials(user?.name, user?.email)}
          </button>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
      {themePickerOpen && createPortal(
        <div className="theme-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setThemePickerOpen(false); setCustomizingTheme(false); } }}>
          <section className="theme-picker-modal" role="dialog" aria-modal="true" aria-labelledby="theme-picker-title">
            <header className="theme-picker-heading">
              <div>
                <span className="eyebrow">MAKE IT YOURS</span>
                <h2 id="theme-picker-title">{customizingTheme ? 'Create your own theme' : 'Choose your color theme'}</h2>
                <p className="muted">{customizingTheme ? 'Pick an accent and we’ll adapt it for light and dark appearance.' : 'Each palette works with both light and dark appearance.'}</p>
              </div>
              {customizingTheme && <button type="button" className="theme-picker-back" onClick={() => setCustomizingTheme(false)}><i className="bi bi-arrow-left" /> Themes</button>}
              <button type="button" className="theme-picker-close" onClick={() => { setThemePickerOpen(false); setCustomizingTheme(false); }} aria-label="Close theme chooser"><i className="bi bi-x-lg" /></button>
            </header>
            {customizingTheme ? (
              <div className="custom-theme-editor">
                <div className="custom-theme-preview" style={{ '--custom-preview-accent': customAccentDraft }}>
                  <span className="custom-preview-circle" />
                  <div className="custom-preview-card">
                    <small>MONTHLY BALANCE</small>
                    <b>₹24,850</b>
                    <span><i /> On track</span>
                  </div>
                  <button type="button" className="custom-preview-action">Add expense</button>
                </div>
                <div className="custom-theme-controls">
                  <label className="custom-accent-control" htmlFor="custom-accent-color">
                    <span><b>Accent color</b><small>Used for buttons, charts, and highlights</small></span>
                    <input id="custom-accent-color" type="color" value={customAccentDraft} onChange={(event) => setCustomAccentDraft(event.target.value)} />
                  </label>
                  <div className="custom-color-presets" aria-label="Suggested accent colors">
                    {['#7c6ee8', '#287f8e', '#43855c', '#d46f5c', '#c34e83', '#bd8b35', '#3d69bc', '#45454a'].map((color) => (
                      <button key={color} type="button" className={customAccentDraft.toLowerCase() === color ? 'active' : ''} style={{ backgroundColor: color }} onClick={() => setCustomAccentDraft(color)} aria-label={`Choose ${color}`} />
                    ))}
                  </div>
                  <p className="muted custom-theme-note"><i className="bi bi-sun" /> Light and dark colors are adjusted automatically to keep the interface readable.</p>
                  <button type="button" className="btn btn-primary custom-theme-apply" onClick={() => { d(setCustomAccent(customAccentDraft)); d(setColorTheme('custom')); setThemePickerOpen(false); setCustomizingTheme(false); }}>Use this custom theme</button>
                </div>
              </div>
            ) : (
              <div className="theme-options-grid">
                {themeOptions.map((option) => (
                  <button key={option.id} type="button" className={`theme-option-card${colorTheme === option.id ? ' selected' : ''}`} onClick={() => {
                    if (option.id === 'custom') {
                      setCustomAccentDraft(customAccent);
                      setCustomizingTheme(true);
                    } else {
                      d(setColorTheme(option.id));
                      setThemePickerOpen(false);
                    }
                  }} aria-pressed={colorTheme === option.id}>
                    <span className="theme-option-preview" style={{ '--preview-accent': option.colors[0], '--preview-surface': option.colors[1], '--preview-soft': option.colors[2] }}>
                      <span className="theme-option-circle" />
                      <span className="theme-option-mini"><i className={`bi bi-${THEME_ICONS[option.id] || 'palette2'}`} /><b /><b /></span>
                    </span>
                    <span className="theme-option-name">{option.name}</span>
                    <span className="theme-option-colors" aria-label="Theme color samples">
                      {option.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                    </span>
                    {colorTheme === option.id && <span className="theme-option-check"><i className="bi bi-check2" /></span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}
      {profileOpen && (
        <div className="modal d-block modal-backdrop-custom profile-backdrop">
          <span className="profile-decoration profile-decoration-bubble bubble-one" aria-hidden="true" />
          <span className="profile-decoration profile-decoration-bubble bubble-two" aria-hidden="true" />
          <span className="profile-decoration profile-decoration-bubble bubble-three" aria-hidden="true" />
          <span className="profile-decoration profile-decoration-bubble bubble-four" aria-hidden="true" />
          <span className="profile-decoration profile-decoration-butterfly butterfly-one" aria-hidden="true">🦋</span>
          <span className="profile-decoration profile-decoration-butterfly butterfly-two" aria-hidden="true">🦋</span>
          <span className="profile-decoration profile-decoration-flower flower-one" aria-hidden="true">🌸</span>
          <span className="profile-decoration profile-decoration-flower flower-two" aria-hidden="true">🌼</span>
          <span className="profile-decoration profile-decoration-sparkle sparkle-one" aria-hidden="true">✦</span>
          <span className="profile-decoration profile-decoration-sparkle sparkle-two" aria-hidden="true">✧</span>
          <div className="modal-dialog modal-dialog-centered profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
            <section className="modal-content profile-modal">
              <div className="profile-cover">
                <button type="button" className="profile-close" onClick={() => setProfileOpen(false)} aria-label="Close profile">
                  <i className="bi bi-x-lg" />
                </button>
                <span className="profile-cover-orb profile-cover-orb-one" />
                <span className="profile-cover-orb profile-cover-orb-two" />
                <div className="profile-portrait-wrap">
                  <div className="profile-portrait">
                    {profileAvatar ? <img src={profileAvatar} alt="Profile preview" /> : initials(profileName, user?.email)}
                  </div>
                  <button className="profile-photo-edit" type="button" onClick={() => photoInput.current?.click()} aria-label="Choose profile photo">
                    <i className="bi bi-camera-fill" />
                  </button>
                </div>
                <input ref={photoInput} className="visually-hidden" type="file" accept="image/*" onChange={chooseProfilePhoto} />
              </div>
              <form onSubmit={saveProfile}>
                <div className="profile-modal-body">
                  <span className="eyebrow">YOUR ACCOUNT</span>
                  <h2 id="profile-title">Your Little Corner</h2>
                  <p className="muted">Update your photo and how your name appears in SpendWise.</p>
                  <label className="form-label" htmlFor="profile-name">Display name</label>
                  <input id="profile-name" className="form-control" value={profileName} onChange={(event) => { setProfileName(event.target.value); setProfileSaved(false); }} maxLength={60} placeholder="Your name" required />
                  <div className="profile-email-row">
                    <span className="profile-email-icon"><i className="bi bi-envelope" /></span>
                    <span><small>Email address</small><b>{user?.email}</b></span>
                    <span className="profile-verified"><i className="bi bi-shield-check" /> Account</span>
                  </div>
                  {profileError && <div className="profile-feedback profile-feedback-error" role="alert">{profileError}</div>}
                  {profileSaved && <div className="profile-feedback profile-feedback-success" role="status"><i className="bi bi-check-circle-fill" /> Your profile is saved.</div>}
                </div>
                <div className="profile-modal-footer">
                  {profileAvatar && <button type="button" className="btn btn-light profile-remove-photo" onClick={() => { setProfileAvatar(''); setProfileSaved(false); }}>Remove photo</button>}
                  <button type="button" className="btn btn-light" onClick={() => setProfileOpen(false)}>Close</button>
                  <button type="submit" className="btn btn-primary" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save profile'}</button>
                </div>
              </form>
            </section>
          </div>
        </div>
      )}
      {open && (
        <button aria-label="Close menu" className="nav-scrim" onClick={() => setOpen(false)} />
      )}
      {msg && <div className="toast show position-fixed bottom-0 end-0 m-3 p-3 shadow">{msg}</div>}
    </div>
  );
}
