import type { Metadata } from 'next';
import { DocsHeader, DocsSidebar, MobileSidebar } from '@/components/docs/sidebar';

export const metadata: Metadata = {
  title: 'Documentation NodeRails',
  description: 'NodeRails API documentation, SDK guides, and integration reference.',
};


export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff' }}>
      <DocsHeader />
      <DocsSidebar />
      <main
        className="docs-main"
        style={{
          paddingTop: '57px',
          minHeight: '100vh',
        }}
      >
        <article
          className="docs-content"
          style={{
            maxWidth: '820px',
            margin: '0 auto',
            padding: '40px 32px 80px',
          }}
        >
          {children}
        </article>
      </main>
      <MobileSidebar />
    </div>
  );
}
