'use client';

import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  glowColor?: 'violet' | 'emerald' | 'blue';
}

export function GlassCard({ 
  children, 
  className,
  hover = false,
  glow = false,
  glowColor = 'violet',
}: GlassCardProps) {
  const glowColorMap = {
    violet: 'shadow-violet-500/20',
    emerald: 'shadow-emerald-500/20',
    blue: 'shadow-blue-500/20',
  };

  return (
    <motion.div
      className={clsx(
        'relative overflow-hidden rounded-2xl',
        'bg-white/80 dark:bg-white/5',
        'backdrop-blur-xl backdrop-saturate-150',
        'border border-white/20 dark:border-white/10',
        'shadow-[0_8px_32px_rgba(0,0,0,0.08)]',
        hover && 'transition-all duration-300 hover:shadow-[0_16px_48px_rgba(0,0,0,0.12)] hover:border-white/30',
        glow && `hover:shadow-[0_0_40px_8px] ${glowColorMap[glowColor]}`,
        className
      )}
      initial={hover ? { y: 0 } : undefined}
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
    >
      {/* Inner glow effect */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-transparent" />
      
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

export function GlassPanel({ 
  children, 
  className,
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-3xl',
        'bg-gradient-to-br from-slate-900/95 via-slate-900/98 to-slate-950',
        'backdrop-blur-2xl',
        'border border-white/[0.08]',
        'shadow-[0_0_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]',
        className
      )}
    >
      {/* Subtle inner border highlight */}
      <div className="pointer-events-none absolute inset-[1px] rounded-[23px] bg-gradient-to-br from-white/[0.03] via-transparent to-transparent" />
      
      <div className="relative z-10">{children}</div>
    </div>
  );
}
