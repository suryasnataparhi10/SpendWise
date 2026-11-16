// Compiles a resolved theme into CSS custom properties and data attributes. Every stylesheet
// reads these tokens; nothing in the app should need to know which theme is active.
import { alpha, isDark, luminance, mix, parseColor, readableOn, rgbChannels, toHex } from './color';
import { fontStack } from './fonts';

const DENSITY = { compact: 0.84, comfortable: 1, spacious: 1.16 };

// Flattens translucent colours onto a backdrop so contrast maths works.
const solid = (color, backdrop) => {
  const parsed = parseColor(color);
  if (!parsed || parsed.a >= 1) return color;
  return mix(backdrop, toHex(parsed), parsed.a);
};

const backgroundImage = (type, pattern, c, accents) => {
  if (type === 'gradient') {
    return {
      image: `linear-gradient(165deg, ${mix(c.primary, c.paper, 0.9)} 0%, ${c.paper} 42%, ${mix(accents[0], c.paper, 0.92)} 100%)`,
      size: 'cover',
    };
  }
  if (type === 'mesh') {
    return {
      image: [
        `radial-gradient(at 6% 8%, ${alpha(c.primary, 0.34)} 0, transparent 46%)`,
        `radial-gradient(at 94% 12%, ${alpha(accents[0], 0.28)} 0, transparent 44%)`,
        `radial-gradient(at 70% 96%, ${alpha(accents[1], 0.26)} 0, transparent 50%)`,
        `radial-gradient(at 18% 88%, ${alpha(c.primary, 0.18)} 0, transparent 40%)`,
      ].join(', '),
      size: 'cover',
    };
  }
  if (type === 'pattern') {
    const ink = alpha(c.ink, 0.06);
    const patterns = {
      dots: {
        image: `radial-gradient(${alpha(c.ink, 0.11)} 1px, transparent 1.5px)`,
        size: '18px 18px',
      },
      grid: {
        image: `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`,
        size: '24px 24px',
      },
      lines: {
        image: `repeating-linear-gradient(135deg, ${ink} 0 1px, transparent 1px 12px)`,
        size: 'auto',
      },
      paper: {
        image: `linear-gradient(${alpha(c.ink, 0.045)} 1px, transparent 1px)`,
        size: '100% 30px',
      },
    };
    return patterns[pattern] || { image: 'none', size: 'auto' };
  }
  return { image: 'none', size: 'auto' };
};

