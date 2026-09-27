import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAppStore } from '@/lib/store';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const THEME_STORAGE_KEY = 'alwan-ui-theme';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

/**
 * Tailwind theme colors in this project use hsl(var(--primary)).
 * Therefore a hex preference such as #ea580c must be converted into HSL channels
 * instead of being assigned directly to --primary.
 */
export function hexToHslChannels(hexColor: string): string | null {
  const hex = hexColor.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const theme: Theme = settings.darkMode ? 'dark' : 'light';

  // Hydrate explicit appearance preference once. This key is deliberately separate
  // from tenant settings so page navigation / tenant refresh cannot overwrite it.
  useEffect(() => {
    const stored = getStoredTheme();
    if (stored && stored !== theme) {
      updateSettings({ darkMode: stored === 'dark' });
    }
    // Only hydrate once. The theme persistence effect below handles future changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Local storage can be unavailable in strict/private environments.
    }
  }, [theme]);

  useEffect(() => {
    if (!settings.primaryColor) return;

    const root = document.documentElement;
    const normalized = hexToHslChannels(settings.primaryColor);

    if (normalized) {
      root.style.setProperty('--primary', normalized);
      root.style.setProperty('--sidebar-primary', normalized);
      root.style.setProperty('--ring', normalized);
    }
  }, [settings.primaryColor]);

  const setTheme = (nextTheme: Theme) => {
    updateSettings({ darkMode: nextTheme === 'dark' });
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {}
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
