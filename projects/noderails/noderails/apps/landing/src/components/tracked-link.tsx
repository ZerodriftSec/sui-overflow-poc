'use client';

import posthog from 'posthog-js';

type TrackedLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  event: string;
  properties?: Record<string, unknown>;
};

export function TrackedLink({ event, properties, onClick, ...props }: TrackedLinkProps) {
  return (
    <a
      {...props}
      onClick={(e) => {
        if (process.env.NEXT_PUBLIC_POSTHOG_KEY && typeof window !== 'undefined') {
          posthog.capture(event, properties);
        }
        onClick?.(e);
      }}
    />
  );
}
