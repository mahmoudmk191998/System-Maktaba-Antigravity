import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAppStore } from '@/lib/store';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'alwan-ui-theme';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
});

function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
}

/**
 * Tailwind colors use hsl(var(--primary)), so a raw "#ea580c" value makes
 * the CSS declaration invalid. Convert user-selected HEX colors to the
 * "H S% L%" triplet expected by the design tokens.
 */
export function hexToHslTriplet(hex: string): string | null {
  const normalized = hex.trim().replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;

  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;

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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  // The selected theme is a device/UI preference and must not be overwritten
  // when another route re-hydrates tenant settings from Firestore.
  const [theme, setThemeState] = useState<Theme>(() => {
    return getStoredTheme() ?? (useAppStore.getState().settings.darkMode ? 'dark' : 'light');
  });

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    }

    const shouldBeDark = nextTheme === 'dark';
    if (useAppStore.getState().settings.darkMode !== shouldBeDark) {
      updateSettings({ darkMode: shouldBeDark });
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;

    // Keep Zustand's persisted appearance value aligned with the dedicated theme source.
    const shouldBeDark = theme === 'dark';
    if (useAppStore.getState().settings.darkMode !== shouldBeDark) {
      updateSettings({ darkMode: shouldBeDark });
    }
  }, [theme, updateSettings]);

  useEffect(() => {
    const root = document.documentElement;
    const hslPrimary = hexToHslTriplet(settings.primaryColor || '');

    if (hslPrimary) {
      root.style.setProperty('--primary', hslPrimary);
      root.style.setProperty('--ring', hslPrimary);
      root.style.setProperty('--sidebar-primary', hslPrimary);
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--sidebar-primary');
    }
  }, [settings.primaryColor]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (event.newValue === 'light' || event.newValue === 'dark') {
        setThemeState(event.newValue);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
