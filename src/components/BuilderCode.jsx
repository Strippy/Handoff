import React from 'react';
import { Button } from '@/components/ui/button';
import { BUILDER_CODE } from '@/lib/marketplace';
import { CheckCircle2, ScrollText } from 'lucide-react';

export default function BuilderCode({ accepted, onAccept, showAction = true }) {
  return (
    <div className="card-soft overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/60 bg-secondary/50 px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ScrollText className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">The Builder's Code</h2>
          <p className="text-xs text-muted-foreground">Six lines that keep this room friendly and worth trusting.</p>
        </div>
      </div>
      <ol className="space-y-3 px-5 py-5">
        {BUILDER_CODE.map((line, index) => (
          <li key={line} className="flex items-start gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">{line}</p>
          </li>
        ))}
      </ol>
      {showAction && (
        <div className="border-t border-border/60 px-5 py-4">
          {accepted ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> You've signed the code. Thank you.
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button className="rounded-full px-6" onClick={onAccept}>
                I'll build by this
              </Button>
              <p className="text-xs text-muted-foreground">One tap, no legalese. Be decent and be honest.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}