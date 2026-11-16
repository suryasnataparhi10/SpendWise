// Theme registry. A theme = a design language + a palette + optional overrides, resolved into
// the full schema from ./schema.js. Add a theme by adding one entry here.
import { BASE_THEME, deepMerge, validateTheme } from './schema';
import { DESIGNS, DESIGN_IDS } from './designs';
import { PALETTES } from './palettes';
import { mix } from './color';

export const DEFAULT_THEME_ID = 'midnight-mint';
export const DEFAULT_CUSTOM_ACCENT = '#7c6ee8';
export const DEFAULT_CUSTOM_DESIGN = 'signature';

export const THEMES = [
  {
    id: 'midnight-mint',
    name: 'Midnight Mint',
    design: 'signature',
    description: 'The SpendWise original: navy sidebar, mint accents, rounded cards.',
  },
  {
    id: 'dark-professional',
    name: 'Premium Dark',
    design: 'executive',
    description: 'Deep surfaces, glowing accents and a tight premium type scale.',
  },
  {
    id: 'minimal-light',
    name: 'Minimal Light',
    design: 'minimal',
    description: 'Hairline borders, Inter type and lots of white space.',
  },
  {
    id: 'glassmorphism',
    name: 'Glassmorphism',
    design: 'glass',
    description: 'Frosted floating panels over a soft colour mesh.',
  },
  {
    id: 'modern-gradient',
    name: 'Modern Gradient',
    design: 'vivid',
    description: 'Gradient buttons, pill navigation and gradient icons.',
  },
  {
    id: 'neumorphism',
    name: 'Neumorphism',
    design: 'soft',
    description: 'Soft extruded surfaces and rounded, friendly type.',
  },
  {
    id: 'material-design',
    name: 'Material',
    design: 'material',
    description: 'Coloured app bar, elevation and filled icons.',
  },
  {
    id: 'warm-ledger',
    name: 'Warm Ledger',
    design: 'editorial',
    description: 'Serif headlines and ruled lines on warm paper.',
  },
  {
    id: 'monochrome',
    name: 'Monochrome Grid',
    design: 'precision',
    description: 'Technical, dense and monospaced on a fine grid.',
  },
  {
    id: 'midnight-amoled',
    name: 'Midnight AMOLED',
    design: 'precision',
    description: 'True-black terminal precision with mint data.',
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    design: 'material',
    description: 'Material structure in breezy ocean blues.',
  },
  {
    id: 'lavender-graphite',
    name: 'Lavender Graphite',
    design: 'executive',
    description: 'Executive layout in lavender and graphite.',
  },
  {
    id: 'sunset-coral',
    name: 'Sunset Coral',
    design: 'vivid',
    description: 'Warm coral gradients with playful pill shapes.',
  },
  {
    id: 'sage-sand',
    name: 'Sage & Sand',
    design: 'soft',
    description: 'Soft UI in earthy sage and sand.',
  },
  {
    id: 'berry-night',
    name: 'Berry Night',
    design: 'vivid',
    description: 'Berry gradients with bold filled icons.',
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    design: 'glass',
    description: 'Icy glass layers in cool blues.',
  },
  {
    id: 'rosewood',
    name: 'Rosewood',
    design: 'editorial',
    description: 'An editorial journal in rosewood tones.',
  },
  {
    id: 'citrus-grove',
    name: 'Citrus Grove',
    design: 'soft',
    description: 'Fresh citrus greens on soft pressed surfaces.',
  },
  {
    id: 'royal-indigo',
    name: 'Royal Indigo',
    design: 'executive',
    description: 'Regal indigo with a premium dashboard feel.',
  },
  {
    id: 'aurora-glow',
    name: 'Aurora Glow',
    design: 'glass',
    description: 'Teal aurora light through frosted glass.',
  },
  {
    id: 'sakura',
    name: 'Sakura',
    design: 'soft',
    description: 'Gentle blossom pinks on soft rounded surfaces.',
  },
  {
    id: 'midnight-orchid',
    name: 'Midnight Orchid',
    design: 'executive',
    description: 'Orchid accents on a refined executive layout.',
  },
  {
    id: 'coastal-sand',
    name: 'Coastal Sand',
    design: 'minimal',
    description: 'Minimal, airy and sun-bleached.',
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    design: 'signature',
    description: 'The signature layout in deep forest greens.',
  },
  {
    id: 'colorful-creative',
    name: 'Colorful Creative',
    design: 'vivid',
    description: 'Multicolour gradients for a creative studio feel.',
  },
  {
    id: 'custom',
    name: 'Custom',
    design: DEFAULT_CUSTOM_DESIGN,
    description: 'Your accent colour on the design language you choose.',
  },
];

