import React from 'react';
import { REACTIONS } from '@/lib/marketplace';

export default function ReactionBar({ counts, myReaction, onToggle, disabled }) {
  return (
    <div className="flex flex-wrap gap-2">
      {REACTIONS.map((reaction) => {
        const active = myReaction === reaction.value;
        const count = counts?.[reaction.value] || 0;
        return (
          <button
            key={reaction.value}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(reaction.value)}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all disabled:opacity-50 ${
              active
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border/70 bg-card text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground'
            }`}
          >
            <span aria-hidden>{reaction.emoji}</span>
            <span>{reaction.label}</span>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
          </button>
        );
      })}
    </div>
  );
}