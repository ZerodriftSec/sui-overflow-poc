import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Buy Me a Coffee · NodeRails SDK Demo',
  description: 'Test NodeRails checkout, payment links, and subscriptions in a standalone sandbox.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
