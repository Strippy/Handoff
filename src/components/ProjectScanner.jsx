import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import ScanReport from '@/components/ScanReport';
import GithubRepoPicker from '@/components/GithubRepoPicker';
import ProGate from '@/components/ProGate';
import { loadPlan, onFreePlan, remaining, usePlan } from '@/lib/billing';
import { FileArchive, GitBranch, Loader2, Lock, RefreshCw, ScanSearch, UploadCloud, Wand2 } from 'lucide-react';

const MAX_ZIP_MB = 50;

const errorText = (err) =>
  err?.response?.data?.error || err?.message || 'Something went wrong — try again in a moment.';

/**
 * Upload a .zip or paste a public GitHub link → server scans it → report + one-click fill.
 * onScanned(scan, privateFindings) keeps the latest scan in the parent form.
 * onApply(scan) fills blank listing fields from the scan.
 */
export default function ProjectScanner({ scan, privateFindings, onScanned, onApply }) {
  const fileRef = useRef(null);
  const [tab, setTab] = useState('zip');
  const [phase, setPhase] = useState('idle'); // idle | uploading | scanning
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [applied, setApplied] = useState(false);
  const plan = usePlan();
  const scansLeft = remaining(plan, 'scans_per_30d', 'scans_30d');
  const outOfScans = scansLeft <= 0;
  const busy = phase !== 'idle';

  const runScan = async (payload) => {
    setPhase('scanning');
    try {
      const res = await base44.functions.invoke('scan-project', payload);
      const data = res?.data || {};
      if (data.error) throw new Error(data.error);
      setApplied(false);
      onScanned(data.scan, data.private_findings || []);
    } catch (err) {
      setError(errorText(err));
    }
    if (onFreePlan(plan)) loadPlan(true);
    setPhase('idle');
  };

  const scanZip = async (file) => {
    setError('');
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {
      setError('That needs to be a .zip — zip up the project folder and drop it in.');
      return;
    }
    if (file.size > MAX_ZIP_MB * 1024 * 1024) {
      setError(`That zip is ${(file.size / 1048576).toFixed(0)}MB. Keep it under ${MAX_ZIP_MB}MB — leave out node_modules, build folders and big media.`);
      return;
    }
    setPhase('uploading');
    let fileUri;
    try {
      const up = await base44.integrations.Core.UploadPrivateFile({ file });
      fileUri = up.file_uri;
    } catch (err) {
      setError(`Upload failed: ${errorText(err)}`);
      setPhase('idle');
      return;
    }
    await runScan({ file_uri: fileUri, file_name: file.name });
  };

  const scanUrl = async (raw) => {
    setError('');
    const url = String(raw || '').trim();
    if (!/github\.com\/[^/\s]+\/[^/\s]+/i.test(url)) {
      setError('Paste a link like github.com/you/your-project');
      return;
    }
    await runScan({ github_url: url });
  };

  const scanRepo = async (fullName) => {
    setError('');
    await runScan({ repo_full_name: fullName });
  };

  return (
    <section className="card-soft space-y-5 border-primary/25 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ScanSearch className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {scan ? 'Your project scan' : 'Fast start: drop your project in'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {scan
              ? 'Here’s what the scanner found. Fill your listing from it, then tweak anything below.'
              : 'Upload a .zip or pick a GitHub repo. We’ll read the code, show what’s there, what’s missing and what’s connected, give it a score, and pre-fill this form for you.'}
          </p>
        </div>
      </div>

      {!scan && outOfScans && (
        <ProGate
          compact
          title={`You’ve used your ${plan?.limits?.scans_per_30d ?? 3} free scans for the last 30 days`}
          body="Go Pro for unlimited scans — or fill the listing in by hand below. You can add a scan later."
        />
      )}

      {!scan && !outOfScans && (
        <>
          {onFreePlan(plan) && (
            <p className="text-xs font-medium text-muted-foreground">
              {scansLeft} of {plan.limits?.scans_per_30d ?? 3} free scans left (rolling 30 days) ·{' '}
              <Link to="/pro" className="text-primary underline-offset-2 hover:underline">unlimited with Pro</Link>
            </p>
          )}
          <div className="inline-flex rounded-full border border-border/70 bg-secondary/60 p-1 text-sm">
            {[
              { key: 'zip', label: 'Upload a .zip', icon: FileArchive },
              { key: 'github', label: 'GitHub', icon: GitBranch },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={busy}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition-colors ${tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>

          {tab === 'zip' ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => !busy && fileRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) scanZip(e.dataTransfer.files?.[0]); }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-secondary/40'}`}
            >
              {busy ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <UploadCloud className="h-7 w-7 text-primary" />}
              <p className="text-sm font-medium">
                {phase === 'uploading' ? 'Uploading privately…' : phase === 'scanning' ? 'Reading your code… usually 5–30 seconds' : 'Drop your project .zip here, or tap to choose'}
              </p>
              <p className="text-xs text-muted-foreground">Up to {MAX_ZIP_MB}MB. Skip node_modules and build folders — we ignore them anyway.</p>
              <input ref={fileRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; scanZip(f); }} />
            </div>
          ) : (
            <GithubRepoPicker busy={busy} onScanRepo={scanRepo} onScanUrl={scanUrl} />
          )}

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            Your code is only read by the scanner. Buyers never get the files from here — they see the report, and
            only after you publish.
          </p>
        </>
      )}

      {error && <p className="rounded-2xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{error}</p>}

      {scan && (
        <>
          <ScanReport scan={scan} mode="owner" privateFindings={privateFindings} embedded />
          <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center">
            <Button
              className="rounded-full px-5"
              onClick={() => { onApply(scan); setApplied(true); }}
            >
              <Wand2 className="mr-2 h-4 w-4" /> {applied ? 'Filled — fill again' : 'Fill my listing from this'}
            </Button>
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => { setApplied(false); onScanned(null, []); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Scan a different version
            </Button>
            <p className="text-xs text-muted-foreground sm:ml-2">
              {applied ? 'Done — only empty fields were filled. Check them over below.' : 'Only fills empty fields — anything you’ve typed stays.'}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
