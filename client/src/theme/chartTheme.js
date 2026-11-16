// Chart.js setup, imported only by pages that draw charts so the library stays out of the
// initial bundle. Registers the chart types and keeps global chart styling on the active theme.
import { Chart, registerables } from 'chart.js';
import { useTheme } from './ThemeProvider';

Chart.register(...registerables);

const applyChartDefaults = (vars) => {
  Chart.defaults.font.family = vars['--font-body'];
  Chart.defaults.color = vars['--muted'];
  Chart.defaults.borderColor = vars['--bs-border-color'];
  Chart.defaults.plugins.tooltip.backgroundColor = vars['--panel-solid'];
  Chart.defaults.plugins.tooltip.titleColor = vars['--ink'];
  Chart.defaults.plugins.tooltip.bodyColor = vars['--ink'];
  Chart.defaults.plugins.tooltip.borderColor = vars['--bs-border-color'];
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.titleFont = { family: vars['--font-heading'], weight: '700' };
  Chart.defaults.plugins.tooltip.bodyFont = { family: vars['--font-numeric'] };
};

// Theme values for chart datasets. Defaults are set during render so charts drawn in the same
// render already use the current theme.
export const useChartTheme = () => {
  const { chartColors, tokens } = useTheme();
  applyChartDefaults(tokens);
  return { chartColors, tokens, barRadius: Math.min(8, parseFloat(tokens['--card-radius']) / 3) };
};