export const compileTheme = (theme, appearance = 'light') => {
  const mode = appearance === 'dark' ? 'dark' : 'light';
  const dark = mode === 'dark';
  const c = { ...theme.colors[mode] };
  const t = theme.typography;
  const l = theme.layout;
  const k = theme.components;
  const fx = theme.effects;

  const panelSolid = solid(c.panel, c.paper);
  const accents = [
    theme.colors.chart[2] || mix(c.primary, dark ? '#ff9ac8' : '#d6559a', 0.5),
    theme.colors.chart[1] || mix(c.primary, '#f2a65a', 0.55),
  ];
  const chart = theme.colors.chart.length
    ? theme.colors.chart
    : [
        c.primary,
        accents[0],
        accents[1],
        c.info,
        c.success,
        c.warning,
        c.danger,
        mix(c.primary, c.ink, 0.4),
        mix(accents[0], c.paper, 0.35),
        c.muted,
      ];

  // A contrast sidebar always reads as a deep surface, even in light appearance.
  let side = c.side;
  if (l.sidebar.variant === 'contrast' && !isDark(solid(side, c.paper))) {
    side = dark ? mix(c.paper, '#000000', 0.35) : mix(c.primary, '#0b111d', 0.86);
  }
  const sideSolid = solid(side, c.paper);
  const sideDark = isDark(sideSolid);
  const sideInk = sideDark ? '#eef2f8' : c.ink;
  const sideAccent =
    sideDark && luminance(c.primary) < 0.3
      ? mix(c.primary, '#ffffff', 0.45)
      : sideDark
        ? c.primary
        : c.primaryDark;

  const headerContrast = l.header.variant === 'contrast';
  const header = headerContrast ? (dark ? mix(c.primary, c.paper, 0.72) : c.primary) : c.panel;
  const headerInk = headerContrast ? readableOn(solid(header, c.paper), '#ffffff', c.ink) : c.ink;

  const onPrimary = readableOn(c.primary, '#ffffff', dark ? '#0d141c' : '#111827');
  const shadowColor = dark ? '#000000' : mix(c.ink, '#000000', 0.35);
  const s = fx.shadows.strength * (dark ? 2.6 : 1);
  const sh = (a) => alpha(shadowColor, Math.min(0.85, a * s));
  const neuLight = dark ? mix(c.paper, '#ffffff', 0.07) : mix(c.paper, '#ffffff', 0.75);
  const neuShade = dark ? mix(c.paper, '#000000', 0.45) : mix(c.paper, '#1c2433', 0.14);
  const bg = backgroundImage(theme.backgrounds.type, theme.backgrounds.pattern, c, accents);
  const gradientAccent = `linear-gradient(${fx.gradients.angle}, ${c.primary}, ${accents[0]})`;
  const density = DENSITY[l.spacing.density] ?? 1;

  const vars = {
    // Palette (legacy names are kept so every existing rule follows the theme)
    '--ink': c.ink,
    '--muted': c.muted,
    '--paper': c.paper,
    '--panel': c.panel,
    '--panel-solid': panelSolid,
    '--line': c.line,
    '--line-strong': mix(solid(c.line, c.paper), c.ink, 0.18),
    '--primary': c.primary,
    '--primary-dark': c.primaryDark,
    '--primary-rgb': rgbChannels(c.primary),
    '--primary-deep': mix(c.primary, '#000000', dark ? 0.55 : 0.42),
    '--primary-soft': alpha(c.primary, dark ? 0.2 : 0.12),
    '--on-primary': onPrimary,
    '--soft': c.soft,
    '--side': side,
    '--side-ink': sideInk,
    '--side-muted': sideDark ? mix(sideInk, sideSolid, 0.4) : c.muted,
    '--side-hover': sideDark ? alpha('#ffffff', 0.07) : alpha(c.primary, 0.08),
    '--side-active': sideDark ? alpha(c.primary, 0.2) : alpha(c.primary, dark ? 0.2 : 0.13),
    '--side-accent': sideAccent,
    '--side-line': sideDark ? alpha('#ffffff', 0.08) : c.line,
    '--header-bg': header,
    '--header-ink': headerInk,
    '--header-muted': headerContrast ? alpha(headerInk, 0.75) : c.muted,
    '--accent-2': accents[0],
    '--accent-3': accents[1],
    '--danger': c.danger,
    '--warning': c.warning,
    '--success': c.success,
    '--info': c.info,
    '--on-danger': readableOn(c.danger, '#ffffff', '#1a0d0c'),
    '--danger-soft': alpha(c.danger, dark ? 0.18 : 0.1),
    '--warning-soft': alpha(c.warning, dark ? 0.18 : 0.12),
    '--success-soft': alpha(c.success, dark ? 0.18 : 0.1),
    '--info-soft': alpha(c.info, dark ? 0.18 : 0.1),
    '--glint': dark ? alpha('#ffffff', 0.4) : '#ffffff',
    '--highlight': dark ? alpha('#ffffff', 0.06) : alpha('#ffffff', 0.75),
    '--overlay': alpha(dark ? '#000000' : mix(c.ink, '#000000', 0.4), dark ? 0.62 : 0.42),
    '--shadow-color': shadowColor,
    '--surface-hover': alpha(c.ink, dark ? 0.06 : 0.035),
    '--surface-sunken': dark ? mix(panelSolid, '#000000', 0.18) : mix(panelSolid, c.ink, 0.03),
    '--scene-glow-a': c.sceneGlowA || alpha(c.primary, 0.14),
    '--scene-glow-b': c.sceneGlowB || alpha(accents[0], 0.12),
    '--scene-glow-c': c.sceneGlowC || alpha(accents[1], 0.08),
    '--scene-grid': alpha(c.ink, 0.04),
    '--theme-accent-rgb': rgbChannels(c.primary),
    ...Object.fromEntries(chart.slice(0, 10).map((color, i) => [`--chart-${i + 1}`, color])),

    // Typography
    '--font-heading': fontStack(t.headingFont),
    '--font-body': fontStack(t.bodyFont),
    '--font-nav': fontStack(t.navigationFont),
    '--font-button': fontStack(t.buttonFont),
    '--font-table': fontStack(t.tableFont),
    '--font-label': fontStack(t.labelFont),
    '--font-numeric': fontStack(t.numericFont),
    ...Object.fromEntries(
      Object.entries(t.fontSizes).map(([key, value]) => [`--fs-${key}`, value]),
    ),
    ...Object.fromEntries(
      Object.entries(t.fontWeights).map(([key, value]) => [`--fw-${key}`, String(value)]),
    ),
    ...Object.fromEntries(
      Object.entries(t.lineHeights).map(([key, value]) => [`--lh-${key}`, String(value)]),
    ),
    ...Object.fromEntries(
      Object.entries(t.letterSpacing).map(([key, value]) => [`--ls-${key}`, value]),
    ),
    ...Object.fromEntries(
      Object.entries(t.textTransform).map(([key, value]) => [`--tt-${key}`, value]),
    ),

    // Icons
    '--icon-sm': theme.icons.size.sm,
    '--icon-md': theme.icons.size.md,
    '--icon-lg': theme.icons.size.lg,
    '--icon-stroke': String(theme.icons.strokeWidth),
    '--icon-grad-a': c.primary,
    '--icon-grad-b': accents[0],

    // Layout
    '--sidebar-width': l.sidebar.width,
    '--sidebar-radius': l.sidebar.radius,
    '--sidebar-inset': l.sidebar.inset,
    '--nav-item-radius': l.sidebar.itemRadius,
    '--header-height': l.header.height,
    '--content-max': l.content.maxWidth,
    '--content-pad': l.content.padding,
    '--gap': l.spacing.gap,
    '--density': String(density),

    // Components
    '--btn-radius': k.buttons.radius,
    '--btn-py': k.buttons.paddingY,
    '--btn-px': k.buttons.paddingX,
    '--card-radius': k.cards.radius,
    '--card-pad': k.cards.padding,
    '--input-radius': k.forms.radius,
    '--modal-radius': k.modals.radius,
    '--modal-blur': k.modals.backdropBlur,
    '--dropdown-radius': k.dropdowns.radius,
    '--badge-radius': k.badges.radius,
    '--toast-radius': k.notifications.radius,
    '--pagination-radius': k.pagination.radius,
    '--tooltip-radius': k.tooltips.radius,

    // Effects
    '--shadow-sm': `0 1px 2px ${sh(0.06)}, 0 2px 6px ${sh(0.04)}`,
    '--shadow-md': `0 6px 18px ${sh(0.08)}, 0 1px 3px ${sh(0.05)}`,
    '--shadow-lg': `0 22px 60px ${sh(0.16)}, 0 4px 14px ${sh(0.06)}`,
    '--panel-shadow': `0 6px 18px ${sh(0.07)}, 0 1px 3px ${sh(0.04)}`,
    '--neu-out': `7px 7px 16px ${neuShade}, -7px -7px 16px ${neuLight}`,
    '--neu-out-sm': `3px 3px 7px ${neuShade}, -3px -3px 7px ${neuLight}`,
    '--neu-in': `inset 3px 3px 7px ${neuShade}, inset -3px -3px 7px ${neuLight}`,
    '--surface-blur': fx.blur.surface,
    '--gradient-accent': gradientAccent,
    '--gradient-soft': `linear-gradient(${fx.gradients.angle}, ${alpha(c.primary, 0.16)}, ${alpha(accents[0], 0.1)})`,
    '--motion-duration': fx.transitions.duration,
    '--motion-ease': fx.transitions.easing,
    '--app-bg-image': bg.image,
    '--app-bg-size': bg.size,

    // Bootstrap bridge so third-party components inherit the theme
    '--bs-body-font-family': fontStack(t.bodyFont),
    '--bs-body-font-size': t.fontSizes.base,
    '--bs-body-line-height': String(t.lineHeights.body),
    '--bs-body-color': c.ink,
    '--bs-body-bg': c.paper,
    '--bs-emphasis-color': c.ink,
    '--bs-heading-color': c.ink,
    '--bs-secondary-color': c.muted,
    '--bs-secondary-bg': c.soft,
    '--bs-tertiary-bg': dark ? mix(panelSolid, '#ffffff', 0.04) : mix(panelSolid, c.ink, 0.03),
    '--bs-border-color': solid(c.line, c.paper),
    '--bs-border-color-translucent': alpha(c.ink, 0.12),
    '--bs-border-radius': k.forms.radius,
    '--bs-border-radius-sm': `calc(${k.forms.radius} * .75)`,
    '--bs-border-radius-lg': k.cards.radius,
    '--bs-border-radius-xl': k.modals.radius,
    '--bs-primary': c.primary,
    '--bs-primary-rgb': rgbChannels(c.primary),
    '--bs-link-color': c.primaryDark,
    '--bs-link-color-rgb': rgbChannels(c.primaryDark),
    '--bs-link-hover-color': c.primary,
    '--bs-link-hover-color-rgb': rgbChannels(c.primary),
    '--bs-focus-ring-color': alpha(c.primary, 0.28),
    '--bs-danger': c.danger,
    '--bs-danger-rgb': rgbChannels(c.danger),
    '--bs-success': c.success,
    '--bs-success-rgb': rgbChannels(c.success),
    '--bs-warning': c.warning,
    '--bs-warning-rgb': rgbChannels(c.warning),
    '--bs-info': c.info,
    '--bs-info-rgb': rgbChannels(c.info),
    '--bs-danger-text-emphasis': c.danger,
    '--bs-danger-bg-subtle': alpha(c.danger, dark ? 0.18 : 0.1),
    '--bs-danger-border-subtle': alpha(c.danger, 0.3),
    '--bs-success-text-emphasis': c.success,
    '--bs-success-bg-subtle': alpha(c.success, dark ? 0.18 : 0.1),
    '--bs-success-border-subtle': alpha(c.success, 0.3),
    '--bs-warning-text-emphasis': c.warning,
    '--bs-warning-bg-subtle': alpha(c.warning, dark ? 0.18 : 0.12),
    '--bs-warning-border-subtle': alpha(c.warning, 0.3),
    '--bs-info-text-emphasis': c.info,
    '--bs-info-bg-subtle': alpha(c.info, dark ? 0.18 : 0.1),
    '--bs-info-border-subtle': alpha(c.info, 0.3),
    '--bs-box-shadow': `0 6px 18px ${sh(0.08)}`,
    '--bs-box-shadow-sm': `0 1px 3px ${sh(0.06)}`,
    '--bs-box-shadow-lg': `0 22px 60px ${sh(0.16)}`,
  };

  const attrs = {
    'data-theme': theme.id,
    'data-design': theme.design,
    'data-bs-theme': mode,
    'data-sidebar': l.sidebar.variant,
    'data-side-tone': sideDark ? 'dark' : 'light',
    'data-nav-indicator': l.sidebar.indicator,
    'data-header': l.header.variant,
    'data-dashboard': l.dashboard.variant,
    'data-density': l.spacing.density,
    'data-card': k.cards.variant,
    'data-card-hover': k.cards.hover,
    'data-button': k.buttons.variant,
    'data-button-hover': k.buttons.hover,
    'data-input': k.forms.variant,
    'data-table': k.tables.variant,
    'data-table-header': k.tables.header,
    'data-tabs': k.tabs.variant,
    'data-badge': k.badges.variant,
    'data-toast': k.notifications.variant,
    'data-icon-library': theme.icons.library,
    'data-icon-style': theme.icons.style,
    'data-icon-container': theme.icons.container,
    'data-bg': theme.backgrounds.type,
    'data-pattern': theme.backgrounds.pattern,
    'data-ambient': theme.backgrounds.ambient ? 'on' : 'off',
    'data-page-enter': fx.animations.pageEnter,
    'data-hover': fx.animations.hover,
  };

  return { vars, attrs, chart, accents };
};
