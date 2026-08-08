import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Button } from './button';

test('Button renders with children', () => {
  render(<Button>Click Me</Button>);
  expect(screen.getByText('Click Me')).toBeDefined();
});
