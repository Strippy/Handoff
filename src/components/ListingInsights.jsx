import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { onFreePlan, usePlan } from '@/lib/billing';
import { ProPill } from '@/components/ProGate';
import { BarChart3, Bookmark, Eye, HandCoins, Lock, MessageCircle, MessageSquareText, Sparkles } from 'lucide-react';

/** Seller-only numbers for one listing. Every figure is counted from real records. */
export default function ListingInsights({ listing, offers, questions, reactions }) {
  const plan = usePlan();
  const locked = onFreePlan(plan);
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    if (!plan || locked) return;
    let active = true;
    Promise.all([
      api.entities.SavedListing.count({ listing_id: listing.id }),
      api.entities.Conversation.count({ listing_id: listing.id }),
    ])
      .then(([saves, chats]) => active && setCounts({ saves: saves || 0, chats: chats || 0 }))
      .catch(() => active && setCounts({ saves: 0, chats: 0 }));
    return () => {
      active = false;
    };
  }, [listing.id, plan, locked]);

  const pending = offers.filter((o) => o.status === 'pending').length;
  const tiles = [
    { icon: Eye, label: 'Views', value: listing.views || 0, open: true },
    { icon: Bookmark, label: 'Saves', value: counts?.saves },
    { icon: MessageCircle, label: 'Chats started', value: counts?.chats },
    { icon: HandCoins, label: 'Offers', value: offers.length, sub: pending ? `${pending} waiting on you` : '' },
    { icon: MessageSquareText, label: 'Questions', value: questions.length },
    { icon: Sparkles, label: 'Reactions', value: reactions.length },
  ];

  return (
    <section className="card-soft space-y-4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <BarChart3 className="h-4 w-4 text-primary" /> Listing insights
        </h2>
        {plan?.pro_enabled && <ProPill />}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => {
          const hidden = locked && !t.open;
          return (
            <div key={t.label} className="rounded-2xl border border-border/60 p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {hidden ? <Lock className="h-5 w-5 text-muted-foreground/60" /> : t.value ?? '…'}
              </p>
              {!hidden && t.sub && <p className="text-xs font-medium text-primary">{t.sub}</p>}
            </div>
          );
        })}
      </div>
      {locked ? (
        <p className="text-sm text-muted-foreground">
          See how many people are saving, chatting about and making offers on your project with{' '}
          <Link to="/pro" className="font-medium text-primary underline-offset-2 hover:underline">
            Handoff Pro
          </Link>
          .
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Only you can see these. Views don’t count your own visits.</p>
      )}
    </section>
  );
}
