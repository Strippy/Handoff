import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { loadMyProfile } from '@/lib/marketplace';
import BuilderCode from '@/components/BuilderCode';
import ProfileForm from '@/components/ProfileForm';
import { useToast } from '@/components/ui/use-toast';
import { BadgeCheck, Loader2 } from 'lucide-react';

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const existing = await loadMyProfile(user.id);
      if (!active) return;
      setProfile(existing);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const acceptCode = async () => {
    if (profile?.id) {
      const updated = await base44.entities.BuilderProfile.update(profile.id, { builders_code_accepted: true });
      setProfile(updated);
    }
    setAccepted(true);
    toast({ title: 'Welcome in', description: 'Now tell people who you are.' });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const showProfileForm = accepted || profile?.builders_code_accepted;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {profile ? 'Your builder page' : 'Welcome to Handoff'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {profile
            ? 'Keep it current — people read this before they message you.'
            : 'Handoff is a small, friendly room full of people who build things with AI. Here is how we behave, then a page so people know who they are dealing with.'}
        </p>
      </div>

      <div className="card-soft flex items-start gap-3 border-primary/30 bg-primary/5 p-5">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">Founding Builder badge</p>
          <p className="text-xs text-muted-foreground">
            The first 100 sellers get it automatically when they create their page. It is never for sale, and it never
            comes back.
          </p>
        </div>
      </div>

      <BuilderCode accepted={profile?.builders_code_accepted || accepted} onAccept={acceptCode} />

      {showProfileForm ? (
        <div className="card-soft space-y-6 p-5 sm:p-6">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {profile ? 'Edit your details' : 'Your builder page'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Skills, tools and links help the right person find you — including for collaborations.
            </p>
          </div>
          <ProfileForm
            profile={profile}
            user={user}
            onSaved={(saved) => {
              toast({
                title: profile ? 'Profile saved' : 'Builder page created',
                description: saved.founding_builder
                  ? 'You are a Founding Builder. Welcome aboard.'
                  : 'Now go list something.',
              });
              navigate('/profile');
            }}
          />
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Accept the code and your builder page opens up right here.
        </p>
      )}
    </div>
  );
}