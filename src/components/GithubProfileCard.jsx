import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { githubDisconnect, githubError, githubStatus, openGithubInstall, startGithubConnect } from '@/lib/github';
import { BadgeCheck, GitBranch, Loader2, Settings2, Unplug } from 'lucide-react';

// Your own profile: connect / manage / disconnect GitHub.
export default function GithubProfileCard({ onChange }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => githubStatus().then(setStatus).catch((err) => setError(githubError(err)));
  useEffect(() => { load(); }, []);

  if (!status?.configured) return null;

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(githubError(err));
    }
    setBusy(false);
  };

  return (
    <section className="card-soft flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        <GitBranch className="h-5 w-5" />
      </span>
      <div className="flex-1">
        {status.connected ? (
          <>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <BadgeCheck className="h-4 w-4 text-emerald-500" /> GitHub connected as @{status.login}
            </p>
            <p className="text-xs text-muted-foreground">Shown on your profile. Scans of repos you own get a verified-owner badge.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">Connect GitHub</p>
            <p className="text-xs text-muted-foreground">Read-only, only on repos you pick. Adds a verified GitHub badge and unlocks private-repo scans.</p>
          </>
        )}
        {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {status.connected ? (
          <>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => openGithubInstall(status.install_url)}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Choose repos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground"
              disabled={busy}
              onClick={() => run(async () => { await githubDisconnect(); await load(); onChange?.(); })}
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Unplug className="mr-1.5 h-3.5 w-3.5" />} Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" className="rounded-full" disabled={busy} onClick={() => run(() => startGithubConnect())}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <GitBranch className="mr-1.5 h-3.5 w-3.5" />} Connect GitHub
          </Button>
        )}
      </div>
    </section>
  );
}
