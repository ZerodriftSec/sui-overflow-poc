'use client';

import { useEffect, useId, useState } from 'react';
import { NODERAILS_LOGO_VARIANTS } from '@noderails/common';

export function NodeRailsLogo({
  className,
  withText = false,
  animate = true,
}: {
  className?: string;
  withText?: boolean;
  animate?: boolean;
}) {
  const [variantIndex, setVariantIndex] = useState(0);
  const idBase = useId().replace(/:/g, '');

  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => {
      setVariantIndex((prev) => (prev + 1) % NODERAILS_LOGO_VARIANTS.length);
    }, 10000);

    return () => clearInterval(timer);
  }, [animate]);

  const variant = NODERAILS_LOGO_VARIANTS[variantIndex];
  const gradientId = `${idBase}-nr-grad`;
  const railId = `${idBase}-rail-grad`;
  const shadowId = `${idBase}-soft-shadow`;

  return (
    <svg viewBox={withText ? '0 0 1200 320' : '0 0 320 320'} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={gradientId} x1="20" y1="20" x2="300" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={variant.gradientFrom} />
          <stop offset="0.5" stopColor={variant.gradientMid} />
          <stop offset="1" stopColor={variant.gradientTo} />
        </linearGradient>
        <linearGradient id={railId} x1="80" y1="86" x2="248" y2="234" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={variant.railFrom} stopOpacity="0.98" />
          <stop offset="1" stopColor={variant.railTo} stopOpacity="0.9" />
        </linearGradient>
        <filter id={shadowId} x="0" y="0" width="340" height="340" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor={variant.shadow} floodOpacity="0.25" />
        </filter>
      </defs>

      <g filter={`url(#${shadowId})`}>
        <rect x="24" y="24" width="272" height="272" rx="64" fill={`url(#${gradientId})`} />

        <rect x="72" y="84" width="176" height="26" rx="13" fill={`url(#${railId})`} />
        <rect x="72" y="146" width="176" height="26" rx="13" fill={`url(#${railId})`} />
        <rect x="72" y="208" width="176" height="26" rx="13" fill={`url(#${railId})`} />

        <circle cx="100" cy="97" r="7" fill={variant.dot} />
        <circle cx="156" cy="97" r="7" fill={variant.dot} />
        <circle cx="212" cy="97" r="7" fill={variant.dot} />
        <circle cx="100" cy="159" r="7" fill={variant.dot} />
        <circle cx="156" cy="159" r="7" fill={variant.dot} />
        <circle cx="212" cy="159" r="7" fill={variant.dot} />
        <circle cx="100" cy="221" r="7" fill={variant.dot} />
        <circle cx="156" cy="221" r="7" fill={variant.dot} />
        <circle cx="212" cy="221" r="7" fill={variant.dot} />
      </g>

      {withText && (
        <g>
          <text
            x="352"
            y="178"
            fill={variant.nodeText}
            fontFamily="Inter, Segoe UI, Helvetica Neue, Arial, sans-serif"
            fontSize="132"
            fontWeight="800"
            letterSpacing="-2"
          >
            Node
            <tspan fill={variant.railsText}>Rails</tspan>
          </text>
          <text
            x="356"
            y="230"
            fill={variant.subtitleText}
            fontFamily="Inter, Segoe UI, Helvetica Neue, Arial, sans-serif"
            fontSize="34"
            fontWeight="600"
            letterSpacing="7"
          >
            CRYPTO PAYMENT INFRASTRUCTURE
          </text>
        </g>
      )}
    </svg>
  );
}
