import React, { createContext, useContext } from "react";

export interface PayStreamerTheme {
  primary?: string;
  primaryForeground?: string;
  background?: string;
  card?: string;
  cardForeground?: string;
  muted?: string;
  mutedForeground?: string;
  border?: string;
  radius?: string;
}

export const PayStreamerThemeContext = createContext<PayStreamerTheme | undefined>(undefined);

export interface PayStreamerThemeProviderProps {
  theme?: PayStreamerTheme;
  children: React.ReactNode;
}

export function PayStreamerThemeProvider({ theme, children }: PayStreamerThemeProviderProps) {
  return (
    <PayStreamerThemeContext.Provider value={theme}>
      {children}
    </PayStreamerThemeContext.Provider>
  );
}

export function usePayStreamerTheme() {
  return useContext(PayStreamerThemeContext);
}

export function useThemeStyles(localTheme?: PayStreamerTheme) {
  const contextTheme = usePayStreamerTheme();
  const theme = { ...contextTheme, ...localTheme };

  const styles: Record<string, string> = {};

  if (theme.primary) {
    styles["--color-primary"] = theme.primary;
    styles["--primary"] = theme.primary;
  }
  if (theme.primaryForeground) {
    styles["--color-primary-foreground"] = theme.primaryForeground;
    styles["--primary-foreground"] = theme.primaryForeground;
  }
  if (theme.background) {
    styles["--color-background"] = theme.background;
    styles["--background"] = theme.background;
  }
  if (theme.card) {
    styles["--color-card"] = theme.card;
    styles["--card"] = theme.card;
  }
  if (theme.cardForeground) {
    styles["--color-card-foreground"] = theme.cardForeground;
    styles["--card-foreground"] = theme.cardForeground;
  }
  if (theme.muted) {
    styles["--color-muted"] = theme.muted;
    styles["--muted"] = theme.muted;
  }
  if (theme.mutedForeground) {
    styles["--color-muted-foreground"] = theme.mutedForeground;
    styles["--muted-foreground"] = theme.mutedForeground;
  }
  if (theme.border) {
    styles["--color-border"] = theme.border;
    styles["--border"] = theme.border;
  }
  if (theme.radius) {
    styles["--radius-xl"] = theme.radius;
    styles["--radius-lg"] = `calc(${theme.radius} * 0.75)`;
    styles["--radius-md"] = `calc(${theme.radius} * 0.5)`;
    styles["--radius-sm"] = `calc(${theme.radius} * 0.25)`;
    styles["--border-radius"] = theme.radius;
  }

  return styles as React.CSSProperties;
}
