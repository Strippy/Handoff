import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export default function OfferDialog({ open, onOpenChange, listing, user, profile, parentOffer, onCreated }) {
  const [amount, setAmount] = useState(parentOffer?.amount ? String(parentOffer.amount) : '');
  const [message, setMessage] = useState('');
  const [timeline, setTimeline] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const iAmSeller = listing.seller_id === user?.id;
  const nonMonetary = ['collaborator', 'finish_it'].includes(listing.deal_type);
  const myName = profile?.display_name || user?.full_name || 'Builder';
  const amountNum = Number(amount);
  const wellUnderAsking =
    !iAmSeller && !nonMonetary && listing.price > 0 && amountNum > 0 && amountNum < listing.price * 0.5;

  const send = async () => {
    if (!message.trim()) {
      setError('Add a line or two so they know what you are proposing.');
      return;
    }
    setSending(true);
    setError('');
    const created = await base44.entities.Offer.create({
      listing_id: listing.id,
      listing_title: listing.title,
      listing_cover: listing.cover_image || '',
      buyer_id: iAmSeller ? parentOffer.buyer_id : user.id,
      buyer_name: iAmSeller ? parentOffer.buyer_name : myName,
      buyer_avatar: iAmSeller ? parentOffer.buyer_avatar || '' : profile?.avatar_url || '',
      seller_id: listing.seller_id,
      seller_name: listing.seller_name,
      amount: amount === '' ? 0 : Number(amount),
      currency: listing.currency || 'USD',
      message: message.trim(),
      timeline: timeline.trim(),
      status: 'pending',
      parent_offer_id: parentOffer?.id || '',
    });
    if (parentOffer?.id) {
      await base44.entities.Offer.update(parentOffer.id, { status: 'countered' });
    }
    setSending(false);
    onOpenChange(false);
    setAmount('');
    setMessage('');
    setTimeline('');
    onCreated(created);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            {parentOffer ? 'Send a counter-offer' : nonMonetary ? 'Propose how you would take it on' : 'Make an offer'}
          </DialogTitle>
          <DialogDescription>
            {listing.title} · {listaCurrencyLabel(listing)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{nonMonetary ? 'Amount (optional)' : 'Your offer'}</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder={listing.price ? String(listing.price) : '2500'}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Currency</Label>
              <div className="flex h-10 items-center rounded-2xl border border-input px-3 text-sm text-muted-foreground">
                {listing.currency || 'USD'}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Your message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="I'd take this on — I've shipped two similar planners. I can start next week."
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Timeline (optional)</Label>
            <Input
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              placeholder="Can start next Monday, done in 3 weeks"
              className="rounded-2xl"
            />
          </div>

          {wellUnderAsking && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              That's less than half the asking price. Totally fine to offer — offers well under asking just land better
              with a reason: what you'd need to fix, rebuild or pay to run it.
            </p>
          )}

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="rounded-full px-6" disabled={sending} onClick={send}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {parentOffer ? 'Send counter' : 'Send offer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function listaCurrencyLabel(listing) {
  if (listing.deal_type === 'free_adoption') return 'Free to adopt';
  if (!listing.price) return 'No set price';
  return `Asking ${listing.price} ${listing.currency || 'USD'}`;
}