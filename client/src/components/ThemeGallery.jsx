import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon, { IconPackContext } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { scopedThemeProps } from '../theme/engine';
import { compileTheme } from '../theme/tokens';
import { DESIGNS, DESIGN_IDS } from '../theme/designs';
import { ICON_PACKS, ICON_STYLE_LABELS } from '../theme/icons';
import { APPEARANCE_OPTIONS, THEMES, resolveTheme } from '../theme/themes';

const ACCENT_PRESETS = [
  '#7c6ee8',
  '#287f8e',
  '#43855c',
  '#d46f5c',
  '#c34e83',
  '#bd8b35',
  '#3d69bc',
  '#45454a',
];
const THUMB_NAV = ['dashboard', 'expenses', 'income', 'reports'];

// A miniature of the whole app (sidebar, header, cards, button, field) drawn with the theme's
// own tokens, layout variants, fonts and icon pack.
export function ThemeThumbnail({ theme, appearance, size = 'card' }) {
  const scoped = useMemo(() => scopedThemeProps(theme, appearance), [theme, appearance]);
  return (
    <IconPackContext.Provider value={theme.icons}>
      <div className={`tp tp--${size}`} {...scoped} aria-hidden="true">
        <div className="tp-side">
          <span className="tp-brand">
            <Icon name="wallet" />
          </span>
          {THUMB_NAV.map((name, index) => (
            <span key={name} className={`tp-nav${index === 0 ? ' active' : ''}`}>
              <Icon name={name} />
              <b />
            </span>
          ))}
        </div>
        <div className="tp-main">
          <div className="tp-header">
            <span className="tp-search">
              <Icon name="search" />
            </span>
            <span className="tp-avatar" />
          </div>
          <div className="tp-body">
            <div className="tp-title">
              <small>Overview</small>
              <strong>Good morning</strong>
            </div>
            <div className="tp-cards">
              <div className="tp-card tp-card-hero">
                <span className="tp-card-icon">
                  <Icon name="wallet" />
                </span>
                <small>Balance</small>
                <strong>₹24,850</strong>
              </div>
              <div className="tp-card">
                <span className="tp-card-icon">
                  <Icon name="incoming" />
                </span>
                <small>Income</small>
                <strong>₹32k</strong>
              </div>
              <div className="tp-card tp-card-chart">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="tp-controls">
              <span className="tp-input">Search…</span>
              <span className="tp-button">
                <Icon name="add" /> Add
              </span>
            </div>
          </div>
        </div>
      </div>
    </IconPackContext.Provider>
  );
}

const Swatches = ({ theme, appearance }) => {
  const { vars } = compileTheme(theme, appearance);
  return (
    <span className="tg-swatches" aria-hidden="true">
      {['--primary', '--accent-2', '--paper', '--ink'].map((name) => (
        <i key={name} style={{ background: vars[name] }} />
      ))}
    </span>
  );
};

const ThemeFacts = ({ theme }) => (
  <ul className="tg-facts">
    <li title="Typography">
      <Icon name="typography" />
      <span>
        {theme.typography.headingFont}
        {theme.typography.bodyFont !== theme.typography.headingFont
          ? ` + ${theme.typography.bodyFont}`
          : ''}
      </span>
    </li>
    <li title="Icon pack">
      <Icon name="layers" />
      <span>
        {ICON_PACKS[theme.icons.library].name} · {ICON_STYLE_LABELS[theme.icons.style]}
      </span>
    </li>
    <li title="Layout">
      <Icon name="layout" />
      <span className="tg-cap">
        {theme.layout.sidebar.variant} sidebar · {theme.components.cards.variant} cards
      </span>
    </li>
  </ul>
);

