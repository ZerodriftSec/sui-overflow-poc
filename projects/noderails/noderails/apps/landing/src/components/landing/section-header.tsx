type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
  className?: string;
  eyebrowClassName?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'left',
  className = '',
  eyebrowClassName = 'text-indigo-600',
}: SectionHeaderProps) {
  const alignClass = align === 'center' ? 'mx-auto text-center' : 'text-left';

  return (
    <div className={`mb-12 max-w-2xl ${alignClass} ${className}`}>
      <p className={`font-mono text-xs uppercase tracking-[0.2em] font-semibold ${eyebrowClassName}`}>
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-zinc-600">{description}</p>
      ) : null}
    </div>
  );
}
