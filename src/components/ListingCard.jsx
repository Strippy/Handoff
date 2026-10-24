import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import StagePill from '@/components/StagePill';
import DealPill from '@/components/DealPill';
import { completeness, formatPrice, initials } from '@/lib/marketplace';
import { gradeTone } from '@/components/ScanReport';
import { BadgeCheck, ShieldCheck, Sparkles } from 'lucide-react';

export default function ListingCard({ listing }) {
  const { score } = completeness(listing);
  return (
    <Link
      to={`/listing/${listing.id}`}
      className="card-soft group flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_56px_-36px_rgba(24,16,10,0.55)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {listing.cover_image ? (
          <Image
            src={listing.cover_image}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary via-background to-accent text-xs font-medium text-muted-foreground">
            No cover yet
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <StagePill stage={listing.stage} />
          {listing.feedback_wanted && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/90 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">
              <Sparkles className="h-3 w-3 text-primary" /> Feedback welcome
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-base font-semibold leading-snug tracking-tight">{listing.title}</h3>
          <span className="whitespace-nowrap font-display text-sm font-semibold text-primary">
            {formatPrice(listing)}
          </span>
        </div>

        {listing.tagline && <p className="line-clamp-2 text-sm text-muted-foreground">{listing.tagline}</p>}

        <div className="flex flex-wrap gap-1.5">
          <DealPill dealType={listing.deal_type} />
        </div>

        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          <Avatar className="h-6 w-6">
            <AvatarImage src={listing.seller_avatar} alt={listing.seller_name} />
            <AvatarFallback className="bg-secondary text-[10px] font-semibold">
              {initials(listing.seller_name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{listing.seller_name || 'A builder'}</span>
          {typeof listing.scan_score === 'number' ? (
            <span
              className={`ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ${gradeTone(listing.scan_score).bg} ${gradeTone(listing.scan_score).text}`}
              title={listing.scan_repo_verified ? 'Scanned from a GitHub repo the seller verifiably owns' : 'Handoff readiness from a scan of the real project files'}
            >
              {listing.scan_repo_verified ? <BadgeCheck className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />} Scan {listing.scan_score}
            </span>
          ) : (
            <span className="ml-auto whitespace-nowrap" title="How much of the listing the seller has filled in">
              {score}% filled in
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}