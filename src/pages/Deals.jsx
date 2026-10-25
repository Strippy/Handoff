import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { asItems, formatAmount } from '@/lib/marketplace';
import { Image } from '@/components/ui/image';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2, Users } from 'lucide-react';

const STATUS_LABEL = {
  open: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function Deals() {
  const { user } = useAuth();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const res = await base44.entities.Deal.filter(
        { $or: [{ buyer_id: user.id }, { seller_id: user.id }] },
        { sort: '-created_date', limit: 50 }
      );
      if (!active) return;
      setDeals(asItems(res));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">My deals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every accepted offer lives here until the handover pack is ticked off — then reviews unlock for both sides.
        </p>
      </div>

      {deals.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No deals yet"
          body="When an offer you send or receive is accepted, the deal room opens here: escrow, code, assets, confirmation, sold."
          action={
            <Button asChild className="rounded-full">
              <Link to="/">Find a project</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {deals.map((deal) => {
            const iAmBuyer = deal.buyer_id === user.id;
            const counterparty = iAmBuyer ? deal.seller_name : deal.buyer_name;
            return (
              <li key={deal.id}>
                <Link
                  to={`/deals/${deal.id}`}
                  className="card-soft flex items-center gap-4 p-4 transition-all hover:-translate-y-0.5"
                >
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted">
                    {deal.listing_cover ? (
                      <Image src={deal.listing_cover} alt={deal.listing_title} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold">{deal.listing_title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {iAmBuyer ? 'Buying from' : 'Selling to'} {counterparty} · {formatAmount(deal.amount, deal.currency)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-primary">{STATUS_LABEL[deal.status] || deal.status}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}