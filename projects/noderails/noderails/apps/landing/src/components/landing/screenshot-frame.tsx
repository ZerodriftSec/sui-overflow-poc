import Image from 'next/image';

interface ScreenshotFrameProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
}

/** Full-width screenshot with natural aspect ratio (no cropping). */
export function ScreenshotFrame({
  src,
  alt,
  width = 1708,
  height = 885,
  priority = false,
  className = '',
}: ScreenshotFrameProps) {
  return (
    <div className={`nr-panel overflow-hidden p-2 shadow-[var(--shadow-card-lg)] ${className}`}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-full rounded-xl"
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1200px"
      />
    </div>
  );
}
