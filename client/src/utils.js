export const PAY = ['Cash', 'Navi', 'GPay', 'PhonePe', 'Paytm', 'YONO', 'ICICI', 'Overseas', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other'];
export const inr = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const CHART_PALETTES = {
  'midnight-mint': ['#79e0c2', '#ff9b83', '#8793ff', '#4b9e98', '#d5b878', '#bd83b5', '#6ea6d9', '#9cbf8b', '#7180a6', '#b78956'],
  'ocean-blue': ['#74c4df', '#f1a77d', '#8299e8', '#48a9a5', '#d6bd70', '#bb8bc4', '#6ea6d9', '#96c48e', '#7180a6', '#b78956'],
  'warm-ledger': ['#d5ad70', '#bd7859', '#84936e', '#7d9b98', '#a78a5a', '#b887a5', '#7594b0', '#9dae79', '#817c6e', '#a16e45'],
  'lavender-graphite': ['#b4a4ed', '#ed9eaf', '#7797c5', '#71aaa0', '#d3b86f', '#c18bb4', '#78a9cc', '#a0bc8a', '#827b9e', '#b78956'],
  'sunset-coral': ['#f1937b', '#e9b35f', '#8e9bc6', '#55a89c', '#ce8293', '#b78956', '#6ca6c8', '#a0b87b', '#857996', '#bc7659'],
  monochrome: ['#5f5f5f', '#999999', '#777777', '#b0b0b0', '#454545', '#888888', '#c0c0c0', '#6c6c6c', '#a0a0a0', '#383838'],
  'sage-sand': ['#a9c095', '#d5ad70', '#8da5b5', '#82aaa0', '#c68e77', '#b995b7', '#7399b9', '#b5a66e', '#82917a', '#b78956'],
  'berry-night': ['#d68ab8', '#e79a88', '#9b90d1', '#66aaa3', '#d5b878', '#bf7ea1', '#7da6d2', '#a6b780', '#8979a0', '#b78956'],
  'arctic-frost': ['#8dc4e8', '#efa87f', '#899edf', '#68b0a8', '#d6bc79', '#b594c4', '#719dc2', '#9fc38f', '#778ba3', '#b78956'],
  rosewood: ['#d78da4', '#e9aa83', '#918bc2', '#67a9a0', '#d5b878', '#bf7ea1', '#7da6c2', '#a5b785', '#8c778a', '#b78956'],
  'citrus-grove': ['#b8c96b', '#df9f68', '#819bb6', '#65a99a', '#d2bd67', '#b78ca4', '#71a7bc', '#8eae74', '#81896b', '#b78956'],
  'royal-indigo': ['#a8a8f0', '#e99b9b', '#769fce', '#68aaa2', '#d6b76e', '#bb88bd', '#6ea6d9', '#99b581', '#827f9e', '#b78956'],
  'aurora-glow': ['#70d8c5', '#e99b9b', '#9c8bdb', '#5aa89e', '#d5bb77', '#c187b5', '#72a8cb', '#9cb97f', '#778b91', '#b78956'],
  sakura: ['#e594b2', '#e9aa83', '#a399d0', '#69aaa2', '#d4b875', '#bf7ea1', '#7da6c2', '#a5b785', '#8c778a', '#b78956'],
  'midnight-orchid': ['#b59ad9', '#e89caa', '#8299ce', '#68a99f', '#d5b878', '#c17eae', '#7da6c2', '#9db47f', '#8a7c9b', '#b78956'],
  'coastal-sand': ['#83c5b8', '#d7ad72', '#829cbd', '#5ea69b', '#c99376', '#b795a8', '#6ea6c1', '#a6b47b', '#7a938a', '#b78956'],
};
const THEME_ACCENTS = {
  light: {
    'midnight-mint': ['#367e70', '#286b5e'], 'ocean-blue': ['#3484a6', '#246a88'],
    'warm-ledger': ['#9a7040', '#79552f'], 'lavender-graphite': ['#7867b2', '#5e4e98'],
    'sunset-coral': ['#d46f5c', '#b85646'], monochrome: ['#525252', '#333333'],
    'sage-sand': ['#71866b', '#566b52'], 'berry-night': ['#a34e83', '#803b67'],
    'arctic-frost': ['#527fa8', '#3a648b'], rosewood: ['#a65970', '#884157'],
    'citrus-grove': ['#728a3c', '#586f2d'], 'royal-indigo': ['#5d5fb0', '#484994'],
    'aurora-glow': ['#3c9d96', '#287b76'], sakura: ['#c7668a', '#a64d70'],
    'midnight-orchid': ['#8061a5', '#654785'], 'coastal-sand': ['#4c9290', '#357674'],
  },
  dark: {
    'midnight-mint': ['#79e0c2', '#9aefd6'], 'ocean-blue': ['#74c4df', '#96d8ed'],
    'warm-ledger': ['#d5ad70', '#e8c58c'], 'lavender-graphite': ['#b4a4ed', '#cbbef7'],
    'sunset-coral': ['#f1937b', '#ffb09a'], monochrome: ['#c2c2c2', '#e0e0e0'],
    'sage-sand': ['#a9c095', '#c1d2ac'], 'berry-night': ['#d68ab8', '#edacd1'],
    'arctic-frost': ['#8dc4e8', '#b0d9f2'], rosewood: ['#d78da4', '#edabc0'],
    'citrus-grove': ['#b8d276', '#d2e695'], 'royal-indigo': ['#a8a8f0', '#c1c0ff'],
    'aurora-glow': ['#70d8c5', '#91ead8'], sakura: ['#e594b2', '#f1b1c7'],
    'midnight-orchid': ['#b59ad9', '#d0b8ed'], 'coastal-sand': ['#83c5b8', '#a3dccd'],
  },
};
const mixHex = (hex, target, amount) => {
  const from = hex.match(/[\da-f]{2}/gi)?.map((part) => parseInt(part, 16)) || [124, 110, 232];
  const to = target.match(/[\da-f]{2}/gi)?.map((part) => parseInt(part, 16)) || [255, 255, 255];
  return `#${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
};
const getThemeAccents = (theme, appearance, customAccent) => {
  const selected = theme || document.documentElement.dataset.colorTheme;
  if (selected === 'custom') {
    return appearance === 'dark'
      ? [mixHex(customAccent || '#7c6ee8', '#ffffff', 0.27), mixHex(customAccent || '#7c6ee8', '#ffffff', 0.43)]
      : [customAccent || '#7c6ee8', mixHex(customAccent || '#7c6ee8', '#000000', 0.23)];
  }
  return THEME_ACCENTS[appearance === 'dark' ? 'dark' : 'light'][selected] || THEME_ACCENTS.light['midnight-mint'];
};
export const getChartColors = (theme, customAccent, appearance) => {
  const selected = theme || document.documentElement.dataset.colorTheme;
  if (selected === 'custom') return [getThemeAccents(selected, appearance, customAccent)[0], ...CHART_PALETTES['lavender-graphite'].slice(1)];
  return CHART_PALETTES[selected] || CHART_PALETTES['midnight-mint'];
};
export const getThemeAccent = (theme, appearance, customAccent) => getThemeAccents(theme, appearance, customAccent)[0];
export const getThemeAccentHover = (theme, appearance, customAccent) => getThemeAccents(theme, appearance, customAccent)[1];
