import { createContext, useContext, useLayoutEffect, ReactNode } from 'react';
import { useAppStore } from '@/lib/store';
import { hexToHslTriplet } from '@/lib/themePreferences';

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
