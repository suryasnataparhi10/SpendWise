// Small colour helpers used to derive readable tokens (contrast text, tints, rgb channels).
const clamp = (value, min = 0, max = 255) => Math.min(max, Math.max(min, value));

export const parseColor = (input) => {
  const value = String(input || '').trim();
  let match = value.match(/^#([\da-f]{3,8})$/i);
  if (match) {
    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (match) {
    const [r, g, b, a = 1] = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r, g, b, a };
  }
  return null;
};

export const toHex = ({ r, g, b }) =>
  `#${[r, g, b].map((c) => Math.round(clamp(c)).toString(16).padStart(2, '0')).join('')}`;

export const mix = (from, to, amount) => {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return from;
  return toHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
};

export const rgbChannels = (color) => {
  const parsed = parseColor(color);
  return parsed ? `${parsed.r}, ${parsed.g}, ${parsed.b}` : '0, 0, 0';
};

export const luminance = (color) => {
  const parsed = parseColor(color);
  if (!parsed) return 0.5;
  const [r, g, b] = [parsed.r, parsed.g, parsed.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Picks whichever candidate reads best on the given background.
export const readableOn = (background, light = '#ffffff', dark = '#141a24') =>
  contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;

export const isDark = (color) => luminance(color) < 0.22;

export const alpha = (color, amount) => {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${+(parsed.a * amount).toFixed(3)})`;
};
