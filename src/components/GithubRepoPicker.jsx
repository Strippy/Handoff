import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { timeAgo } from '@/lib/marketplace';
import { githubError, githubRepos, githubStatus, openGithubInstall, startGithubConnect } from '@/lib/github';
import { BadgeCheck, GitBranch, Loader2, Lock, ScanSearch, Settings2 } from 'lucide-react';

/**
 * GitHub side of the scanner.
 * - Connected: pick one of the repos you've shared with Handoff (private ones too) and scan it.
 * - Not connected: one button to connect, plus the public-link fallback.
 */
export default function GithubRepoPicker({ busy, onScanRepo, onScanUrl }) {
  const [status, setStatus] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [url, setUrl] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await githubStatus();
        if (!active) return;
        setStatus(s);
        if (s.connected) {
          const r = await githubRepos();
          if (!active) return;
          if (r.connected === false) setStatus({ ...s, connected: false });
          setRepos(r.repos || []);
        }
      } catch (err) {
        if (active) setError(githubError(err));
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? repos.filter((r) => r.full_name.toLowerCase().includes(q)) : repos;
  }, [repos, query]);

  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      await startGithubConnect();
    } catch (err) {
      setError(githubError(err));
      setConnecting(false);
    }
  };

  const publicLink = (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && onScanUrl(url)}
          placeholder="https://github.com/you/your-project"
          className="rounded-2xl"
          disabled={busy}
        />
        <Button variant={status?.connected ? 'outline' : 'default'} className="rounded-full px-5" disabled={busy} onClick={() => onScanUrl(url)}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
          Scan link
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking GitHub…
      </p>
    );
  }

  if (!status?.configured) {
    return (
      <div className="space-y-2">
        {publicLink}
        <p className="text-xs text-muted-foreground">
          Public repos only for now. For private code, use the .zip upload.
          {status?.is_admin && ' (Admin: switch on GitHub sign-in from the Admin page to unlock private repos.)'}
        </p>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4">
          <p className="text-sm font-medium">Connect GitHub to scan private repos and get a verified-owner badge</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Read-only, and only on the repos you pick. GitHub confirms you own the repo, so buyers see
            “Verified repo owner” on your scan. You'll come straight back here.
          </p>
          <Button className="mt-3 rounded-full" disabled={connecting} onClick={connect}>
            {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
            Connect GitHub
          </Button>
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Or paste a public repo link</p>
        {publicLink}
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <BadgeCheck className="h-4 w-4 text-emerald-500" /> Connected as @{status.login}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto rounded-full text-xs" onClick={() => openGithubInstall(status.install_url)}>
          <Settings2 className="mr-1 h-3.5 w-3.5" /> Choose repos
        </Button>
      </div>

      {repos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          You haven't shared any repos with Handoff yet.
          <Button size="sm" className="ml-2 rounded-full" onClick={() => openGithubInstall(status.install_url)}>
            Choose repos
          </Button>
        </div>
      ) : (
        <>
          {repos.length > 6 && (
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter your repos…" className="rounded-2xl" />
          )}
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-2xl border border-border/70">
            {filtered.map((r) => (
              <li key={r.full_name}>
                <label className={`flex cursor-pointer items-center gap-3 p-3 text-sm transition-colors ${selected === r.full_name ? 'bg-primary/5' : 'hover:bg-secondary/50'}`}>
                  <input
                    type="radio"
                    name="gh-repo"
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    checked={selected === r.full_name}
                    onChange={() => setSelected(r.full_name)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {r.private && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />} {r.full_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.description || 'No description'}{r.pushed_at ? ` · updated ${timeAgo(r.pushed_at)}` : ''}
                    </p>
                  </div>
                  {r.role === 'owner' && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Owner</span>}
                  {r.role === 'collaborator' && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">Collaborator</span>}
                </label>
              </li>
            ))}
            {filtered.length === 0 && <li className="p-3 text-sm text-muted-foreground">No repos match “{query}”.</li>}
          </ul>
          <Button className="rounded-full px-5" disabled={busy || !selected} onClick={() => onScanRepo(selected)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
            {busy ? 'Reading the repo…' : selected ? `Scan ${selected.split('/')[1]}` : 'Pick a repo to scan'}
          </Button>
        </>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Scan a public repo by link instead</summary>
        <div className="mt-2">{publicLink}</div>
      </details>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
