// The complete theme contract. Every theme resolves to this shape; designs and palettes only
// declare what they change and are deep-merged over these defaults, then validated.
import { FONTS } from './fonts';

const COLOR_KEYS = [
  'ink',
  'muted',
  'paper',
  'panel',
  'line',
  'primary',
  'primaryDark',
  'side',
  'soft',
];

export const BASE_THEME = {
  id: '',
  name: '',
  description: '',
  design: 'signature',
  colors: {
    light: {
      ink: '#202c29',
      muted: '#7c8984',
      paper: '#f5f6f2',
      panel: '#ffffff',
      line: '#e9ede8',
      primary: '#347d72',
      primaryDark: '#28655c',
      side: '#ffffff',
      soft: '#e8f1ed',
      danger: '#c2493f',
      warning: '#b7791f',
      success: '#2f8a5b',
      info: '#3a78b5',
    },
    dark: {
      ink: '#edf3ef',
      muted: '#9eaea6',
      paper: '#18211e',
      panel: '#212d28',
      line: '#34413b',
      primary: '#73b6a7',
      primaryDark: '#589b8c',
      side: '#202b26',
      soft: '#2c4038',
      danger: '#ef8a80',
      warning: '#e6b45c',
      success: '#71c79a',
      info: '#82b4e6',
    },
    chart: [],
  },
  typography: {
    headingFont: 'Manrope',
    bodyFont: 'DM Sans',
    navigationFont: 'DM Sans',
    buttonFont: 'DM Sans',
    tableFont: 'DM Sans',
    labelFont: 'DM Sans',
    numericFont: 'Manrope',
    fontSizes: {
      base: '14px',
      xs: '11px',
      sm: '12.5px',
      md: '15px',
      lg: '18px',
      xl: '22px',
      display: '30px',
    },
    fontWeights: {
      body: 400,
      medium: 500,
      strong: 650,
      heading: 750,
      button: 600,
      nav: 600,
      label: 600,
    },
    lineHeights: { body: 1.5, heading: 1.2, tight: 1.1 },
    letterSpacing: {
      body: '-0.01em',
      heading: '-0.04em',
      button: '0',
      nav: '-0.005em',
      caption: '0.12em',
    },
    textTransform: {
      button: 'none',
      nav: 'none',
      caption: 'uppercase',
      label: 'none',
      tableHeader: 'uppercase',
    },
  },
  icons: {
    library: 'lucide',
    style: 'outline',
    strokeWidth: 1.75,
    size: { sm: '14px', md: '17px', lg: '22px' },
    container: 'soft',
  },
  layout: {
    sidebar: {
      variant: 'solid',
      width: '248px',
      radius: '0px',
      indicator: 'pill',
      itemRadius: '12px',
      inset: '0px',
    },
    header: { variant: 'bar', height: '68px' },
    dashboard: { variant: 'grid' },
    content: { maxWidth: '1360px', padding: '28px' },
    spacing: { density: 'comfortable', gap: '16px' },
  },
  components: {
    buttons: { variant: 'solid', radius: '12px', paddingY: '9px', paddingX: '16px', hover: 'lift' },
    cards: { variant: 'elevated', radius: '18px', padding: '20px', hover: 'lift' },
    forms: { variant: 'outlined', radius: '11px' },
    tables: { variant: 'lined', header: 'tinted' },
    modals: { radius: '20px', backdropBlur: '6px' },
    dropdowns: { radius: '14px' },
    badges: { variant: 'soft', radius: '999px' },
    notifications: { variant: 'solid', radius: '14px' },
    pagination: { radius: '10px' },
    tabs: { variant: 'segmented' },
    tooltips: { radius: '8px' },
  },
  backgrounds: { type: 'solid', pattern: 'none', ambient: true },
  effects: {
    shadows: { strength: 1 },
    blur: { surface: '0px' },
    gradients: { angle: '135deg', accent: false },
    animations: { pageEnter: 'rise', hover: 'lift' },
    transitions: { duration: '180ms', easing: 'cubic-bezier(.2, .7, .3, 1)' },
  },
};

const isLength = (value) =>
  typeof value === 'string' && /^-?[\d.]+(px|rem|em|%|ch|vw)$|^0$/.test(value);
