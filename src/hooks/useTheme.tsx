import { createContext, useContext, useLayoutEffect, ReactNode } from 'react';
import { useAppStore } from '@/lib/store';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
});

/**
 * Tailwind semantic colors in this project use hsl(var(--primary)).
 * Appearance settings store the color as HEX, so injecting the raw HEX value
 * into --primary makes the resulting CSS invalid (hsl(#xxxxxx)).
 */
export function hexToHslTriplet(hex: string): string | null {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

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
  const theme: Theme = settings.darkMode ? 'dark' : 'light';

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;

    const primaryHsl = settings.primaryColor
      ? hexToHslTriplet(settings.primaryColor)
      : null;

    if (primaryHsl) {
      root.style.setProperty('--primary', primaryHsl);
    } else {
      root.style.removeProperty('--primary');
    }

    // Keep the browser/PWA chrome visually consistent with the selected mode.
    const themeColor =
      theme === 'dark'
        ? 'hsl(222 30% 4%)'
        : 'hsl(210 20% 98%)';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = themeColor;
  }, [theme, settings.primaryColor]);

  const setTheme = (nextTheme: Theme) => {
    updateSettings({ darkMode: nextTheme === 'dark' });
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
