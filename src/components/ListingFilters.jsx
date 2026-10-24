import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CATEGORIES, CURRENCIES, DEAL_TYPES, STAGES } from '@/lib/marketplace';
import { Search, SlidersHorizontal, X } from 'lucide-react';

const QUICK = [
  { label: 'Needs finishing', patch: { deal_type: 'finish_it', stage: 'all' } },
  { label: 'Code-scanned', patch: { scanned: true } },
  { label: 'Open for feedback', patch: { feedback: true } },
  { label: 'Free to adopt', patch: { deal_type: 'free_adoption' } },
  { label: 'Already live or earning', patch: { stage: 'live' } },
  { label: 'Making money', patch: { stage: 'earning' } },
];

export default function ListingFilters({ value, onChange, onReset }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const activeCount = [
    value.stage !== 'all',
    value.deal_type !== 'all',
    value.category !== 'all',
    value.max,
    value.feedback,
    value.scanned,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search projects, stacks, tags…"
            className="h-12 rounded-2xl border-border/70 bg-card pl-10 text-sm"
          />
        </div>
        <Select value={value.sort} onValueChange={(sort) => set({ sort })}>
          <SelectTrigger className="h-12 w-full rounded-2xl border-border/70 bg-card sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-created_date">Newest first</SelectItem>
            <SelectItem value="price">Price: low to high</SelectItem>
            <SelectItem value="-price">Price: high to low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground sm:flex">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
        </span>

        <Select value={value.stage} onValueChange={(stage) => set({ stage })}>
          <SelectTrigger className="h-9 w-auto min-w-[9rem] rounded-full border-border/70 bg-card text-xs">
            <SelectValue placeholder="Any stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any stage</SelectItem>
            {STAGES.map((stage) => (
              <SelectItem key={stage.value} value={stage.value}>
                {stage.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.deal_type} onValueChange={(deal_type) => set({ deal_type })}>
          <SelectTrigger className="h-9 w-auto min-w-[10rem] rounded-full border-border/70 bg-card text-xs">
            <SelectValue placeholder="Any deal type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any deal type</SelectItem>
            {DEAL_TYPES.map((deal) => (
              <SelectItem key={deal.value} value={deal.value}>
                {deal.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.category} onValueChange={(category) => set({ category })}>
          <SelectTrigger className="h-9 w-auto min-w-[9rem] rounded-full border-border/70 bg-card text-xs">
            <SelectValue placeholder="Any kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any kind</SelectItem>
            {CATEGORIES.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.currency} onValueChange={(currency) => set({ currency })}>
          <SelectTrigger className="h-9 w-auto rounded-full border-border/70 bg-card text-xs">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any currency</SelectItem>
            {CURRENCIES.map((currency) => (
              <SelectItem key={currency} value={currency}>
                {currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={value.max}
          onChange={(e) => set({ max: e.target.value.replace(/[^0-9]/g, '') })}
          placeholder="Max price"
          inputMode="numeric"
          className="h-9 w-28 rounded-full border-border/70 bg-card text-xs"
        />

        {(activeCount > 0 || value.q) && (
          <Button variant="ghost" size="sm" className="h-9 rounded-full text-xs" onClick={onReset}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {QUICK.map((quick) => {
          const active = Object.entries(quick.patch).every(([key, val]) => value[key] === val);
          return (
            <button
              key={quick.label}
              onClick={() => onChange({ ...value, stage: 'all', deal_type: 'all', feedback: false, scanned: false, ...quick.patch })}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {quick.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}