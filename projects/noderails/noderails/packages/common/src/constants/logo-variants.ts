export interface NodeRailsLogoVariant {
  key: string;
  gradientFrom: string;
  gradientMid: string;
  gradientTo: string;
  railFrom: string;
  railTo: string;
  dot: string;
  shadow: string;
  nodeText: string;
  railsText: string;
  subtitleText: string;
}

export const NODERAILS_LOGO_ASSET_FILES = [
  'noderails-logo.svg',
  'noderails-logo-black.svg',
  'noderails-logo-brown.svg',
  'noderails-logo-gold.svg',
  'noderails-logo-green.svg',
  'noderails-logo-gree.svg',
  'noderails-logo-grey.svg',
  'noderails-logo-red.svg',
  'noderails-logo-white.svg',
] as const;

// Color variants mirror the SVG files in packages/common/assets/logos.
export const NODERAILS_LOGO_VARIANTS: readonly NodeRailsLogoVariant[] = [
  {
    key: 'blue',
    gradientFrom: '#0EA5E9',
    gradientMid: '#2563EB',
    gradientTo: '#1D4ED8',
    railFrom: '#FFFFFF',
    railTo: '#DBEAFE',
    dot: '#1D4ED8',
    shadow: '#1E3A8A',
    nodeText: '#0F172A',
    railsText: '#2563EB',
    subtitleText: '#334155',
  },
  {
    key: 'black',
    gradientFrom: '#111111',
    gradientMid: '#000000',
    gradientTo: '#1F1F1F',
    railFrom: '#FFFFFF',
    railTo: '#E5E5E5',
    dot: '#000000',
    shadow: '#000000',
    nodeText: '#0B0B0B',
    railsText: '#1F2937',
    subtitleText: '#374151',
  },
  {
    key: 'brown',
    gradientFrom: '#D2B48C',
    gradientMid: '#8B5E3C',
    gradientTo: '#5C4033',
    railFrom: '#FAF3E0',
    railTo: '#D2B48C',
    dot: '#4A2C2A',
    shadow: '#4E342E',
    nodeText: '#3E2723',
    railsText: '#6D4C41',
    subtitleText: '#5D4037',
  },
  {
    key: 'gold',
    gradientFrom: '#FDE68A',
    gradientMid: '#D4AF37',
    gradientTo: '#B45309',
    railFrom: '#FFF8E1',
    railTo: '#FDE68A',
    dot: '#7C2D12',
    shadow: '#92400E',
    nodeText: '#3F2A00',
    railsText: '#B45309',
    subtitleText: '#6B4F00',
  },
  {
    key: 'green',
    gradientFrom: '#86EFAC',
    gradientMid: '#22C55E',
    gradientTo: '#15803D',
    railFrom: '#F0FDF4',
    railTo: '#BBF7D0',
    dot: '#166534',
    shadow: '#14532D',
    nodeText: '#052E16',
    railsText: '#15803D',
    subtitleText: '#166534',
  },
  {
    key: 'green-alt',
    gradientFrom: '#86EFAC',
    gradientMid: '#22C55E',
    gradientTo: '#15803D',
    railFrom: '#F0FDF4',
    railTo: '#BBF7D0',
    dot: '#166534',
    shadow: '#14532D',
    nodeText: '#052E16',
    railsText: '#15803D',
    subtitleText: '#166534',
  },
  {
    key: 'grey',
    gradientFrom: '#D1D5DB',
    gradientMid: '#6B7280',
    gradientTo: '#374151',
    railFrom: '#F9FAFB',
    railTo: '#D1D5DB',
    dot: '#111827',
    shadow: '#374151',
    nodeText: '#111827',
    railsText: '#4B5563',
    subtitleText: '#374151',
  },
  {
    key: 'red',
    gradientFrom: '#FCA5A5',
    gradientMid: '#EF4444',
    gradientTo: '#B91C1C',
    railFrom: '#FFF1F2',
    railTo: '#FECACA',
    dot: '#7F1D1D',
    shadow: '#7F1D1D',
    nodeText: '#450A0A',
    railsText: '#B91C1C',
    subtitleText: '#7F1D1D',
  },
  {
    key: 'white',
    gradientFrom: '#FFFFFF',
    gradientMid: '#F5F5F5',
    gradientTo: '#E5E7EB',
    railFrom: '#FFFFFF',
    railTo: '#E5E7EB',
    dot: '#9CA3AF',
    shadow: '#9CA3AF',
    nodeText: '#111827',
    railsText: '#6B7280',
    subtitleText: '#4B5563',
  },
] as const;
