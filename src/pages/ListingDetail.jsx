import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import {
  asItems,
  findOrCreateConversation,
  formatAmount,
  loadMyProfile,
  pushNotification,
  stageMeta,
  timeAgo,
} from '@/lib/marketplace';
import MediaGallery from '@/components/MediaGallery';
import HonestyDossier from '@/components/HonestyDossier';
import QuestionThread from '@/components/QuestionThread';
import OfferDialog from '@/components/OfferDialog';
import ReportDialog from '@/components/ReportDialog';
import StagePill from '@/components/StagePill';
import DealPill from '@/components/DealPill';
import EmptyState from '@/components/EmptyState';
import ListingSidebar from '@/components/ListingSidebar';
import ListingOffersPanel from '@/components/ListingOffersPanel';
import ListingReviewsPanel from '@/components/ListingReviewsPanel';
import ScanReport from '@/components/ScanReport';
import ListingInsights from '@/components/ListingInsights';
import ProGate, { LicenceGate } from '@/components/ProGate';
import { earlyAccessLeft, sellerLicence, usePlan } from '@/lib/billing';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Crown, Eye, Loader2, Share2, Sparkles } from 'lucide-react';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const plan = usePlan();

  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState(null);
  const [seller, setSeller] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [savedRecord, setSavedRecord] = useState(null);
  const [followRecord, setFollowRecord] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [offers, setOffers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [sellerReviews, setSellerReviews] = useState([]);
  const [myReview, setMyReview] = useState(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [counterTarget, setCounterTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(null);
  const [sellerLic, setSellerLic] = useState({ enabled: false, licensed: true });

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const found = await base44.entities.Listing.get(id);
      if (!active) return;
      setListing(found);

      const iAmSeller = found.seller_id === user.id;
      const [profile, sellerRes, reactionRes, savedRes, followRes, questionRes, offerRes, dealRes, reviewRes, myReviewRes] =
        await Promise.all([
          loadMyProfile(user.id),
          base44.entities.BuilderProfile.filter({ user_id: found.seller_id }, { limit: 1 }),
          base44.entities.Reaction.filter({ listing_id: found.id }, { limit: 500 }),
          base44.entities.SavedListing.filter({ user_id: user.id, listing_id: found.id }, { limit: 1 }),
          base44.entities.Follow.filter({ follower_id: user.id, following_id: found.seller_id }, { limit: 1 }),
          base44.entities.Question.filter({ listing_id: found.id }, { sort: '-created_date', limit: 50 }),
          base44.entities.Offer.filter(
            iAmSeller ? { listing_id: found.id } : { listing_id: found.id, buyer_id: user.id },
            { sort: '-created_date', limit: 50 }
          ),
          base44.entities.Deal.filter({
            listing_id: found.id,
            $or: [{ buyer_id: user.id }, { seller_id: user.id }],
          }),
          base44.entities.Review.filter({ reviewee_id: found.seller_id }, { sort: '-created_date', limit: 20 }),
          base44.entities.Review.filter({ listing_id: found.id, reviewer_id: user.id }, { limit: 1 }),
        ]);
      if (!active) return;

      setMyProfile(profile);
      setSeller(asItems(sellerRes)[0] || null);
      setReactions(asItems(reactionRes));
      setSavedRecord(asItems(savedRes)[0] || null);
      setFollowRecord(asItems(followRes)[0] || null);
      setQuestions(asItems(questionRes));
      setOffers(asItems(offerRes));
      setDeals(asItems(dealRes));
      setSellerReviews(asItems(reviewRes));
      setMyReview(asItems(myReviewRes)[0] || null);
      setLoading(false);

      if (found.scan_id) {
        base44.entities.ProjectScan.get(found.scan_id)
          .then((s) => {
            // only trust a scan the server attached for this seller
            if (active && s && s.owner_id === found.seller_id && (s.published || iAmSeller)) setScan(s);
          })
          .catch(() => {});
      }

      base44.functions.invoke('listing-sync', { action: 'view', listing_id: found.id }).catch(() => {});
      sellerLicence(found.seller_id).then((lic) => active && lic && setSellerLic(lic));
    })();
    return () => {
      active = false;
    };
  }, [id, user?.id]);

  const myName = myProfile?.display_name || user?.full_name || 'Builder';
  const iAmSeller = listing?.seller_id === user?.id;
  const blocked = (myProfile?.blocked_ids || []).includes(listing?.seller_id);
  const sellerLicensed = Boolean(sellerLic.enabled && sellerLic.licensed);
  // A lapsed licence keeps the listing up, but a for-sale listing can't take new offers until it's renewed.
  const offersPaused = Boolean(sellerLic.enabled && !sellerLic.licensed && ['full_sale', 'license'].includes(listing?.deal_type));

  const reactionCounts = useMemo(() => {
    const counts = {};
    reactions.forEach((reaction) => {
      counts[reaction.type] = (counts[reaction.type] || 0) + 1;
    });
    return counts;
  }, [reactions]);

  const myReaction = reactions.find((reaction) => reaction.user_id === user?.id)?.type || null;
  const averageRating = sellerReviews.length
    ? (sellerReviews.reduce((total, review) => total + (review.rating || 0), 0) / sellerReviews.length).toFixed(1)
    : null;
  const activeDeal = deals.find((deal) => deal.status === 'open');
  const completedDeal = deals.find((deal) => deal.status === 'completed');

  const toggleSave = async () => {
    setBusy(true);
    if (savedRecord) {
      await base44.entities.SavedListing.delete(savedRecord.id);
      setSavedRecord(null);
      toast({ title: 'Removed from saved' });
    } else {
      const created = await base44.entities.SavedListing.create({ user_id: user.id, listing_id: listing.id });
      setSavedRecord(created);
      toast({ title: 'Saved for later' });
    }
    setBusy(false);
  };

  const toggleFollow = async () => {
    setBusy(true);
    if (followRecord) {
      await base44.entities.Follow.delete(followRecord.id);
      setFollowRecord(null);
    } else {
      const created = await base44.entities.Follow.create({ follower_id: user.id, following_id: listing.seller_id });
      setFollowRecord(created);
      pushNotification({
        user_id: listing.seller_id,
        type: 'follow',
        title: `${myName} started following you`,
        body: 'They will see your new listings first.',
        link: `/builder/${user.id}`,
        actor_name: myName,
        actor_avatar: myProfile?.avatar_url || '',
        read: false,
      });
      toast({ title: `Following ${listing.seller_name || 'this builder'}` });
    }
    setBusy(false);
  };

  const toggleReaction = async (type) => {
    if (busy) return;
    setBusy(true);
    let next = reactions;
    const mine = reactions.find((reaction) => reaction.user_id === user.id);
    if (mine) {
      await base44.entities.Reaction.delete(mine.id);
      next = reactions.filter((reaction) => reaction.id !== mine.id);
    }
    if (mine?.type === type) {
      setReactions(next);
    } else {
      const created = await base44.entities.Reaction.create({
        listing_id: listing.id,
        user_id: user.id,
        user_name: myName,
        type,
      });
      setReactions([...next, created]);
      if (type === 'could_finish' && listing.seller_id !== user.id) {
        pushNotification({
          user_id: listing.seller_id,
          type: 'reaction',
          title: `${myName} could finish ${listing.title}`,
          body: 'Someone thinks they can take this over the line.',
          link: `/listing/${listing.id}`,
          actor_name: myName,
          actor_avatar: myProfile?.avatar_url || '',
          read: false,
        });
      }
    }
    setBusy(false);
  };

  const messageSeller = async () => {
    setBusy(true);
    const conversation = await findOrCreateConversation({
      me: user.id,
      otherId: listing.seller_id,
      listing,
      myName,
      myAvatar: myProfile?.avatar_url || '',
    });
    setBusy(false);
    navigate(`/messages/${conversation.id}`);
  };

  const respondToOffer = async (offer, status) => {
    setBusy(true);
    await base44.entities.Offer.update(offer.id, { status });
    setOffers(offers.map((item) => (item.id === offer.id ? { ...item, status } : item)));
    const target = iAmSeller ? offer.buyer_id : listing.seller_id;
    pushNotification({
      user_id: target,
      type: 'offer',
      title:
        status === 'withdrawn'
          ? `${myName} withdrew their offer`
          : status === 'declined'
            ? 'Your offer was declined'
            : 'Your offer was updated',
      body: `${listing.title} · ${formatAmount(offer.amount, offer.currency)}`,
      link: `/listing/${listing.id}`,
      actor_name: myName,
      read: false,
    });
    setBusy(false);
  };

  const acceptOffer = async (offer) => {
    setBusy(true);
    // The server checks who may accept, that the amount hasn't changed, and the seller licence.
    let deal;
    try {
      const res = await base44.functions.invoke('deal-room', {
        action: 'accept_offer',
        offer_id: offer.id,
        expected_amount: offer.amount,
      });
      deal = res?.data?.deal;
      if (!deal) throw new Error('Could not open the deal — try again.');
    } catch (err) {
      setBusy(false);
      toast({ title: 'Couldn’t accept that offer', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
      return;
    }
    const counterparty = iAmSeller ? offer.buyer_id : listing.seller_id;
    pushNotification({
      user_id: counterparty,
      type: 'deal',
      title: 'Your offer was accepted',
      body: `Open the deal room for ${listing.title} and work through the handover pack.`,
      link: `/deals/${deal.id}`,
      actor_name: myName,
      actor_avatar: myProfile?.avatar_url || '',
      read: false,
    });
    setBusy(false);
    navigate(`/deals/${deal.id}`);
  };

  const updateListingStatus = async (status) => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke('listing-sync', { action: 'set_status', listing_id: listing.id, status });
      setListing({ ...listing, ...(res?.data?.listing || { status }) });
      toast({ title: status === 'archived' ? 'Listing archived' : status === 'active' ? 'Back on the market' : 'Listing marked sold' });
    } catch (err) {
      toast({ title: 'Couldn’t change that', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const share = async () => {
    const url = `${window.location.origin}/listing/${listing.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: 'Send it to whoever needs to see this.' });
    } catch (error) {
      toast({ title: 'Copy this link', description: url });
    }
  };

  if (loading || !plan) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <EmptyState
        icon={Eye}
        title="That listing is gone"
        body="It may have been archived or handed over already. Plenty more where that came from."
        action={
          <Button asChild className="rounded-full">
            <Link to="/">Back to browse</Link>
          </Button>
        }
      />
    );
  }

  const stage = stageMeta(listing.stage);
  const offerable = !iAmSeller && listing.status !== 'sold' && listing.status !== 'archived' && !offersPaused;
  const earlyHours = iAmSeller || activeDeal ? 0 : earlyAccessLeft(plan, listing);

  if (earlyHours > 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ← Back to browse
        </Link>
        <div className="card-soft space-y-3 p-6 text-center sm:p-8">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
            <Crown className="h-6 w-6" />
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            <StagePill stage={listing.stage} />
            <DealPill dealType={listing.deal_type} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{listing.title}</h1>
          {listing.tagline && <p className="text-muted-foreground">{listing.tagline}</p>}
          <p className="text-sm text-muted-foreground">
            Listed {timeAgo(listing.created_date)} — Pro builders get the first look. It opens to everyone in about{' '}
            {earlyHours} hour{earlyHours === 1 ? '' : 's'}.
          </p>
        </div>
        <ProGate title="See new projects the moment they’re listed" body={`Pro builders get a ${plan.limits?.early_access_hours ?? 48}-hour head start on every new listing.`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ← Back to browse
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={share}>
            <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
          </Button>
          {!iAmSeller && (
            <ReportDialog
              targetType="listing"
              targetId={listing.id}
              targetLabel={listing.title}
              user={user}
              profile={myProfile}
            />
          )}
        </div>
      </div>

      <MediaGallery listing={listing} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StagePill stage={listing.stage} />
              <DealPill dealType={listing.deal_type} />
              {listing.status === 'reserved' && <span className="chip">Deal in progress</span>}
              {listing.status === 'sold' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200">
                  Sold
                </span>
              )}
              {listing.feedback_wanted && (
                <span className="chip">
                  <Sparkles className="h-3 w-3 text-primary" /> Open for feedback
                </span>
              )}
            </div>

            <div>
              <h1 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
                {listing.title}
              </h1>
              {listing.tagline && <p className="mt-2 text-base text-muted-foreground">{listing.tagline}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> {(listing.views || 0) + (iAmSeller ? 0 : 1)} views
              </span>
              <span>
                {stage.label} · {stage.hint}
              </span>
              <span>Listed {timeAgo(listing.created_date)}</span>
            </div>
          </div>

          <div className="card-soft space-y-4 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold tracking-tight">The story</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {listing.description || 'The seller has not written a story yet.'}
            </p>
            {listing.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {listing.tags.map((tag) => (
                  <span key={tag} className="chip">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <HonestyDossier listing={listing} />

          {scan ? (
            <ScanReport scan={scan} mode={iAmSeller ? 'owner' : 'public'} />
          ) : (
            iAmSeller && (
              <div className="card-soft flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-base font-semibold">Add a code scan</p>
                  <p className="text-sm text-muted-foreground">
                    Upload a .zip or GitHub link and buyers get a real score, the stack, and what's connected — straight from your files.
                  </p>
                </div>
                <Button asChild className="rounded-full">
                  <Link to={`/listing/${listing.id}/edit`}>Scan my project</Link>
                </Button>
              </div>
            )
          )}

          {iAmSeller && offersPaused && listing.status === 'active' && (
            <LicenceGate
              title="Your seller licence has lapsed"
              body="This listing stays up, but buyers can't make offers until you renew. Deals already in progress still finish."
            />
          )}

          {iAmSeller && (
            <ListingInsights listing={listing} offers={offers} questions={questions} reactions={reactions} />
          )}

          <ListingOffersPanel
            listing={listing}
            user={user}
            offers={offers}
            deals={deals}
            iAmSeller={iAmSeller}
            busy={busy}
            onAccept={acceptOffer}
            onDecline={(offer) => respondToOffer(offer, 'declined')}
            onWithdraw={(offer) => respondToOffer(offer, 'withdrawn')}
            onCounter={(offer) => setCounterTarget(offer)}
          />

          <QuestionThread
            listing={listing}
            questions={questions}
            user={user}
            profile={myProfile}
            onChanged={setQuestions}
          />

          <ListingReviewsPanel
            reviews={sellerReviews}
            averageRating={averageRating}
            completedDeal={completedDeal}
            myReview={myReview}
            user={user}
            profile={myProfile}
            onReviewed={(review) => setMyReview(review)}
          />
        </div>

        <ListingSidebar
          listing={listing}
          seller={seller}
          sellerLicensed={sellerLicensed}
          offersPaused={offersPaused && !iAmSeller}
          iAmSeller={iAmSeller}
          blocked={blocked}
          busy={busy}
          savedRecord={savedRecord}
          activeDeal={activeDeal}
          followRecord={followRecord}
          reactionCounts={reactionCounts}
          myReaction={myReaction}
          offerable={offerable}
          onToggleSave={toggleSave}
          onToggleFollow={toggleFollow}
          onToggleReaction={toggleReaction}
          onMessage={messageSeller}
          onOpenOffer={() => setOfferOpen(true)}
          onStatusChange={updateListingStatus}
        />
      </div>

      <OfferDialog
        open={offerOpen}
        onOpenChange={setOfferOpen}
        listing={listing}
        user={user}
        profile={myProfile}
        onCreated={(created) => setOffers([created, ...offers])}
      />
      <OfferDialog
        open={Boolean(counterTarget)}
        onOpenChange={(next) => !next && setCounterTarget(null)}
        listing={listing}
        user={user}
        profile={myProfile}
        parentOffer={counterTarget}
        onCreated={(created) => {
          setOffers([
            created,
            ...offers.map((item) => (item.id === counterTarget?.id ? { ...item, status: 'countered' } : item)),
          ]);
          setCounterTarget(null);
        }}
      />
    </div>
  );
}