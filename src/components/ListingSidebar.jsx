import React from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import ReactionBar from '@/components/ReactionBar';
import CompletenessMeter from '@/components/CompletenessMeter';
import { dealMeta, formatPrice, initials } from '@/lib/marketplace';
import { BadgeCheck, Bookmark, BookmarkCheck, MessageCircle, Pencil, Users } from 'lucide-react';

export default function ListingSidebar({
  listing,
  seller,
  sellerLicensed,
  offersPaused,
  iAmSeller,
  blocked,
  busy,
  savedRecord,
  activeDeal,
  followRecord,
  reactionCounts,
  myReaction,
  offerable,
  onToggleSave,
  onToggleFollow,
  onToggleReaction,
  onMessage,
  onOpenOffer,
  onStatusChange,
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
      <div className="card-soft space-y-4 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {dealMeta(listing.deal_type).label}
          </p>
          <p className="font-display text-3xl font-bold tracking-tight">{formatPrice(listing)}</p>
          {listing.open_to_offers && listing.price > 0 && (
            <p className="text-xs text-muted-foreground">Open to offers</p>
          )}
        </div>

        {iAmSeller ? (
          <div className="space-y-2">
            <Button asChild variant="outline" className="w-full rounded-full">
              <Link to={`/listing/${listing.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" /> Edit listing
              </Link>
            </Button>
            {listing.status === 'reserved' && (
              <p className="rounded-2xl bg-secondary/70 px-3 py-2 text-xs text-muted-foreground">
                A deal is in progress. Finish or cancel it in the Deal Room to change this listing's status.
              </p>
            )}
            {listing.status === 'archived' && (
              <Button className="w-full rounded-full" disabled={busy} onClick={() => onStatusChange('active')}>
                Put back on the market
              </Button>
            )}
            {['active', 'archived'].includes(listing.status) && (
              <Button className="w-full rounded-full" variant={listing.status === 'archived' ? 'outline' : 'default'} disabled={busy} onClick={() => onStatusChange('sold')}>
                Mark as sold elsewhere
              </Button>
            )}
            {listing.status === 'active' && (
              <Button
                variant="ghost"
                className="w-full rounded-full text-muted-foreground"
                disabled={busy}
                onClick={() => onStatusChange('archived')}
              >
                Archive listing
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {offersPaused && (
              <p className="rounded-2xl bg-secondary/70 px-3 py-2 text-xs text-muted-foreground">
                This seller isn't taking offers right now. You can still message them.
              </p>
            )}
            {offerable && (
              <Button className="w-full rounded-full" disabled={busy} onClick={onOpenOffer}>
                {listing.deal_type === 'free_adoption' ? 'Request to adopt' : 'Make an offer'}
              </Button>
            )}
            {!blocked ? (
              <Button variant="outline" className="w-full rounded-full" disabled={busy} onClick={onMessage}>
                <MessageCircle className="mr-2 h-4 w-4" /> Message the builder
              </Button>
            ) : (
              <p className="rounded-2xl border border-border/70 bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                You've blocked this builder. Unblock them from their profile to talk again.
              </p>
            )}
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <Button variant="ghost" className="w-full justify-start rounded-full" disabled={busy} onClick={onToggleSave}>
            {savedRecord ? (
              <>
                <BookmarkCheck className="mr-2 h-4 w-4 text-primary" /> Saved
              </>
            ) : (
              <>
                <Bookmark className="mr-2 h-4 w-4" /> Save for later
              </>
            )}
          </Button>
          {activeDeal && (
            <Button asChild variant="ghost" className="w-full justify-start rounded-full">
              <Link to={`/deals/${activeDeal.id}`}>
                <Users className="mr-2 h-4 w-4 text-primary" /> Open the deal room
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="card-soft space-y-3 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What people think</p>
        <ReactionBar counts={reactionCounts} myReaction={myReaction} onToggle={onToggleReaction} disabled={busy} />
      </div>

      <div className="card-soft space-y-3 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Listed by</p>
        <Link to={`/builder/${listing.seller_id}`} className="flex items-center gap-3">
          <Avatar className="h-11 w-11 border border-border/70">
            <AvatarImage src={listing.seller_avatar || seller?.avatar_url} alt={listing.seller_name} />
            <AvatarFallback className="bg-secondary text-sm font-semibold">
              {initials(listing.seller_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold">
              {listing.seller_name || 'A builder'}
              {seller?.founding_builder && <span className="ml-2 text-xs text-primary">Founding Builder</span>}
              {sellerLicensed && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-sky-700 dark:text-sky-300" title="Holds a current Handoff seller licence">
                  <BadgeCheck className="h-3 w-3" /> Licensed seller
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{seller?.headline || 'Builder on Handoff'}</p>
          </div>
        </Link>
        {seller?.open_to_collab && (
          <p className="rounded-2xl bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">
            Open to collaborating on new projects
          </p>
        )}
        {!iAmSeller && (
          <Button variant="outline" size="sm" className="w-full rounded-full" disabled={busy} onClick={onToggleFollow}>
            {followRecord ? 'Following' : 'Follow this builder'}
          </Button>
        )}
      </div>

      {iAmSeller && (
        <div className="card-soft p-5">
          <CompletenessMeter listing={listing} showMissing />
        </div>
      )}
    </aside>
  );
}