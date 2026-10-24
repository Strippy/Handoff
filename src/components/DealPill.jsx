import React from 'react';
import { dealMeta } from '@/lib/marketplace';

export default function DealPill({ dealType, className = '' }) {
  const meta = dealMeta(dealType);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.pill} ${className}`}>
      {meta.label}
    </span>
  );
}