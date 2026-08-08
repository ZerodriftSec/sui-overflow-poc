import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { NodeRailsLogo } from '@/components/noderails-logo';

const PDF_PATH = '/legal/noderails-aml-cft-policy.pdf';
const DOCUMENT_TITLE = 'AML / CFT Policy';

export const metadata: Metadata = {
  title: `${DOCUMENT_TITLE} | NodeRails`,
  robots: {
    index: false,
    follow: false,
  },
};

export default function CompliancePage() {
  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <Link href="/" className="shrink-0">
            <NodeRailsLogo withText className="h-auto w-[132px] sm:w-[180px]" />
          </Link>

          <div className="min-w-0 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-indigo-600 sm:text-[11px]">
              Legal
            </p>
            <p className="mt-1 truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              {DOCUMENT_TITLE}
            </p>
          </div>

          <a
            href={PDF_PATH}
            download="NodeRails-AML-CFT-Policy.pdf"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Download PDF</span>
            <span className="sm:hidden">PDF</span>
          </a>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <iframe
            title={DOCUMENT_TITLE}
            src={PDF_PATH}
            className="h-[calc(100vh-5.5rem)] min-h-[32rem] w-full flex-1 border-0 bg-slate-50"
          />
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          If the document does not load,{' '}
          <Link href={PDF_PATH} className="font-medium text-indigo-600 hover:text-indigo-700">
            open the PDF directly
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
