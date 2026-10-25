import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { asItems, initials } from '@/lib/marketplace';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import ListingCard from '@/components/ListingCard';
import EmptyState from '@/components/EmptyState';
import { Bookmark, Loader2, Users } from 'lucide-react';

export default function Saved() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savedListings, setSavedListings] = useState([]);
  const [followRows, setFollowRows] = useState([]);
  const [followedBuilders, setFollowedBuilders] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const [savedRes, followRes] = await Promise.all([
        base44.entities.SavedListing.filter({ user_id: user.id }, { sort: '-created_date', limit: 100 }),
        base44.entities.Follow.filter({ follower_id: user.id }, { sort: '-created_date', limit: 200 }),
      ]);
      if (!active) return;
      const savedIds = asItems(savedRes).map((row) => row.listing_id);
      const follows = asItems(followRes);
      const followIds = follows.map((row) => row.following_id);
      const [listingRes, profileRes] = await Promise.all([
        savedIds.length ? base44.entities.Listing.filter({ id: { $in: savedIds } }, { limit: 100 }) : [],
        followIds.length ? base44.entities.BuilderProfile.filter({ user_id: { $in: followIds } }, { limit: 100 }) : [],
      ]);
      if (!active) return;
      setSavedListings(asItems(listingRes));
      setFollowRows(follows);
      setFollowedBuilders(asItems(profileRes));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const unfollow = async (userId) => {
    const row = followRows.find((item) => item.following_id === userId);
    if (!row) return;
    setBusy(true);
    await base44.entities.Follow.delete(row.id);
    setFollowRows(followRows.filter((item) => item.id !== row.id));
    setFollowedBuilders(followedBuilders.filter((profile) => profile.user_id !== userId));
    setBusy(false);
  };

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
        <h1 className="font-display text-2xl font-bold tracking-tight">Your shelf</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Projects you're keeping an eye on, and the builders you want to hear from first.
        </p>
      </div>

      <Tabs defaultValue="saved">
        <TabsList className="rounded-full">
          <TabsTrigger value="saved" className="rounded-full">
            Saved
          </TabsTrigger>
          <TabsTrigger value="following" className="rounded-full">
            Following
          </TabsTrigger>
        </TabsList>

        <TabsContent value="saved" className="mt-6">
          {savedListings.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="Nothing saved yet"
              body="Tap save on any listing and it lands here — useful when you are weighing up two projects."
              action={
                <Button asChild className="rounded-full">
                  <Link to="/">Browse projects</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {savedListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="following" className="mt-6">
          {followedBuilders.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Not following anyone yet"
              body="Follow a builder and their next project shows up in your feed of favourites."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {followedBuilders.map((profile) => (
                <li key={profile.id} className="card-soft flex items-center gap-3 p-4">
                  <Avatar className="h-11 w-11 border border-border/70">
                    <AvatarImage src={profile.avatar_url} alt={profile.display_name} />
                    <AvatarFallback className="bg-secondary text-sm font-semibold">
                      {initials(profile.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Link to={`/builder/${profile.user_id}`} className="truncate font-display text-sm font-semibold hover:text-primary">
                      {profile.display_name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{profile.headline || 'Builder on Handoff'}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={busy}
                    onClick={() => unfollow(profile.user_id)}
                  >
                    Unfollow
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}