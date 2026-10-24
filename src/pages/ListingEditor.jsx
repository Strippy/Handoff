import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { loadMyProfile } from '@/lib/marketplace';
import ListingForm from '@/components/ListingForm';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ShieldAlert } from 'lucide-react';

export default function ListingEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const p = await loadMyProfile(user.id);
      if (!active) return;
      setProfile(p);
      if (id) {
        const found = await base44.entities.Listing.get(id);
        if (!active) return;
        if (found.seller_id !== user.id) {
          setDenied(true);
        } else {
          setListing(found);
        }
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id, user?.id]);

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (denied) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="That listing isn't yours"
        body="Only the builder who listed a project can edit it."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {listing ? 'Edit your listing' : 'List a project'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {listing
            ? 'Change anything as things move on — buyers can see updates immediately.'
            : 'Be honest about what works and what doesn\u2019t. That is the whole trust engine of this place.'}
        </p>
      </div>

      <ListingForm
        initial={listing}
        user={user}
        profile={profile}
        onSaved={(saved) => {
          toast({
            title: listing ? 'Listing updated' : 'Project listed',
            description: listing ? 'Buyers will see your changes now.' : 'Nice one — now go tell someone about it.',
          });
          navigate(`/listing/${saved.id}`);
        }}
      />
    </div>
  );
}