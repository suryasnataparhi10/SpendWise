import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';

// Shown while a theme is previewed across the real app.
export default function ThemePreviewBar({ onBrowse }) {
  const {
    isPreviewing,
    theme,
    appearance,
    appearancePreference,
    endPreview,
    save,
    saving,
    preview,
  } = useTheme();
  const [error, setError] = useState('');
  if (!isPreviewing) return null;
  const apply = async () => {
    const result = await save(preview);
    if (!result.ok) setError(result.error);
  };
  return createPortal(
    <div className="tg-preview-bar" role="region" aria-label="Theme preview">
      <span className="tg-preview-dot" />
      <div className="tg-preview-copy">
        <small>PREVIEWING</small>
        <b>
          {theme.name} · {theme.designName} · {appearancePreference === 'system' ? 'Auto, ' : ''}
          {appearance === 'dark' ? 'Dark' : 'Light'}
        </b>
        {error && <span className="text-danger">{error}</span>}
      </div>
      <button type="button" className="btn btn-light btn-sm" onClick={onBrowse}>
        <Icon name="palette" /> Themes
      </button>
      <button type="button" className="btn btn-light btn-sm" onClick={endPreview}>
        Cancel
      </button>
      <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={saving}>
        {saving ? 'Saving…' : 'Apply theme'}
      </button>
    </div>,
    document.body,
  );
}
