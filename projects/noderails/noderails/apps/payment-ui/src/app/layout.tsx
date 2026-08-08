import type { Metadata } from 'next';
import { PostHogAnalyticsProvider } from '@/components/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'NodeRails Payment',
  description: 'Secure crypto payment checkout',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" data-theme="light">
      <body className="antialiased bg-background text-foreground">
        <PostHogAnalyticsProvider>
          {children}
        </PostHogAnalyticsProvider>
      </body>
    </html>
  );
}
