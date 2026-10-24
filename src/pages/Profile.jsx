import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { asItems, initials, loadMyProfile, pushNotification } from '@/lib/marketplace';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import ListingCard from '@/components/ListingCard';
import EmptyState from '@/components/EmptyState';
import ReportDialog from '@/components/ReportDialog';
import GithubProfileCard from '@/components/GithubProfileCard';
import { useToast } from '@/components/ui/use-toast';
import { BadgeCheck, ExternalLink, GitBranch, Loader2, Pencil, Star, Users } from 'lucide-react';

export default function Profile() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const targetId = id || user?.id;
  const isMe = targetId === user?.id;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [followers, setFollowers] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [followRecord, setFollowRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [githubIdentity, setGithubIdentity] = useState(null);

  // Server-verified GitHub link (only the server can write these).
  const loadGithub = () =>
    base44.entities.GithubIdentity.filter({ user_id: targetId }, { limit: 1 })
      .then((res) => setGithubIdentity(asItems(res)[0] || null))
      .catch(() => setGithubIdentity(null));

  useEffect(() => {
    if (targetId) loadGithub();
  }, [targetId]);

  useEffect(() => {
    if (!user?.id || !targetId) return;
    let active = true;
    setLoading(true);
    (async () => {
      const [profileRes, mine, listingRes, reviewRes, followerCount, dealRes, followRes] = await Promise.all([
        base44.entities.BuilderProfile.filter({ user_id: targetId }, { limit: 1 }),
        loadMyProfile(user.id),
        base44.entities.Listing.filter(
          { seller_id: targetId, status: { $ne: 'archived' } },
          { sort: '-created_date', limit: 24 }
        ),
        base44.entities.Review.filter({ reviewee_id: targetId }, { sort: '-created_date', limit: 30 }),
        base44.entities.Follow.count({ following_id: targetId }),
        base44.entities.Deal.filter(
          { $or: [{ buyer_id: targetId }, { seller_id: targetId }], status: 'completed' },
          { limit: 100 }
        ),
        base44.entities.Follow.filter({ follower_id: user.id, following_id: targetId }, { limit: 1 }),
      ]);
      if (!active) return;
      setProfile(asItems(profileRes)[0] || null);
      setMyProfile(mine);
      setListings(asItems(listingRes));
      setReviews(asItems(reviewRes));
      setFollowers(followerCount || 0);
      setCompleted(asItems(dealRes).length);
      setFollowRecord(asItems(followRes)[0] || null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [targetId, user?.id]);

  const myName = myProfile?.display_name || user?.full_name || 'Builder';
  const blocked = (myProfile?.blocked_ids || []).includes(targetId);

  const toggleFollow = async () => {
    setBusy(true);
    if (followRecord) {
      await base44.entities.Follow.delete(followRecord.id);
      setFollowRecord(null);
      setFollowers((count) => Math.max(0, count - 1));
    } else {
      const created = await base44.entities.Follow.create({ follower_id: user.id, following_id: targetId });
      setFollowRecord(created);
      setFollowers((count) => count + 1);
      pushNotification({
        user_id: targetId,
        type: 'follow',
        title: `${myName} started following you`,
        body: 'They will see your new listings first.',
        link: `/builder/${user.id}`,
        actor_name: myName,
        actor_avatar: myProfile?.avatar_url || '',
        read: false,
      });
    }
    setBusy(false);
  };

  const toggleBlock = async () => {
    if (!myProfile?.id) {
      toast({ title: 'Set up your profile first', description: 'You need a builder page before you can block anyone.' });
      return;
    }
    setBusy(true);
    const current = myProfile.blocked_ids || [];
    const next = blocked ? current.filter((blockId) => blockId !== targetId) : [...current, targetId];
    const updated = await base44.entities.BuilderProfile.update(myProfile.id, { blocked_ids: next });
    setMyProfile(updated);
    setBusy(false);
    toast({ title: blocked ? 'Unblocked' : 'Blocked', description: blocked ? 'You can talk to them again.' : 'You will not see their listings or messages.' });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return isMe ? (
      <EmptyState
        icon={Users}
        title="You don't have a builder page yet"
        body="Two minutes now means people know exactly who they're dealing with — and it earns you the Founding Builder badge if you're early."
        action={
          <Button asChild className="rounded-full px-6">
            <Link to="/welcome">Set up my builder page</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState icon={Users} title="No builder page here" body="This person hasn't set one up yet." />
    );
  }

  const average = reviews.length
    ? (reviews.reduce((total, review) => total + (review.rating || 0), 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className="space-y-8">
      <section className="card-soft space-y-5 p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar className="h-20 w-20 border border-border/70">
            <AvatarImage src={profile.avatar_url} alt={profile.display_name} />
            <AvatarFallback className="bg-secondary font-display text-2xl">{initials(profile.display_name)}</AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-3">
            <div>
              <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight">
                {profile.display_name}
                {profile.founding_builder && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <BadgeCheck className="h-3.5 w-3.5" /> Founding Builder
                  </span>
                )}
                {githubIdentity && (
                  <a
                    href={githubIdentity.html_url || `https://github.com/${githubIdentity.github_login}`}
                    target="_blank"
                    rel="noreferrer"
                    title="GitHub account verified by signing in with GitHub"
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    <GitBranch className="h-3.5 w-3.5" /> @{githubIdentity.github_login} <BadgeCheck className="h-3.5 w-3.5" />
                  </a>
                )}
              </h1>
              {profile.headline && <p className="mt-1 text-sm text-muted-foreground">{profile.headline}</p>}
              {profile.location && <p className="text-xs text-muted-foreground">{profile.location}</p>}
            </div>

            {profile.open_to_collab && (
              <span className="chip">
                <Users className="h-3 w-3 text-primary" /> Open to collaborating
              </span>
            )}

            {profile.bio && <p className="max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{profile.bio}</p>}

            {(profile.skills?.length > 0 || profile.tools?.length > 0) && (
              <div className="space-y-2">
                {profile.skills?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Skills</span>
                    {profile.skills.map((skill) => (
                      <span key={skill} className="chip">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
                {profile.tools?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Builds with</span>
                    {profile.tools.map((tool) => (
                      <span key={tool} className="chip">
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {profile.links?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.links.map((link) => (
                  <a
                    key={`${link.label}-${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="chip hover:border-primary/40 hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" /> {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {isMe ? (
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/welcome">
                  <Pencil className="mr-2 h-4 w-4" /> Edit profile
                </Link>
              </Button>
            ) : (
              <>
                <Button className="rounded-full" disabled={busy} onClick={toggleFollow}>
                  {followRecord ? 'Following' : 'Follow'}
                </Button>
                <Button variant="outline" className="rounded-full" disabled={busy} onClick={toggleBlock}>
                  {blocked ? 'Unblock' : 'Block'}
                </Button>
                <ReportDialog
                  targetType="builder"
                  targetId={targetId}
                  targetLabel={profile.display_name}
                  user={user}
                  profile={myProfile}
                />
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-5 sm:grid-cols-4">
          <div>
            <p className="font-display text-xl font-bold">{listings.length}</p>
            <p className="text-xs text-muted-foreground">projects</p>
          </div>
          <div>
            <p className="font-display text-xl font-bold">{completed}</p>
            <p className="text-xs text-muted-foreground">deals completed</p>
          </div>
          <div>
            <p className="font-display text-xl font-bold">{average || '—'}</p>
            <p className="text-xs text-muted-foreground">average review</p>
          </div>
          <div>
            <p className="font-display text-xl font-bold">{followers}</p>
            <p className="text-xs text-muted-foreground">followers</p>
          </div>
        </div>
      </section>

      {isMe && <GithubProfileCard onChange={loadGithub} />}

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {isMe ? 'Your projects' : `Projects from ${profile.display_name}`}
        </h2>
        {listings.length === 0 ? (
          <EmptyState
            icon={Users}
            title={isMe ? 'Nothing listed yet' : 'No projects listed yet'}
            body={
              isMe
                ? 'Your first listing is the whole point. Put something up — even an idea needs a home.'
                : 'Nothing live right now. Follow them and you will see it first.'
            }
            action={
              isMe ? (
                <Button asChild className="rounded-full">
                  <Link to="/sell">List a project</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">Reviews from finished deals</h2>
        {reviews.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No reviews yet"
            body="Reviews only appear after a completed deal — so every one of them means something."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {reviews.map((review) => (
              <li key={review.id} className="card-soft space-y-2 p-5">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={review.reviewer_avatar} alt={review.reviewer_name} />
                    <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                      {initials(review.reviewer_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{review.reviewer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {review.reviewer_role === 'buyer' ? 'bought' : 'sold'} {review.listing_title}
                    </p>
                  </div>
                  <span className="ml-auto inline-flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: review.rating || 0 }).map((_, index) => (
                      <Star key={index} className="h-3.5 w-3.5 fill-amber-400" />
                    ))}
                  </span>
                </div>
                {review.body && <p className="text-sm text-muted-foreground">{review.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}