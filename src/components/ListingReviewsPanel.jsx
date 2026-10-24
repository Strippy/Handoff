import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ReviewForm from '@/components/ReviewForm';
import { initials } from '@/lib/marketplace';
import { Star } from 'lucide-react';

export default function ListingReviewsPanel({
  reviews,
  averageRating,
  completedDeal,
  myReview,
  user,
  profile,
  onReviewed,
}) {
  if (!reviews.length && (!completedDeal || myReview)) return null;

  return (
    <div className="space-y-6">
      {reviews.length > 0 && (
        <div className="card-soft space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h2 className="font-display text-lg font-semibold tracking-tight">
              What other builders say
              {averageRating && <span className="text-muted-foreground"> · {averageRating}/5</span>}
            </h2>
          </div>
          <ul className="space-y-4">
            {reviews.slice(0, 4).map((review) => (
              <li key={review.id} className="rounded-2xl border border-border/70 bg-background/60 p-4">
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={review.reviewer_avatar} alt={review.reviewer_name} />
                    <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                      {initials(review.reviewer_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-semibold">{review.reviewer_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {review.reviewer_role === 'buyer' ? 'bought a project' : 'sold a project'}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: review.rating || 0 }).map((_, index) => (
                      <Star key={index} className="h-3.5 w-3.5 fill-amber-400" />
                    ))}
                  </span>
                </div>
                {review.body && <p className="mt-2 text-sm text-muted-foreground">{review.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {completedDeal && !myReview && (
        <ReviewForm deal={completedDeal} user={user} profile={profile} onSubmitted={onReviewed} />
      )}
    </div>
  );
}