// Appearance preferences; 'system' follows the device's light/dark setting.
export const APPEARANCE_OPTIONS = [
  { mode: 'light', label: 'Light', icon: 'sun' },
  { mode: 'dark', label: 'Dark', icon: 'moon' },
  { mode: 'system', label: 'Auto', icon: 'device' },
];

export const THEME_IDS = THEMES.map((theme) => theme.id);

const customPalette = (accent) => ({
  light: {
    ink: '#262433',
    muted: '#787586',
    paper: mix(accent, '#ffffff', 0.955),
    panel: '#ffffff',
    line: mix(accent, '#ffffff', 0.87),
    primary: accent,
    primaryDark: mix(accent, '#000000', 0.23),
    side: mix(accent, '#ffffff', 0.97),
    soft: mix(accent, '#ffffff', 0.88),
    sceneGlowA: mix(accent, '#ffffff', 0.75),
    sceneGlowB: mix(accent, '#ffffff', 0.85),
  },
  dark: {
    ink: '#eeedf6',
    muted: '#a9a6b8',
    paper: mix(accent, '#0f0f16', 0.9),
    panel: mix(accent, '#181822', 0.88),
    line: mix(accent, '#2c2c3a', 0.8),
    primary: mix(accent, '#ffffff', 0.27),
    primaryDark: mix(accent, '#ffffff', 0.43),
    side: mix(accent, '#14141c', 0.9),
    soft: mix(accent, '#181822', 0.7),
    sceneGlowA: mix(accent, '#0f0f16', 0.6),
    sceneGlowB: mix(accent, '#0f0f16', 0.75),
  },
});

const resolveReferences = (colors) => {
  const resolved = { ...colors };
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string' && value.startsWith('@'))
      resolved[key] = colors[value.slice(1)] ?? value;
  }
  return resolved;
};

export const getThemeDefinition = (id) => THEMES.find((theme) => theme.id === id) || THEMES[0];

const cache = new Map();

export const resolveTheme = (
  id,
  { customAccent = DEFAULT_CUSTOM_ACCENT, customDesign = DEFAULT_CUSTOM_DESIGN } = {},
) => {
  const definition = getThemeDefinition(id);
  const isCustom = definition.id === 'custom';
  const designId = isCustom && DESIGN_IDS.includes(customDesign) ? customDesign : definition.design;
  const key = isCustom ? `custom:${customAccent}:${designId}` : definition.id;
  if (cache.has(key)) return cache.get(key);

  const { name: designName, summary, colors: designColors = {}, ...design } = DESIGNS[designId];
  const palette = isCustom ? customPalette(customAccent) : PALETTES[definition.id] || {};
  const merged = deepMerge(
    {},
    BASE_THEME,
    design,
    { colors: { light: palette.light, dark: palette.dark, chart: palette.chart || [] } },
    { colors: designColors },
    definition.overrides,
    {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      design: designId,
    },
  );
  merged.colors.light = resolveReferences(merged.colors.light);
  merged.colors.dark = resolveReferences(merged.colors.dark);
  merged.designName = designName;
  merged.designSummary = summary;

  const { designName: _n, designSummary: _s, ...schemaPart } = merged;
  const { valid, errors } = validateTheme(schemaPart);
  if (!valid && import.meta.env?.DEV)
    console.warn(`[theme] "${definition.id}" has invalid settings`, errors);

  cache.set(key, merged);
  return merged;
};
