import { notFound } from 'next/navigation';
import { getPaymentIntent } from '@/lib/api';
import { CheckoutCard } from '@/components/checkout-card';
import { CheckoutWeb3Provider } from '@/components/checkout-web3-provider';

interface PageProps {
  params: Promise<{ intentId: string }>;
}

export default async function PayPage({ params }: PageProps) {
  const { intentId } = await params;
  const payment = await getPaymentIntent(intentId);

  if (!payment) {
    notFound();
  }

  return (
    <CheckoutWeb3Provider chains={[]}>
      <CheckoutCard payment={payment} />
    </CheckoutWeb3Provider>
  );
}
