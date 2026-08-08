import Image from 'next/image';
import Link from 'next/link';

type StreamLineLogoProps = {
  className?: string;
  /** Show “Docs” beside the wordmark */
  withDocsLabel?: boolean;
  href?: string;
};

export function StreamLineLogo({
  className = '',
  withDocsLabel = true,
  href = '/',
}: StreamLineLogoProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 font-semibold tracking-tight text-fd-foreground ${className}`}
    >
      <Image
        src="/logo.png"
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-lg object-contain"
        priority
        aria-hidden
      />
      <span className="text-[15px]">
        StreamLine
        {withDocsLabel && (
          <span className="ml-1.5 font-normal text-fd-muted-foreground">
            Docs
          </span>
        )}
      </span>
    </Link>
  );
}
