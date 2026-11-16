// Applies a compiled theme to a DOM element (the document root, or a scoped preview).
import { compileTheme } from './tokens';
import { preloadFonts } from './fonts';

export const BOOT_CACHE_KEY = 'themeBoot';
let transitionTimer;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const applyTokens = (element, { vars, attrs }) => {
  for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
};

// Inline style/attribute props for scoped previews (theme gallery thumbnails).
export const scopedThemeProps = (theme, appearance) => {
  const { vars, attrs } = compileTheme(theme, appearance);
  return { style: vars, ...attrs };
};

export const applyTheme = (
  theme,
  appearance,
  root = document.documentElement,
  compiled = compileTheme(theme, appearance),
) => {
  if (!prefersReducedMotion()) {
    root.classList.add('theme-transition');
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 420);
  }
  applyTokens(root, compiled);
  preloadFonts(Object.values(theme.typography).filter((value) => typeof value === 'string'));

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = compiled.vars['--header-bg'].startsWith('#')
    ? compiled.vars['--header-bg']
    : compiled.vars['--paper'];

  // Lets index.html paint the right theme before React boots, so there is no flash of another theme.
  try {
    localStorage.setItem(
      BOOT_CACHE_KEY,
      JSON.stringify({ vars: compiled.vars, attrs: compiled.attrs }),
    );
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this session.
  }
  return compiled;
};
