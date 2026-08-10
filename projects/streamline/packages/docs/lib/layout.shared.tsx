import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

import { gitConfig } from './shared';

/** Shared options for DocsLayout — top nav replaced by SiteHeader. */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      enabled: false,
      title: 'StreamLine',
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [],
  };
}
