import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { asItems, loadMyProfile } from '@/lib/marketplace';
import ListingCard from '@/components/ListingCard';
import ListingFilters from '@/components/ListingFilters';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import ProGate from '@/components/ProGate';
import { earlyAccessCutoff, usePlan } from '@/lib/billing';
import { Compass, Loader2, PlusCircle, Rocket } from 'lucide-react';

const PAGE_SIZE = 12;

const EMPTY_FILTERS = {
  q: '',
  stage: 'all',
  deal_type: 'all',
  category: 'all',
  currency: 'all',
  max: '',
  sort: '-created_date',
  feedback: false,
  scanned: false,
};

const buildQuery = (filters, early) => {
  const query = { status: 'active' };
  if (filters.stage !== 'all') query.stage = filters.stage;
  if (filters.deal_type !== 'all') query.deal_type = filters.deal_type;
  if (filters.category !== 'all') query.category = filters.category;
  if (filters.currency !== 'all') query.currency = filters.currency;
  if (filters.feedback) query.feedback_wanted = true;
  if (filters.scanned) query.scan_score = { $gte: 0 };
  if (filters.max) query.price = { $lte: Number(filters.max) };
  const text = filters.q.trim();
  if (text) {
    query.$or = [
      { title: { $regex: text, $options: 'i' } },
      { tagline: { $regex: text, $options: 'i' } },
      { description: { $regex: text, $options: 'i' } },
      { seller_name: { $regex: text, $options: 'i' } },
    ];
  }
  // Free plan (only while Pro is on): brand-new listings stay Pro-only for a while, except your own.
  if (early?.cutoff) {
    const opened = [{ created_date: { $lte: early.cutoff } }, { seller_id: early.userId }];
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: opened }];
      delete query.$or;
    } else {
      query.$or = opened;
    }
  }
  return query;
};

export default function Home() {
  const { user } = useAuth();
  const plan = usePlan();
  // { cutoff, userId } on the free plan while Pro is on; null otherwise
  const early = useMemo(() => {
    const cutoff = earlyAccessCutoff(plan);
    return cutoff ? { cutoff, userId: user?.id || '' } : null;
  }, [plan, user?.id]);
  const [earlyCount, setEarlyCount] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [listings, setListings] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [stats, setStats] = useState({ listings: 0, builders: 0, sold: 0 });

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const p = await loadMyProfile(user.id);
      setProfile(p);
      setProfileLoaded(true);
    })();
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      const [listed, builders, sold] = await Promise.all([
        api.entities.Listing.count({ status: 'active' }),
        api.entities.BuilderProfile.count({ user_id: { $exists: true } }),
        api.entities.Listing.count({ status: 'sold' }),
      ]);
      setStats({ listings: listed || 0, builders: builders || 0, sold: sold || 0 });
    })();
  }, []);

  useEffect(() => {
    if (!early) {
      setEarlyCount(0);
      return;
    }
    api.entities.Listing.count({ status: 'active', created_date: { $gt: early.cutoff }, seller_id: { $ne: early.userId } })
      .then((n) => setEarlyCount(n || 0))
      .catch(() => setEarlyCount(0));
  }, [early]);

  useEffect(() => {
    if (!plan) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await api.entities.Listing.filter(buildQuery(filters, early), {
        sort: filters.sort,
        limit: PAGE_SIZE,
      });
      if (!active) return;
      setListings(asItems(res));
      setCursor(res?.next_cursor || null);
      setHasMore(Boolean(res?.has_more));
      setLoading(false);
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters, early, plan]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await api.entities.Listing.filter(buildQuery(filters, early), {
      sort: filters.sort,
      limit: PAGE_SIZE,
      cursor,
    });
    setListings((prev) => [...prev, ...asItems(res)]);
    setCursor(res?.next_cursor || null);
    setHasMore(Boolean(res?.has_more));
    setLoadingMore(false);
  };

  const filtered = Object.keys(EMPTY_FILTERS).some((key) => filters[key] !== EMPTY_FILTERS[key]);

  return (
    <div className="space-y-8">
      <section className="card-soft relative overflow-hidden p-6 sm:p-10">
        <div className="relative max-w-2xl space-y-4">
          <span className="chip">
            <Rocket className="h-3 w-3 text-primary" /> The marketplace for builders
          </span>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            Buy, sell and finish real projects.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Pick up a polished app, take on a half-built idea someone ran out of steam on, or hand your own project to
            a builder who'll run with it. Every listing tells the honest story — what works, what doesn't, what's
            included.
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button asChild className="rounded-full px-6">
              <Link to="/sell">
                <PlusCircle className="mr-2 h-4 w-4" /> List a project
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full px-6">
              <Link to="/saved">
                <Compass className="mr-2 h-4 w-4" /> See what I've saved
              </Link>
            </Button>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            {stats.listings} projects listed · {stats.builders} builders here · {stats.sold} handed over. No sample
            listings, no fake reviews.
          </p>
        </div>
      </section>

      {profileLoaded && !profile && (
        <div className="card-soft flex flex-col gap-3 border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-base font-semibold">Welcome to Handoff</p>
            <p className="text-sm text-muted-foreground">
              Sign the Builder's Code and set up your builder page — it takes a minute and it's how people know who
              they're dealing with.
            </p>
          </div>
          <Button asChild className="rounded-full">
            <Link to="/welcome">Finish my profile</Link>
          </Button>
        </div>
      )}

      {earlyCount > 0 && (
        <ProGate
          title={`${earlyCount} new project${earlyCount === 1 ? ' is' : 's are'} in Pro early access`}
          body={`They open to everyone ${plan?.limits?.early_access_hours ?? 48} hours after listing. Pro builders see them now.`}
        />
      )}

      <section className="space-y-5">
        <ListingFilters value={filters} onChange={setFilters} onReset={() => setFilters(EMPTY_FILTERS)} />

        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Compass}
              title="Nothing matches those filters"
              body="Loosen a filter or two — or tell us what you're hunting for by listing what you're working on."
              action={
                <Button variant="outline" className="rounded-full" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Rocket}
              title="The shelves are empty — on purpose"
              body="Handoff launched with zero seed listings and zero fake stats. The first project here will be a real one: yours. List it, tell the honest story, and see who shows up."
              action={
                <Button asChild className="rounded-full px-6">
                  <Link to="/sell">
                    <PlusCircle className="mr-2 h-4 w-4" /> Be the first to list
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" className="rounded-full px-6" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Load more projects
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}