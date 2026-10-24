import React from 'react';
import { completeness } from '@/lib/marketplace';

export default function CompletenessMeter({ listing, showMissing = false }) {
  const { score, missing } = completeness(listing);
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-muted-foreground">Listing completeness</span>
        <span>{score}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${score}%` }} />
      </div>
      {showMissing && missing.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {missing.map((item) => (
            <li key={item}>Still missing: {item}</li>
          ))}
        </ul>
      )}
      {showMissing && missing.length === 0 && (
        <p className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Every section is filled in. Buyers love this.
        </p>
      )}
    </div>
  );
}