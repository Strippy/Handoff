import React, { useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { pushNotification } from '@/lib/marketplace';
import { Loader2, Star } from 'lucide-react';

export default function ReviewForm({ deal, user, profile, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const iAmBuyer = deal.buyer_id === user.id;
  const revieweeId = iAmBuyer ? deal.seller_id : deal.buyer_id;
  const revieweeName = iAmBuyer ? deal.seller_name : deal.buyer_name;

  const [error, setError] = useState('');

  const submit = async () => {
    if (!rating) return;
    setSaving(true);
    setError('');
    // The server checks the deal is complete, you're in it, and you haven't reviewed it already.
    let created;
    try {
      const res = await api.functions.invoke('deal-room', { action: 'review', deal_id: deal.id, rating, body: body.trim() });
      created = res?.data?.review;
      if (!created) throw new Error('Could not post the review — try again.');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message);
      setSaving(false);
      return;
    }
    pushNotification({
      user_id: revieweeId,
      type: 'review',
      title: `${profile?.display_name || 'A builder'} reviewed you`,
      body: `${rating}/5${body.trim() ? ` — ${body.trim().slice(0, 80)}` : ''}`,
      link: '/profile',
      actor_name: profile?.display_name || 'A builder',
      actor_avatar: profile?.avatar_url || '',
      read: false,
    });
    setSaving(false);
    setBody('');
    setRating(0);
    onSubmitted(created);
  };

  return (
    <div className="card-soft space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">How did it go with {revieweeName}?</h2>
        <p className="text-xs text-muted-foreground">
          Reviews only exist for completed deals — that's what makes them worth reading.
        </p>
      </div>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`}>
            <Star
              className={`h-7 w-7 transition-colors ${
                value <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40 hover:text-amber-300'
              }`}
            />
          </button>
        ))}
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Was it as described? Was the handover clean? Would you deal with them again?"
        className="rounded-2xl"
      />

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <Button className="rounded-full px-6" disabled={!rating || saving} onClick={submit}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Post review
      </Button>
    </div>
  );
}