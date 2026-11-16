// Self-hosted font faces. Each stylesheet only declares @font-face rules; the browser downloads
// a font file the first time a theme actually renders text with it.
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/outfit';
import '@fontsource-variable/nunito';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/roboto';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/fraunces';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';

const SANS_FALLBACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const FONTS = {
  Inter: { family: 'Inter Variable', fallback: SANS_FALLBACK, note: 'Modern and professional' },
  Manrope: { family: 'Manrope Variable', fallback: SANS_FALLBACK, note: 'Clean and sophisticated' },
  'Plus Jakarta Sans': {
    family: 'Plus Jakarta Sans Variable',
    fallback: SANS_FALLBACK,
    note: 'Premium dashboard',
  },
  Outfit: { family: 'Outfit Variable', fallback: SANS_FALLBACK, note: 'Modern geometric' },
  Nunito: { family: 'Nunito Variable', fallback: SANS_FALLBACK, note: 'Friendly and rounded' },
  'DM Sans': {
    family: 'DM Sans Variable',
    fallback: SANS_FALLBACK,
    note: 'Minimal and professional',
  },
  Roboto: { family: 'Roboto Variable', fallback: SANS_FALLBACK, note: 'Familiar and readable' },
  Poppins: { family: 'Poppins', fallback: SANS_FALLBACK, note: 'Clean and contemporary' },
  'JetBrains Mono': {
    family: 'JetBrains Mono Variable',
    fallback: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
    note: 'Precise tabular figures',
  },
  Fraunces: {
    family: 'Fraunces Variable',
    fallback: "Georgia, 'Times New Roman', serif",
    note: 'Editorial serif',
  },
};

export const fontStack = (name) => {
  const font = FONTS[name];
  return font ? `'${font.family}', ${font.fallback}` : SANS_FALLBACK;
};

// Warms the font cache so a theme switch doesn't flash fallback text.
export const preloadFonts = (names) => {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  const unique = [...new Set(names.filter((name) => FONTS[name]))];
  return Promise.allSettled(
    unique.flatMap((name) =>
      [400, 600].map((weight) => document.fonts.load(`${weight} 16px '${FONTS[name].family}'`)),
    ),
  );
};
