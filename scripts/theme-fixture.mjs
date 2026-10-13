// A ThemeContext module for component tests that load sources with explicit
// module maps. Components see the default black theme, whose colours are the
// original literals, so existing markup assertions keep their meaning.
import { blackTheme } from '../packages/core/src/theme.ts';

export function themeContextModule(theme = blackTheme) {
  return {
    ThemeProvider: ({ children }) => children,
    useTheme: () => theme,
    themedStyles: (build) =>
      Object.assign(() => build(theme), { get: (other) => build(other) }),
  };
}
