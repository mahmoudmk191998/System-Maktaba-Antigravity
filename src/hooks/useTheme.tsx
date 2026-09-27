import { createContext, useContext, useEffect, ReactNode } from 'react';
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
 * Converts #RRGGBB into the "H S% L%" token format used by our CSS variables.
 * Tailwind theme colors are defined as hsl(var(--primary)), so writing a raw hex
 * value into --primary makes the resulting CSS invalid (hsl(#...)).
 */
export function hexToHslToken(hex: string): string | null {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  let hue = 0;
  let saturation = 0;

  if (max !== min) {
    const delta = max - min;
    saturation =
      lightness > 0.5
        ? delta / (2 - max - min)
        : delta / (max + min);

    switch (max) {
      case r:
        hue = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / delta + 2;
        break;
      default:
        hue = (r - g) / delta + 4;
        break;
    }
    hue /= 6;
  }

  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const theme: Theme = settings.darkMode ? 'dark' : 'light';

  useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;

    const primaryToken = settings.primaryColor
      ? hexToHslToken(settings.primaryColor)
      : null;

    if (primaryToken) {
      root.style.setProperty('--primary', primaryToken);
      root.style.setProperty('--ring', primaryToken);
      root.style.setProperty('--sidebar-primary', primaryToken);
      root.style.setProperty('--sidebar-ring', primaryToken);
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--sidebar-primary');
      root.style.removeProperty('--sidebar-ring');
    }
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
