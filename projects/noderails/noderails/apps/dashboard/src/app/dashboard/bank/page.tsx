'use client';

import { Landmark } from 'lucide-react';
import { Badge } from '@/components/ui';

export default function BankPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Bank</h1>
        <Badge variant="outline">Coming Soon</Badge>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-20 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
          <Landmark className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Bank is coming soon</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Virtual accounts, settle-to-bank, and fiat treasury tools are on the way. Check back soon.
        </p>
      </div>
    </div>
  );
}
