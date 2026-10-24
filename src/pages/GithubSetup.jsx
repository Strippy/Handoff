import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { githubError, githubManifestComplete, startGithubConnect } from '@/lib/github';
import { CheckCircle2, ExternalLink, GitBranch, Loader2, TriangleAlert } from 'lucide-react';

// GitHub returns the admin here after they click "Create GitHub App" in the one-click setup.
export default function GithubSetup() {
  const { user } = useAuth();
  const [state, setState] = useState({ phase: 'working', error: '', app: null });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !user) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const st = params.get('state');
    if (user.role !== 'admin') {
      setState({ phase: 'error', error: 'Only an app admin can finish GitHub setup.', app: null });
      return;
    }
    if (!code || !st) {
      setState({ phase: 'error', error: 'GitHub didn’t send a setup code. Start again from the Admin page.', app: null });
      return;
    }
    githubManifestComplete(code, st)
      .then((res) => {
        if (res.error) throw new Error(res.error);
        setState({ phase: 'done', error: '', app: res });
      })
      .catch((err) => setState({ phase: 'error', error: githubError(err), app: null }));
  }, [user]);

  return (
    <div className="mx-auto max-w-md py-16">
      <div className="card-soft space-y-4 p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          {state.phase === 'done' ? <CheckCircle2 className="h-6 w-6" /> : state.phase === 'error' ? <TriangleAlert className="h-6 w-6" /> : <GitBranch className="h-6 w-6" />}
        </span>
        {state.phase === 'working' && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving your GitHub App…
          </p>
        )}
        {state.phase === 'error' && (
          <>
            <p className="font-display text-lg font-semibold">Setup didn't finish</p>
            <p className="text-sm text-muted-foreground">{state.error}</p>
            <Button asChild className="rounded-full"><Link to="/admin">Back to Admin</Link></Button>
          </>
        )}
        {state.phase === 'done' && (
          <>
            <p className="font-display text-lg font-semibold">GitHub sign-in is live</p>
            <p className="text-sm text-muted-foreground">
              {state.app?.name || 'Your GitHub App'} is created with read-only access to code, and only on repos each builder picks.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button className="rounded-full" onClick={() => startGithubConnect('/sell')}>
                <GitBranch className="mr-2 h-4 w-4" /> Connect my GitHub
              </Button>
              {state.app?.html_url && (
                <Button asChild variant="outline" className="rounded-full">
                  <a href={state.app.html_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> View the app
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
