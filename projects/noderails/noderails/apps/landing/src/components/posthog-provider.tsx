'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

function PostHogPageview() {
  const pathname = usePathname();
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  useEffect(() => {
    if (!key || !pathname || typeof window === 'undefined') return;
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      path: pathname,
      query: window.location.search ?? '',
    });
  }, [key, pathname]);

  return null;
}

export function PostHogAnalyticsProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  useEffect(() => {
    if (!key) return;

    if (!(posthog as { __loaded?: boolean }).__loaded) {
      posthog.init(key, {
        api_host: host,
        capture_pageview: false,
        capture_pageleave: true,
        person_profiles: 'identified_only',
      });
    }
  }, [key, host]);

  if (!key) return <>{children}</>;

  return (
    <PostHogProvider client={posthog}>
      <PostHogPageview />
      {children}
    </PostHogProvider>
  );
}
