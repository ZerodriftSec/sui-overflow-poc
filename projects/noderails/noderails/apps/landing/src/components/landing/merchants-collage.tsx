import { ArrowLeftRight, Coins, CreditCard, FileText, type LucideIcon } from 'lucide-react';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';

const merchantFeatures: {
  title: string;
  body: string;
  color: string;
  icon: LucideIcon;
  desktopClass: string;
  rotation: string;
}[] = [
  {
    title: 'Payment Links',
    body: 'Generate unique payment links to share via email, SMS, or chat. Customers can pay instantly with one click.',
    color: 'bg-blue-50 text-blue-600',
    icon: ArrowLeftRight,
    desktopClass: 'left-1/2 top-[1%] -translate-x-1/2',
    rotation: '-rotate-2',
  },
  {
    title: 'Hosted Checkout',
    body: 'Branded, embeddable checkout pages. Manage payments, compliance, and customer data all in one place.',
    color: 'bg-purple-50 text-purple-600',
    icon: CreditCard,
    desktopClass: 'right-[1%] top-1/2 -translate-y-1/2',
    rotation: 'rotate-2',
  },
  {
    title: 'Subscriptions',
    body: 'Build recurring revenue with automatic billing. Manage subscription cycles and customer lifecycle in real-time.',
    color: 'bg-indigo-50 text-indigo-600',
    icon: Coins,
    desktopClass: 'left-1/2 bottom-[1%] -translate-x-1/2',
    rotation: 'rotate-1',
  },
  {
    title: 'Invoices',
    body: 'Create and send crypto invoices with payment links. Track payment status and get automatic reminders.',
    color: 'bg-pink-50 text-pink-600',
    icon: FileText,
    desktopClass: 'left-[1%] top-1/2 -translate-y-1/2',
    rotation: '-rotate-1',
  },
];

function MerchantFeatureCard({
  title,
  body,
  color,
  icon: Icon,
  className = '',
  rotation = '',
}: {
  title: string;
  body: string;
  color: string;
  icon: LucideIcon;
  className?: string;
  rotation?: string;
}) {
  return (
    <div className={`nr-product-card w-full max-w-[240px] p-4 sm:p-5 ${rotation} ${className}`}>
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <h4 className="text-base font-semibold text-zinc-900">{title}</h4>
      <p className="mt-1 text-sm leading-relaxed text-zinc-600">{body}</p>
    </div>
  );
}

export function MerchantsCollage() {
  return (
    <>
      <div className="mx-auto max-w-4xl space-y-4 lg:hidden">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {merchantFeatures.slice(0, 2).map((item) => (
            <MerchantFeatureCard key={item.title} {...item} />
          ))}
        </div>

        <div className="relative py-2">
          <div
            className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-indigo-500/[0.06] blur-2xl"
            aria-hidden
          />
          <ScreenshotFrame
            src="/screenshots/payments-list.png"
            alt="NodeRails merchant dashboard showing payments, statuses, and filters"
            className="relative"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {merchantFeatures.slice(2).map((item) => (
            <MerchantFeatureCard key={item.title} {...item} />
          ))}
        </div>
      </div>

      <div className="relative mx-auto hidden h-[min(780px,78vw)] w-full max-w-6xl lg:block">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[92%] w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-indigo-200/70"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.04] blur-3xl"
          aria-hidden
        />

        <div className="absolute left-1/2 top-1/2 z-10 w-[min(62%,540px)] -translate-x-1/2 -translate-y-1/2">
          <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-indigo-500/[0.08] blur-2xl" aria-hidden />
          <ScreenshotFrame
            src="/screenshots/payments-list.png"
            alt="NodeRails merchant dashboard showing payments, statuses, and filters"
            className="relative shadow-[0_24px_60px_-24px_rgba(79,70,229,0.25)]"
          />
        </div>

        {merchantFeatures.map((item) => (
          <MerchantFeatureCard
            key={item.title}
            title={item.title}
            body={item.body}
            color={item.color}
            icon={item.icon}
            rotation={item.rotation}
            className={`absolute z-20 ${item.desktopClass}`}
          />
        ))}
      </div>
    </>
  );
}
