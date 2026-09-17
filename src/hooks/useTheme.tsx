import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAppStore } from '@/lib/store';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'light', toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useAppStore();
  const theme: Theme = settings.darkMode ? 'dark' : 'light';

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // Set CSS variable for primary color if applicable
    if (settings.primaryColor) {
      document.body.style.setProperty('--primary', settings.primaryColor);
    }
  }, [theme, settings.primaryColor]);

  const toggleTheme = () => {
    updateSettings({ darkMode: !settings.darkMode });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