export default function ThemeGallery({ open, onClose }) {
  const { saved, deviceAppearance, startPreview, save, reset, saving } = useTheme();
  // The chosen preference ('light', 'dark' or 'system'); thumbnails paint the resolved mode.
  const [appearance, setAppearance] = useState(saved.appearance);
  const shownAppearance = appearance === 'system' ? deviceAppearance : appearance;
  const [filter, setFilter] = useState('all');
  const [customizing, setCustomizing] = useState(false);
  const [accent, setAccent] = useState(saved.customAccent);
  const [design, setDesign] = useState(saved.customDesign);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setAppearance(saved.appearance);
    setAccent(saved.customAccent);
    setDesign(saved.customDesign);
    setError('');
    setConfirmReset(false);
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const themes = useMemo(
    () =>
      THEMES.filter((definition) => definition.id !== 'custom').map((definition) =>
        resolveTheme(definition.id),
      ),
    [],
  );
  const visible = filter === 'all' ? themes : themes.filter((theme) => theme.design === filter);
  const customTheme = resolveTheme('custom', { customAccent: accent, customDesign: design });

  if (!open) return null;

  const choice = (themeId) => ({
    themeId,
    appearance,
    customAccent: themeId === 'custom' ? accent : saved.customAccent,
    customDesign: themeId === 'custom' ? design : saved.customDesign,
  });
  const preview = (themeId) => {
    startPreview(choice(themeId));
    onClose();
  };
  const apply = async (themeId) => {
    setError('');
    const result = await save(choice(themeId));
    if (result.ok) onClose();
    else setError(result.error);
  };
  const resetAll = async () => {
    const result = await reset();
    if (result.ok) onClose();
    else setError(result.error);
  };

  return createPortal(
    <div
      className="tg-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="tg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tg-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="tg-head">
          <div>
            <span className="eyebrow">THEME STUDIO</span>
            <h2 id="tg-title">{customizing ? 'Build your own theme' : 'Choose a complete look'}</h2>
            <p className="muted">
              {customizing
                ? 'Pick an accent colour and a design language. Fonts, icons and layout come with the design.'
                : 'Each theme changes typography, icons, layout, components and effects, not just colours.'}
            </p>
          </div>
          <div className="tg-head-actions">
            {customizing && (
              <button
                type="button"
                className="btn btn-light btn-sm"
                onClick={() => setCustomizing(false)}
              >
                <Icon name="arrowLeft" /> All themes
              </button>
            )}
            <button
              type="button"
              className="icon-button tg-close"
              onClick={onClose}
              aria-label="Close theme studio"
            >
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="tg-toolbar">
          {!customizing && (
            <div className="tg-filters" role="group" aria-label="Filter by design language">
              <button
                type="button"
                className={filter === 'all' ? 'active' : ''}
                onClick={() => setFilter('all')}
                aria-pressed={filter === 'all'}
              >
                All
              </button>
              {DESIGN_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? 'active' : ''}
                  onClick={() => setFilter(id)}
                  aria-pressed={filter === id}
                >
                  {DESIGNS[id].name}
                </button>
              ))}
            </div>
          )}
          <div className="tg-appearance" role="group" aria-label="Preview appearance">
            {APPEARANCE_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                className={appearance === option.mode ? 'active' : ''}
                onClick={() => setAppearance(option.mode)}
                aria-pressed={appearance === option.mode}
                title={option.mode === 'system' ? 'Follow your device setting' : undefined}
              >
                <Icon name={option.icon} /> {option.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="alert alert-danger tg-error" role="alert">
            {error}
          </p>
        )}

        <div className="tg-scroll">
          {customizing ? (
            <div className="tg-custom">
              <div className="tg-custom-preview">
                <ThemeThumbnail theme={customTheme} appearance={shownAppearance} size="large" />
                <ThemeFacts theme={customTheme} />
              </div>
              <div className="tg-custom-controls">
                <label className="tg-accent" htmlFor="tg-accent">
                  <span>
                    <b>Accent colour</b>
                    <small className="muted">Buttons, charts, highlights and icon gradients</small>
                  </span>
                  <input
                    id="tg-accent"
                    type="color"
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                  />
                </label>
                <div className="tg-presets" aria-label="Suggested accent colours">
                  {ACCENT_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={accent.toLowerCase() === color ? 'active' : ''}
                      style={{ background: color }}
                      onClick={() => setAccent(color)}
                      aria-label={`Use accent ${color}`}
                    />
                  ))}
                </div>
                <span className="eyebrow">DESIGN LANGUAGE</span>
                <div className="tg-designs" role="radiogroup" aria-label="Design language">
                  {DESIGN_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={design === id}
                      className={design === id ? 'active' : ''}
                      onClick={() => setDesign(id)}
                    >
                      <b>{DESIGNS[id].name}</b>
                      <small>{DESIGNS[id].summary}</small>
                    </button>
                  ))}
                </div>
                <div className="tg-actions">
                  <button type="button" className="btn btn-light" onClick={() => preview('custom')}>
                    <Icon name="show" /> Preview
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => apply('custom')}
                    disabled={saving}
                  >
                    <Icon name="check" /> {saving ? 'Saving…' : 'Apply custom theme'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="tg-grid">
              {visible.map((theme) => {
                const current = saved.themeId === theme.id;
                return (
                  <article key={theme.id} className={`tg-card${current ? ' current' : ''}`}>
                    <ThemeThumbnail theme={theme} appearance={shownAppearance} />
                    <div className="tg-card-body">
                      <div className="tg-card-title">
                        <h3>{theme.name}</h3>
                        {current ? (
                          <span className="tg-tag tg-tag-current">
                            <Icon name="check" /> Current
                          </span>
                        ) : (
                          <span className="tg-tag">{theme.designName}</span>
                        )}
                      </div>
                      <p className="muted">{theme.description}</p>
                      <ThemeFacts theme={theme} />
                      <div className="tg-card-foot">
                        <Swatches theme={theme} appearance={shownAppearance} />
                        <div className="tg-card-actions">
                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() => preview(theme.id)}
                            aria-label={`Preview ${theme.name} across the app`}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => apply(theme.id)}
                            disabled={saving || (current && appearance === saved.appearance)}
                            aria-label={`Apply ${theme.name}`}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {filter === 'all' && (
                <button
                  type="button"
                  className={`tg-card tg-card-custom${saved.themeId === 'custom' ? ' current' : ''}`}
                  onClick={() => setCustomizing(true)}
                >
                  <ThemeThumbnail theme={customTheme} appearance={shownAppearance} />
                  <div className="tg-card-body">
                    <div className="tg-card-title">
                      <h3>Create your own</h3>
                      <span className="tg-tag">
                        <Icon name="palette" /> Custom
                      </span>
                    </div>
                    <p className="muted">
                      Your accent colour on any of the {DESIGN_IDS.length} design languages.
                    </p>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="tg-foot">
          <span className="muted">
            Your theme is saved to your account and follows you to every page and device.
          </span>
          {confirmReset ? (
            <span className="tg-reset-confirm" role="group" aria-label="Confirm reset">
              Reset to Midnight Mint (dark)?
              <button
                type="button"
                className="btn btn-light btn-sm"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={resetAll}
                disabled={saving}
              >
                Reset
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-light btn-sm"
              onClick={() => setConfirmReset(true)}
            >
              <Icon name="undo" /> Reset to default
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
