import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setColorTheme,
  setCustomAccent,
  setCustomDesign,
  setAppearance,
  updateThemePreferences,
} from '../state/store';
import { applyTheme } from './engine';
import { compileTheme } from './tokens';
import {
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_CUSTOM_DESIGN,
  DEFAULT_THEME_ID,
  THEME_IDS,
  resolveTheme,
} from './themes';
import { IconGradientDefs, IconPackContext } from './Icon';

const ThemeContext = createContext(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';
const systemAppearance = () => (window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light');

// Tracks the device's light/dark setting live.
const useSystemAppearance = () => {
  const [value, setValue] = useState(systemAppearance);
  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query) return undefined;
    const onChange = () => setValue(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return value;
};

export function ThemeProvider({ children }) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const saved = {
    themeId: useSelector((state) => state.colorTheme),
    appearance: useSelector((state) => state.theme),
    customAccent: useSelector((state) => state.customAccent),
    customDesign: useSelector((state) => state.customDesign),
  };
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const loadedUser = useRef(null);
  const deviceAppearance = useSystemAppearance();

  const active = { ...saved, ...preview };
  // 'system' is a preference; what gets painted is always light or dark.
  const appearance = active.appearance === 'system' ? deviceAppearance : active.appearance;
  const themeId = THEME_IDS.includes(active.themeId) ? active.themeId : DEFAULT_THEME_ID;
  const theme = useMemo(
    () =>
      resolveTheme(themeId, {
        customAccent: active.customAccent,
        customDesign: active.customDesign,
      }),
    [themeId, active.customAccent, active.customDesign],
  );
  const compiled = useMemo(() => compileTheme(theme, appearance), [theme, appearance]);

  useLayoutEffect(() => {
    applyTheme(theme, appearance, document.documentElement, compiled);
  }, [compiled]);

  const commit = useCallback(
    (next) => {
      dispatch(setColorTheme(next.themeId));
      dispatch(setCustomAccent(next.customAccent));
      dispatch(setCustomDesign(next.customDesign));
      dispatch(setAppearance(next.appearance));
    },
    [dispatch],
  );

  // A signed-in user's saved choice wins over this browser's last-used theme.
  useEffect(() => {
    const preferences = user?.themePreferences;
    if (!user?.id || !preferences || loadedUser.current === user.id) return;
    loadedUser.current = user.id;
    commit({
      themeId: THEME_IDS.includes(preferences.colorTheme)
        ? preferences.colorTheme
        : DEFAULT_THEME_ID,
      appearance: preferences.appearance || saved.appearance,
      customAccent: preferences.customAccent || saved.customAccent,
      customDesign: preferences.customDesign || saved.customDesign,
    });
  }, [user?.id, user?.themePreferences]);

  const save = useCallback(
    async (changes) => {
      const next = { ...saved, ...changes };
      commit(next);
      setPreview(null);
      if (!user?.id) return { ok: true };
      setSaving(true);
      try {
        await dispatch(
          updateThemePreferences({
            colorTheme: next.themeId,
            appearance: next.appearance,
            customAccent: next.customAccent,
            customDesign: next.customDesign,
          }),
        ).unwrap();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      } finally {
        setSaving(false);
      }
    },
    [saved.themeId, saved.appearance, saved.customAccent, saved.customDesign, user?.id, commit],
  );

  const reset = useCallback(
    () =>
      save({
        themeId: DEFAULT_THEME_ID,
        appearance: 'dark',
        customAccent: DEFAULT_CUSTOM_ACCENT,
        customDesign: DEFAULT_CUSTOM_DESIGN,
      }),
    [save],
  );

  useEffect(() => {
    if (!preview) return undefined;
    const onKey = (event) => event.key === 'Escape' && setPreview(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const value = useMemo(
    () => ({
      theme,
      appearance,
      appearancePreference: active.appearance,
      deviceAppearance,
      saved,
      preview,
      isPreviewing: Boolean(preview),
      startPreview: (changes) => setPreview({ ...saved, ...changes }),
      endPreview: () => setPreview(null),
      save,
      reset,
      saving,
      chartColors: compiled.chart,
      tokens: compiled.vars,
    }),
    [
      theme,
      compiled,
      appearance,
      deviceAppearance,
      preview,
      saving,
      save,
      reset,
      saved.themeId,
      saved.appearance,
      saved.customAccent,
      saved.customDesign,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>
      <IconPackContext.Provider value={theme.icons}>
        <IconGradientDefs />
        {children}
      </IconPackContext.Provider>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
};
