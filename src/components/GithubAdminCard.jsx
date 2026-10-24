import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { githubError, githubStatus, startGithubAppSetup } from '@/lib/github';
import { CheckCircle2, ExternalLink, GitBranch, Loader2 } from 'lucide-react';

// Admin-only: switch on GitHub sign-in with one click (GitHub App manifest flow).
export default function GithubAdminCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    githubStatus().then(setStatus).catch((err) => setError(githubError(err)));
  }, []);

  const setup = async () => {
    setBusy(true);
    setError('');
    try {
      await startGithubAppSetup();
    } catch (err) {
      setError(githubError(err));
      setBusy(false);
    }
  };

  return (
    <section className="card-soft space-y-3 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <GitBranch className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="font-display text-base font-semibold">GitHub sign-in</p>
          {!status ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</p>
          ) : status.configured ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Live — builders can scan private repos and get a verified-owner badge.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Off. One click creates a read-only GitHub App on your GitHub account (contents: read, nothing else) and wires
              it in — no keys to copy. You'll confirm on GitHub, then land back here.
            </p>
          )}
        </div>
      </div>
      {status && (
        <div className="flex flex-wrap gap-2 pl-12">
          {status.configured ? (
            status.app_url && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={status.app_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Manage the app on GitHub</a>
              </Button>
            )
          ) : (
            <Button size="sm" className="rounded-full" disabled={busy} onClick={setup}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <GitBranch className="mr-1.5 h-3.5 w-3.5" />}
              Set up GitHub sign-in
            </Button>
          )}
        </div>
      )}
      {error && <p className="pl-12 text-xs font-medium text-destructive">{error}</p>}
    </section>
  );
}
