import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadMe, logout, clearMsg, updateProfile } from '../state/store';
import Icon from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import ThemePreviewBar from '../components/ThemePreviewBar';
import { APPEARANCE_OPTIONS } from '../theme/themes';
import { migrationApi } from '../services/migrationApi';

// The theme studio is only downloaded the first time someone opens it.
const ThemeGallery = lazy(() => import('../components/ThemeGallery'));

const NEXT_APPEARANCE = { dark: 'light', light: 'system', system: 'dark' };
const initials = (name, email) => (name || email || 'U').trim().charAt(0).toUpperCase();
const NAV_SECTIONS = [
  {
    caption: 'YOUR SPACE',
    links: [
      { to: '/dashboard', icon: 'dashboard', label: 'Overview' },
      { to: '/expenses', icon: 'expenses', label: 'Expenses' },
      { to: '/income', icon: 'income', label: 'Income' },
      { to: '/transactions', icon: 'transactions', label: 'Transactions' },
      { to: '/password-vault', icon: 'vault', label: 'Password vault' },
    ],
  },
  {
    caption: 'PLAN AHEAD',
    links: [
      { to: '/budgets', icon: 'budgets', label: 'Budgets' },
      { to: '/reminders', icon: 'reminders', label: 'Reminders' },
      { to: '/messages', icon: 'messages', label: 'Scheduled messages' },
      { to: '/reports', icon: 'reports', label: 'Reports' },
      { to: '/deleted', icon: 'delete', label: 'Deleted items' },
    ],
  },
];

const ADMIN_SECTION = {
  caption: 'ADMINISTRATION',
  links: [{ to: '/admin/migration', icon: 'database', label: 'Migration center' }],
};

