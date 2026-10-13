import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { blackTheme, type Theme } from '@onpurpose/core/theme';

const ThemeContext = createContext<Theme>(blackTheme);
export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * A stylesheet built from the current theme, created once per theme object.
 * Define it at module level and call the returned hook inside components:
 *   const useStyles = themedStyles((t) => ({ label: { color: t.ink(0xDE) } }));
 * `useStyles.get(theme)` serves a component that provides the theme itself.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(
  build: (theme: Theme) => T & StyleSheet.NamedStyles<T>,
): (() => T) & { get: (theme: Theme) => T } {
  const cache = new WeakMap<Theme, T>();
  function get(theme: Theme): T {
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(build(theme));
      cache.set(theme, styles);
    }
    return styles;
  }
  return Object.assign(() => get(useContext(ThemeContext)), { get });
}
