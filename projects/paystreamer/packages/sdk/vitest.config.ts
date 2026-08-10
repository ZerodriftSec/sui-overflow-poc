import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@paystreamer/sdk': path.resolve(__dirname, './src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    testTimeout: 30000, // 30 seconds for devnet transaction
  },
});
