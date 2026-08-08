import { RootProvider } from 'fumadocs-ui/provider/next';
import { Geist, Geist_Mono } from 'next/font/google';

import { SiteHeader } from '@/components/SiteHeader';
import './global.css';

const sans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata = {
  title: {
    default: 'StreamLine Docs',
    template: '%s · StreamLine Docs',
  },
  description:
    'Programmable micropayments on Sui — streams, handles, SDK, and indexer API.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} font-sans`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider>
          <SiteHeader />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