const isColor = (value) =>
  typeof value === 'string' && /^(#[\da-f]{3,8}|rgba?\([^)]+\)|@[a-zA-Z]+)$/i.test(value.trim());
const oneOf =
  (...values) =>
  (value) =>
    values.includes(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Leaf validators keyed by dotted path. '*' matches any key at that depth.
const SPEC = {
  id: (v) => typeof v === 'string' && /^[a-z][a-z0-9-]*$/.test(v),
  name: (v) => typeof v === 'string' && v.length > 0,
  description: (v) => typeof v === 'string',
  design: (v) => typeof v === 'string',
  'colors.light.*': isColor,
  'colors.dark.*': isColor,
  'colors.chart': (v) => Array.isArray(v) && v.every(isColor),
  'typography.headingFont': (v) => v in FONTS,
  'typography.bodyFont': (v) => v in FONTS,
  'typography.navigationFont': (v) => v in FONTS,
  'typography.buttonFont': (v) => v in FONTS,
  'typography.tableFont': (v) => v in FONTS,
  'typography.labelFont': (v) => v in FONTS,
  'typography.numericFont': (v) => v in FONTS,
  'typography.fontSizes.*': isLength,
  'typography.fontWeights.*': (v) => isNumber(v) && v >= 100 && v <= 900,
  'typography.lineHeights.*': (v) => isNumber(v) && v > 0.8 && v < 2.5,
  'typography.letterSpacing.*': isLength,
  'typography.textTransform.*': oneOf('none', 'uppercase', 'capitalize', 'lowercase'),
  'icons.library': oneOf('lucide', 'phosphor', 'bootstrap'),
  'icons.style': oneOf('outline', 'thin', 'light', 'bold', 'fill', 'duotone', 'gradient', 'sharp'),
  'icons.strokeWidth': (v) => isNumber(v) && v > 0.5 && v <= 3,
  'icons.size.*': isLength,
  'icons.container': oneOf('plain', 'soft', 'circle', 'square', 'outline'),
  'layout.sidebar.variant': oneOf('solid', 'contrast', 'floating', 'minimal', 'rail'),
  'layout.sidebar.width': isLength,
  'layout.sidebar.radius': isLength,
  'layout.sidebar.indicator': oneOf('pill', 'bar', 'underline', 'block', 'glow', 'dot'),
  'layout.sidebar.itemRadius': isLength,
  'layout.sidebar.inset': isLength,
  'layout.header.variant': oneOf('bar', 'floating', 'transparent', 'contrast'),
  'layout.header.height': isLength,
  'layout.dashboard.variant': oneOf('grid', 'bento', 'stacked', 'compact'),
  'layout.content.maxWidth': isLength,
  'layout.content.padding': isLength,
  'layout.spacing.density': oneOf('compact', 'comfortable', 'spacious'),
  'layout.spacing.gap': isLength,
  'components.buttons.variant': oneOf('solid', 'gradient', 'soft', 'outline', 'neu', 'flat'),
  'components.buttons.radius': isLength,
  'components.buttons.paddingY': isLength,
  'components.buttons.paddingX': isLength,
  'components.buttons.hover': oneOf('lift', 'glow', 'press', 'darken', 'none'),
  'components.cards.variant': oneOf('elevated', 'outlined', 'glass', 'soft', 'flat', 'neu'),
  'components.cards.radius': isLength,
  'components.cards.padding': isLength,
  'components.cards.hover': oneOf('lift', 'glow', 'border', 'none'),
  'components.forms.variant': oneOf('outlined', 'filled', 'underline', 'neu'),
  'components.forms.radius': isLength,
  'components.tables.variant': oneOf('lined', 'striped', 'boxed', 'minimal'),
  'components.tables.header': oneOf('tinted', 'plain', 'contrast'),
  'components.modals.radius': isLength,
  'components.modals.backdropBlur': isLength,
  'components.dropdowns.radius': isLength,
  'components.badges.variant': oneOf('soft', 'solid', 'outline'),
  'components.badges.radius': isLength,
  'components.notifications.variant': oneOf('solid', 'soft', 'glass', 'accent'),
  'components.notifications.radius': isLength,
  'components.pagination.radius': isLength,
  'components.tabs.variant': oneOf('segmented', 'underline', 'pill'),
  'components.tooltips.radius': isLength,
  'backgrounds.type': oneOf('solid', 'gradient', 'mesh', 'pattern'),
  'backgrounds.pattern': oneOf('none', 'dots', 'grid', 'lines', 'paper'),
  'backgrounds.ambient': (v) => typeof v === 'boolean',
  'effects.shadows.strength': (v) => isNumber(v) && v >= 0 && v <= 3,
  'effects.blur.surface': isLength,
  'effects.gradients.angle': (v) => typeof v === 'string' && /deg$/.test(v),
  'effects.gradients.accent': (v) => typeof v === 'boolean',
  'effects.animations.pageEnter': oneOf('none', 'fade', 'rise', 'scale', 'slide'),
  'effects.animations.hover': oneOf('lift', 'glow', 'press', 'none'),
  'effects.transitions.duration': (v) => typeof v === 'string' && /^\d+m?s$/.test(v),
  'effects.transitions.easing': (v) => typeof v === 'string' && v.length > 0,
};

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const deepMerge = (...sources) =>
  sources.reduce((target, source) => {
    if (!isPlainObject(source)) return target;
    for (const [key, value] of Object.entries(source)) {
      target[key] =
        isPlainObject(value) && isPlainObject(target[key])
          ? deepMerge({}, target[key], value)
          : value;
    }
    return target;
  }, {});

const flatten = (object, prefix = '') =>
  Object.entries(object).flatMap(([key, value]) =>
    isPlainObject(value) ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]],
  );

const validatorFor = (path) => {
  if (SPEC[path]) return SPEC[path];
  const wildcard = path.replace(/\.[^.]+$/, '.*');
  return SPEC[wildcard];
};

export const validateTheme = (theme) => {
  const errors = [];
  for (const [path, value] of flatten(theme)) {
    const validate = validatorFor(path);
    if (!validate) errors.push(`${path}: unknown setting`);
    else if (!validate(value)) errors.push(`${path}: invalid value ${JSON.stringify(value)}`);
  }
  for (const mode of ['light', 'dark']) {
    for (const key of COLOR_KEYS) {
      if (!theme.colors?.[mode]?.[key]) errors.push(`colors.${mode}.${key}: missing`);
    }
  }
  return { valid: errors.length === 0, errors };
};