const MAX_PROFILE_PHOTO_BYTES = 400 * 1024;
const prepareProfilePhoto = (file) =>
  new Promise((resolve, reject) => {
    const fileType = file?.type?.toLowerCase();
    const fileExtension = file?.name?.split('.').pop()?.toLowerCase();
    const supportedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    if (
      !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(fileType) &&
      !supportedExtensions.includes(fileExtension)
    ) {
      reject(new Error('Choose a JPG, PNG, or WebP image.'));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error('Choose an image smaller than 12 MB.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = async () => {
      URL.revokeObjectURL(url);
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const reader = new FileReader();
      const encode = (size, quality) =>
        new Promise((resolveBlob) => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const context = canvas.getContext('2d');
          if (!context) {
            resolveBlob(null);
            return;
          }
          context.drawImage(
            image,
            (image.naturalWidth - side) / 2,
            (image.naturalHeight - side) / 2,
            side,
            side,
            0,
            0,
            size,
            size,
          );
          canvas.toBlob(resolveBlob, 'image/jpeg', quality);
        });
      try {
        for (const size of [420, 360, 300]) {
          for (const quality of [0.76, 0.62, 0.5]) {
            const blob = await encode(size, quality);
            if (!blob) throw new Error('This image could not be processed.');
            if (blob.size > MAX_PROFILE_PHOTO_BYTES) continue;
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('This image could not be read.'));
            reader.readAsDataURL(blob);
            return;
          }
        }
        reject(
          new Error(
            'Choose a simpler or smaller photo; profile pictures must be under 400 KB after processing.',
          ),
        );
      } catch (error) {
        reject(error);
      }
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
    msg = useSelector((s) => s.ui.msg),
    { theme, appearance, appearancePreference, save, isPreviewing } = useTheme(),
    [open, setOpen] = useState(false),
    [galleryOpen, setGalleryOpen] = useState(false),
    [globalSearch, setGlobalSearch] = useState(''),
    [profileOpen, setProfileOpen] = useState(false),
    [profileName, setProfileName] = useState(''),
    [profileAvatar, setProfileAvatar] = useState(''),
    [profileError, setProfileError] = useState(''),
    [profileSaved, setProfileSaved] = useState(false),
    [profileSaving, setProfileSaving] = useState(false),
    [profilePhotoProcessing, setProfilePhotoProcessing] = useState(false),
    photoInput = useRef(null),
    location = useLocation(),
    navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (token) d(loadMe());
  }, [token]);
  // The administration section is shown only to accounts the server confirms as administrators.
  useEffect(() => {
    setIsAdmin(false);
    if (!token) return undefined;
    let current = true;
    migrationApi
      .access()
      .then((result) => current && setIsAdmin(Boolean(result?.isAdmin)))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [token]);
  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => d(clearMsg()), 3000);
      return () => clearTimeout(t);
    }
  }, [msg]);
  if (!token) return <Navigate to="/login" />;
  const currentAppearance =
    APPEARANCE_OPTIONS.find((option) => option.mode === appearancePreference) ||
    APPEARANCE_OPTIONS[1];
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
    setProfilePhotoProcessing(true);
    try {
      setProfileAvatar(await prepareProfilePhoto(file));
    } catch (error) {
      setProfileError(error.message || 'Unable to use that image.');
    } finally {
      setProfilePhotoProcessing(false);
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
      <aside className={'side' + (open ? ' open' : '')} aria-label="Main navigation">
        <Link className="brand" to="/dashboard">
          <span className="brand-mark">
            <Icon name="wallet" />
          </span>
          <span className="brand-text">pocketwise</span>
        </Link>
        <nav className="side-nav">
          {(isAdmin ? [...NAV_SECTIONS, ADMIN_SECTION] : NAV_SECTIONS).map((section, index) => [
            <div
              key={section.caption}
              className={'nav-caption' + (index ? ' nav-caption-spaced' : '')}
            >
              {section.caption}
            </div>,
            ...section.links.map((link) => (
              <NavLink key={link.to} to={link.to} onClick={() => setOpen(false)} title={link.label}>
                <Icon name={link.icon} />
                <span className="nav-label">{link.label}</span>
              </NavLink>
            )),
          ])}
        </nav>
        <div className="side-bottom">
          <button
            className="side-profile"
            type="button"
            onClick={showProfile}
            aria-label="Open your profile"
          >
            <span className="avatar">
              {user?.avatar ? <img src={user.avatar} alt="" /> : initials(user?.name, user?.email)}
            </span>
            <div className="profile-copy">
              <b>{user?.name || 'Your account'}</b>
              <small>{user?.email}</small>
            </div>
            <Icon name="chevronRight" className="profile-chevron" />
          </button>
          <button
            className="side-action"
            onClick={() => save({ appearance: NEXT_APPEARANCE[appearancePreference] })}
            disabled={isPreviewing}
            title="Switch between dark, light and your device setting"
          >
            <Icon name={currentAppearance.icon} />
            <span className="nav-label">
              Appearance: {currentAppearance.label}
              {appearancePreference === 'system' ? ` (${appearance})` : ''}
            </span>
          </button>
          <button className="side-action logout" onClick={() => d(logout())}>
            <Icon name="logout" />
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label="Open navigation"
            aria-expanded={open}
          >
            <Icon name="menu" />
          </button>
          <div className="topbar-label">PERSONAL FINANCE</div>
          <form className="global-search" onSubmit={submitSearch} role="search">
            <Icon name="search" />
            <input
              aria-label="Search all expenses"
              placeholder="Search all expenses..."
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
            />
            <button type="submit">Search</button>
          </form>
          <button
            className="topbar-theme-picker"
            type="button"
            onClick={() => setGalleryOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={galleryOpen}
            aria-label={`Theme: ${theme.name}. Open theme studio`}
          >
            <span className="theme-current-swatch">
              <Icon name="palette" />
            </span>
            <span className="theme-current-name">{theme.name}</span>
            <small>{theme.designName}</small>
            <Icon name="chevronDown" />
          </button>
          <div className="topbar-date">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </div>
          <button
            className="topbar-profile"
            type="button"
            onClick={showProfile}
            aria-label="Open your profile"
          >
            {user?.avatar ? <img src={user.avatar} alt="" /> : initials(user?.name, user?.email)}
          </button>
        </header>
        <main className="page-content page-enter" key={location.pathname}>
          <Suspense
            fallback={
              <div className="text-center py-5" role="status" aria-label="Loading page">
                <div className="spinner-border" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      {galleryOpen && (
        <Suspense fallback={null}>
          <ThemeGallery open onClose={() => setGalleryOpen(false)} />
        </Suspense>
      )}
      <ThemePreviewBar onBrowse={() => setGalleryOpen(true)} />
      {profileOpen && (
        <div className="modal d-block modal-backdrop-custom profile-backdrop">
          <span
            className="profile-decoration profile-decoration-bubble bubble-one"
            aria-hidden="true"
          />
          <span
            className="profile-decoration profile-decoration-bubble bubble-two"
            aria-hidden="true"
          />
          <span
            className="profile-decoration profile-decoration-bubble bubble-three"
            aria-hidden="true"
          />
          <span
            className="profile-decoration profile-decoration-bubble bubble-four"
            aria-hidden="true"
          />
          <Icon
            name="sparkle"
            className="profile-decoration profile-decoration-butterfly butterfly-one"
          />
          <Icon
            name="star"
            className="profile-decoration profile-decoration-butterfly butterfly-two"
          />
          <Icon name="flower" className="profile-decoration profile-decoration-flower flower-one" />
          <Icon name="flower" className="profile-decoration profile-decoration-flower flower-two" />
          <Icon
            name="sparkle"
            className="profile-decoration profile-decoration-sparkle sparkle-one"
          />
          <Icon name="star" className="profile-decoration profile-decoration-sparkle sparkle-two" />
          <div
            className="modal-dialog modal-dialog-centered profile-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
          >
            <section className="modal-content profile-modal">
              <div className="profile-cover">
                <button
                  type="button"
                  className="profile-close"
                  onClick={() => setProfileOpen(false)}
                  aria-label="Close profile"
                >
                  <Icon name="close" />
                </button>
                <span className="profile-cover-orb profile-cover-orb-one" />
                <span className="profile-cover-orb profile-cover-orb-two" />
                <div className="profile-portrait-wrap">
                  <div className="profile-portrait">
                    {profileAvatar ? (
                      <img src={profileAvatar} alt="Profile preview" />
                    ) : (
                      initials(profileName, user?.email)
                    )}
                  </div>
                  <button
                    className="profile-photo-edit"
                    type="button"
                    onClick={() => photoInput.current?.click()}
                    disabled={profilePhotoProcessing || profileSaving}
                    aria-label="Choose profile photo"
                  >
                    {profilePhotoProcessing ? (
                      <span className="spinner-border spinner-border-sm" />
                    ) : (
                      <Icon name="camera" />
                    )}
                  </button>
                </div>
                <input
                  ref={photoInput}
                  className="visually-hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={chooseProfilePhoto}
                />
              </div>
              <form onSubmit={saveProfile}>
                <div className="profile-modal-body">
                  <span className="eyebrow">YOUR ACCOUNT</span>
                  <h2 id="profile-title">Your Little Corner</h2>
                  <p className="muted">Update your photo and how your name appears in SpendWise.</p>
                  <label className="form-label" htmlFor="profile-name">
                    Display name
                  </label>
                  <input
                    id="profile-name"
                    className="form-control"
                    value={profileName}
                    onChange={(event) => {
                      setProfileName(event.target.value);
                      setProfileSaved(false);
                    }}
                    maxLength={60}
                    placeholder="Your name"
                    required
                  />
                  <div className="profile-email-row">
                    <span className="profile-email-icon">
                      <Icon name="mail" />
                    </span>
                    <span>
                      <small>Email address</small>
                      <b>{user?.email}</b>
                    </span>
                    <span className="profile-verified">
                      <Icon name="shieldCheck" /> Account
                    </span>
                  </div>
                  {profileError && (
                    <div className="profile-feedback profile-feedback-error" role="alert">
                      {profileError}
                    </div>
                  )}
                  {profilePhotoProcessing && (
                    <div className="profile-feedback" role="status">
                      Preparing your photo…
                    </div>
                  )}
                  {profileSaved && (
                    <div className="profile-feedback profile-feedback-success" role="status">
                      <Icon name="success" /> Your profile is saved.
                    </div>
                  )}
                </div>
                <div className="profile-modal-footer">
                  {profileAvatar && (
                    <button
                      type="button"
                      className="btn btn-light profile-remove-photo"
                      onClick={() => {
                        setProfileAvatar('');
                        setProfileSaved(false);
                      }}
                    >
                      Remove photo
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-light"
                    onClick={() => setProfileOpen(false)}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={profileSaving || profilePhotoProcessing}
                  >
                    {profileSaving ? 'Uploading…' : 'Save profile'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      )}
      {open && (
        <button aria-label="Close menu" className="nav-scrim" onClick={() => setOpen(false)} />
      )}
      {msg && (
        <div className="toast show position-fixed bottom-0 end-0 m-3 p-3" role="status">
          {msg}
        </div>
      )}
    </div>
  );
}
