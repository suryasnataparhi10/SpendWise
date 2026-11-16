import { createContext, useContext } from 'react';
import { ICONS } from './icons';

// The icon pack in effect. ThemeProvider supplies the active theme's pack; gallery thumbnails
// wrap themselves in their own provider so each previews its own pack.
export const IconPackContext = createContext({
  library: 'lucide',
  style: 'outline',
  strokeWidth: 1.75,
});

const PHOSPHOR_WEIGHT = {
  outline: 'regular',
  thin: 'thin',
  light: 'light',
  bold: 'bold',
  fill: 'fill',
  duotone: 'duotone',
  gradient: 'fill',
  sharp: 'regular',
};
const BOOTSTRAP_FILLED = new Set(['fill', 'duotone', 'bold', 'gradient']);

const lucideStroke = (style, width) => {
  if (style === 'thin') return Math.min(width, 1.4);
  if (style === 'light') return Math.min(width, 1.25);
  if (style === 'bold' || style === 'fill') return Math.max(width, 2.3);
  return width;
};

export default function Icon({ name, label, size, spin = false, className = '', style, ...rest }) {
  const pack = useContext(IconPackContext);
  const definition = ICONS[name];
  if (!definition) {
    if (import.meta.env.DEV) console.warn(`[icon] "${name}" is not in the icon registry`);
    return null;
  }
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  const classes = [
    'sw-icon',
    `sw-icon--${pack.library}`,
    `sw-icon--${pack.style}`,
    spin && 'sw-icon--spin',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const sizeStyle = size
    ? { fontSize: typeof size === 'number' ? `${size}px` : `var(--icon-${size})` }
    : null;
  const combinedStyle = sizeStyle || style ? { ...sizeStyle, ...style } : undefined;

  if (pack.library === 'bootstrap') {
    const glyph = BOOTSTRAP_FILLED.has(pack.style)
      ? definition.bootstrapFill
      : definition.bootstrap;
    return <i className={`${classes} bi bi-${glyph}`} style={combinedStyle} {...a11y} {...rest} />;
  }

  const Glyph = pack.library === 'phosphor' ? definition.phosphor : definition.lucide;
  const glyphProps =
    pack.library === 'phosphor'
      ? { weight: PHOSPHOR_WEIGHT[pack.style] || 'regular' }
      : { strokeWidth: lucideStroke(pack.style, pack.strokeWidth ?? 1.75) };
  return (
    <i className={classes} style={combinedStyle} {...a11y} {...rest}>
      <Glyph size="1em" aria-hidden="true" focusable="false" {...glyphProps} />
    </i>
  );
}

// One shared gradient definition referenced by gradient-style icons through CSS.
export function IconGradientDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="sw-icon-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--icon-grad-a)' }} />
          <stop offset="1" style={{ stopColor: 'var(--icon-grad-b)' }} />
        </linearGradient>
      </defs>
    </svg>
  );
}
