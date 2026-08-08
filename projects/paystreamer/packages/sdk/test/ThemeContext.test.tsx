import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PayStreamerThemeProvider, useThemeStyles } from '../src/ui/ThemeContext';

const TestComponent = () => {
  const styles = useThemeStyles();
  return <div data-testid="themed-div" style={styles}>Themed Content</div>;
};

const TestComponentWithLocal = () => {
  const styles = useThemeStyles({ primary: '#00ff00' });
  return <div data-testid="themed-div-local" style={styles}>Themed Content</div>;
};

describe('PayStreamerThemeProvider & useThemeStyles', () => {
  it('provides theme context correctly', () => {
    const theme = {
      primary: '#ff0000',
      radius: '1rem',
    };

    render(
      <PayStreamerThemeProvider theme={theme}>
        <TestComponent />
      </PayStreamerThemeProvider>
    );

    const div = screen.getByTestId('themed-div');
    expect(div.style.getPropertyValue('--color-primary')).toBe('#ff0000');
    expect(div.style.getPropertyValue('--border-radius')).toBe('1rem');
  });

  it('local theme overrides context theme', () => {
    const theme = {
      primary: '#ff0000',
    };

    render(
      <PayStreamerThemeProvider theme={theme}>
        <TestComponentWithLocal />
      </PayStreamerThemeProvider>
    );

    const div = screen.getByTestId('themed-div-local');
    // The local theme has #00ff00 for primary
    expect(div.style.getPropertyValue('--color-primary')).toBe('#00ff00');
  });
});
