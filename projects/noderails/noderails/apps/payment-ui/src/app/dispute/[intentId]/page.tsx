import { notFound } from 'next/navigation';
import { getDisputeWindow } from '@/lib/api';
import { DisputePortal } from '@/components/dispute-portal';

interface PageProps {
  params: Promise<{ intentId: string }>;
}

export default async function DisputePage({ params }: PageProps) {
  const { intentId } = await params;
  const windowInfo = await getDisputeWindow(intentId);

  if (!windowInfo) {
    notFound();
  }

  return <DisputePortal windowInfo={windowInfo} />;
}
