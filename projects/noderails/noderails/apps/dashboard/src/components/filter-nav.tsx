'use client';

import { cn } from '@/lib/utils';
import { Search, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

// ── Status filter pills (Stripe-like) ──

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterNavProps {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** Optional search bar */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  className?: string;
}

export function FilterNav({ options, value, onChange, search, className }: FilterNavProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)}>
      {/* Status pills */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
              value === opt.value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50',
            )}
          >
            {opt.label}
            {opt.count != null && (
              <span className={cn(
                'ml-1.5 text-[10px] tabular-nums',
                value === opt.value ? 'text-muted-foreground' : 'text-muted-foreground/60',
              )}>
                {opt.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search bar */}
      {search && (
        <div className={cn(
          'flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 transition-all',
          searchFocused ? 'border-primary/50 ring-2 ring-primary/10' : 'border-border',
        )}>
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={search.placeholder ?? 'Search...'}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none w-40"
          />
          {search.value && (
            <button onClick={() => search.onChange('')} className="text-muted-foreground/60 hover:text-foreground transition-colors">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reusable identifier display (first6...last6, copiable) ──

interface CopyableIdProps {
  value: string;
  /** How many chars to show at start and end */
  chars?: number;
  className?: string;
  label?: string;
}

export function CopyableId({ value, chars = 6, label, className }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const truncated = value.length > chars * 2 + 3
    ? `${value.slice(0, chars)}...${value.slice(-chars)}`
    : value;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => { e.stopPropagation(); copy(); }}
          className={cn(
            'inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors group cursor-pointer',
            className,
          )}
        >
          {label && <span className="text-muted-foreground/60 font-sans">{label}</span>}
          <span className={copied ? 'text-emerald-600' : ''}>{copied ? 'Copied!' : truncated}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-xs break-all">
        {copied ? 'Copied!' : value}
      </TooltipContent>
    </Tooltip>
  );
}
