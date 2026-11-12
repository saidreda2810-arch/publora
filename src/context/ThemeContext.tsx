import React, { createContext, useContext, useState, useEffect } from 'react';

type ThemePreference = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';

interface ThemeContextType {
  theme: ResolvedTheme;
  themePreference: ThemePreference;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemePreference) => void;
}

const THEME_STORAGE_KEY = 'saa_theme_preference';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    }
    return 'dark'; // Dark Editorial is the default
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const theme: ResolvedTheme = themePreference === 'system' ? systemTheme : themePreference;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
    localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [theme, themePreference]);

  // Apply the theme-transition class only for the duration of a switch so
  // color changes animate smoothly without permanently taxing every element.
  const withTransition = (fn: () => void) => {
    const root = document.documentElement;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      fn();
      return;
    }
    root.classList.add('theme-transition');
    fn();
    window.setTimeout(() => root.classList.remove('theme-transition'), 260);
  };

  const toggleTheme = () => {
    withTransition(() => setThemePreference(theme === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (t: ThemePreference) => {
    withTransition(() => setThemePreference(t));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themePreference,
        isDark: theme === 'dark',
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
