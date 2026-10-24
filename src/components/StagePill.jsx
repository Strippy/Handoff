import React from 'react';
import { stageMeta } from '@/lib/marketplace';

export default function StagePill({ stage, className = '' }) {
  const meta = stageMeta(stage);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.pill} ${className}`}>
      {meta.label}
    </span>
  );
}