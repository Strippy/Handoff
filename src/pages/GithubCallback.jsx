import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  githubError, githubExchange, githubRepos, githubStatus, openGithubInstall, startGithubConnect,
  takeGithubFlow, takeGithubReturn,
} from '@/lib/github';
import { GitBranch, Loader2, TriangleAlert } from 'lucide-react';

// GitHub sends people here after signing in (code + state) and after choosing repos (installation_id).
export default function GithubCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [message, setMessage] = useState('Connecting your GitHub…');
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const ghError = params.get('error');
    const installationId = params.get('installation_id');
    const setupAction = params.get('setup_action');

    (async () => {
      try {
        if (ghError) {
          setError(ghError === 'access_denied' ? 'You cancelled the GitHub sign-in. No problem — nothing was connected.' : params.get('error_description') || ghError);
          return;
        }

        if (code) {
          const flow = takeGithubFlow();
          if (!flow || flow.state !== state) {
            setError('That GitHub sign-in link didn’t match this browser. Start the connection again from the page you were on.');
            return;
          }
          const result = await githubExchange(code);
          if (result.error) throw new Error(result.error);
          setMessage(`Connected as @${result.login}. Checking which repos you've shared…`);
          const repos = await githubRepos();
          if (!repos.installations) {
            const status = await githubStatus();
            if (status.install_url) {
              setMessage('Now pick which repos Handoff can read…');
              openGithubInstall(status.install_url, flow.returnTo || '/sell');
              return;
            }
          }
          toast({ title: `GitHub connected as @${result.login}`, description: 'Pick a repo in the scanner to verify it.' });
          navigate(flow.returnTo || '/sell', { replace: true });
          return;
        }

        if (installationId || setupAction) {
          const returnTo = takeGithubReturn() || '/sell';
          const status = await githubStatus();
          if (status.connected) {
            toast({ title: 'Repo access updated', description: 'Your shared repos are ready to scan.' });
            navigate(returnTo, { replace: true });
          } else {
            setMessage('One more step — signing you in with GitHub…');
            await startGithubConnect(returnTo);
          }
          return;
        }

        setError('Nothing to do here — this page is only used during GitHub sign-in.');
      } catch (err) {
        setError(githubError(err));
      }
    })();
  }, [navigate, toast]);

  return (
    <div className="mx-auto max-w-md py-16">
      <div className="card-soft space-y-4 p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          {error ? <TriangleAlert className="h-6 w-6" /> : <GitBranch className="h-6 w-6" />}
        </span>
        {error ? (
          <>
            <p className="font-display text-lg font-semibold">GitHub didn't connect</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button asChild className="rounded-full">
              <Link to="/sell">Back to listing a project</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-semibold">Almost there</p>
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {message}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
