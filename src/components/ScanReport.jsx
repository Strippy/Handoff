import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { timeAgo } from '@/lib/marketplace';
import {
  AlertTriangle, BadgeCheck, Bot, CheckCircle2, ChevronDown, CircleDashed, Code2, FileCode2, GitBranch, KeyRound,
  Layers, Lock, Plug, ShieldAlert, ShieldCheck, Sparkles, Wrench, XCircle,
} from 'lucide-react';

export const gradeTone = (score) => {
  if (score >= 85) return { ring: 'stroke-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
  if (score >= 65) return { ring: 'stroke-teal-500', text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-500/10' };
  if (score >= 40) return { ring: 'stroke-amber-500', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
  return { ring: 'stroke-rose-500', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' };
};

export function ScoreRing({ score = 0, size = 76 }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const tone = gradeTone(score);
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" className="shrink-0" role="img" aria-label={`Handoff readiness ${score} out of 100`}>
      <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
      <circle
        cx="38" cy="38" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
        className={`${tone.ring} transition-all duration-700`}
        strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * c} ${c}`}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="43" textAnchor="middle" className="fill-foreground font-display text-[20px] font-bold">{score}</text>
    </svg>
  );
}

const STATUS = {
  wired: { label: 'Wired up', icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' },
  needs_setup: { label: 'Keys not documented', icon: KeyRound, cls: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' },
  installed_unused: { label: 'Installed, not used', icon: CircleDashed, cls: 'border-border bg-secondary text-muted-foreground' },
};

const Block = ({ icon: Icon, title, hint, children }) => (
  <div className="space-y-2.5">
    <div>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </div>
);

const Chips = ({ items }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item) => (
      <span key={item} className="chip">{item}</span>
    ))}
  </div>
);

const Bullets = ({ items, tone = 'muted' }) => (
  <ul className="space-y-1.5 text-sm">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2">
        <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'warn' ? 'bg-amber-500' : tone === 'good' ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
        <span className="text-muted-foreground">{item}</span>
      </li>
    ))}
  </ul>
);

/**
 * mode: "owner" shows fixes and where secrets were found; "public" shows what a buyer needs.
 */
export default function ScanReport({ scan, mode = 'public', privateFindings, defaultOpen = false, embedded = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!scan) return null;
  const owner = mode === 'owner';
  const tone = gradeTone(scan.score || 0);
  const ai = scan.ai_status === 'ok' ? scan.ai : null;
  const checks = scan.checks || [];
  const passed = checks.filter((c) => c.passed);
  const failed = checks.filter((c) => !c.passed);
  const connections = scan.connections || [];
  const highSecrets = (scan.secrets_summary || []).filter((s) => s.severity === 'high');
  const otherSecrets = (scan.secrets_summary || []).filter((s) => s.severity !== 'high');
  const findings = privateFindings || scan.private_findings || [];
  const signals = scan.signals || {};

  const header = (
    <div className="flex items-start gap-4">
      <ScoreRing score={scan.score || 0} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.bg} ${tone.text}`}>{scan.grade}</span>
          <span className="text-xs text-muted-foreground">Handoff readiness · out of 100</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Scored from what's actually in the files — docs, setup, secrets, tests, connections. The AI only writes the
          summary; it never changes the number.
        </p>
        {scan.repo_verified && (
          <p
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
            title="GitHub confirmed, at scan time, that the seller's connected account has this access to the repo"
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            {scan.repo_role === 'owner' ? 'Verified repo owner' : 'Verified collaborator'} · @{scan.verified_github_login}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {scan.repo_private ? (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Lock className="h-3 w-3" /> {owner ? scan.source_label : 'Private repo'}
            </span>
          ) : scan.repo_url ? (
            <a href={scan.repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary">
              <GitBranch className="h-3 w-3" /> {scan.source_label}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1"><FileCode2 className="h-3 w-3" /> {scan.source_label}</span>
          )}
          <span>{(scan.file_count || 0).toLocaleString()} files</span>
          <span>{(scan.lines_of_code || 0).toLocaleString()} lines of code</span>
          {scan.scanned_at && <span>scanned {timeAgo(scan.scanned_at)}</span>}
        </p>
      </div>
    </div>
  );

  return (
    <div className={embedded ? 'space-y-5' : 'card-soft space-y-5 p-5 sm:p-6'}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Code2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Code scan</h2>
            <p className="text-xs text-muted-foreground">
              {owner ? 'Your report. Buyers see this once the listing is live — minus the file paths of any secrets.' : 'An automatic read of the real project files the seller uploaded.'}
            </p>
          </div>
        </div>
      )}

      {header}

      {highSecrets.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">
              {owner ? 'Live secrets found — fix these before you hand over' : 'The scan found exposed keys in the files'}
            </p>
            <p>{highSecrets.map((s) => `${s.type}${s.count > 1 ? ` ×${s.count}` : ''}`).join(' · ')}</p>
            {owner ? (
              <>
                {findings.filter((f) => f.severity === 'high').slice(0, 8).map((f, i) => (
                  <p key={i} className="font-mono text-[11px]">{f.path}:{f.line} — {f.type}</p>
                ))}
                <p>Move them into env vars, delete committed .env files, and rotate every key that was in the files — anyone who saw the code has them.</p>
              </>
            ) : (
              <p>Ask the seller to confirm these keys were rotated before you pay.</p>
            )}
          </div>
        </div>
      )}

      {ai?.summary && (
        <div className="rounded-2xl bg-secondary/60 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Bot className="h-3.5 w-3.5" /> AI read of the code
          </p>
          <p className="mt-1.5 text-sm leading-relaxed">{ai.summary}</p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {scan.built_on?.length > 0 && (
          <Block icon={Layers} title="Built on" hint="Frameworks, engines and platforms detected.">
            <Chips items={scan.unity_version ? scan.built_on.map((b) => (b === 'Unity' ? `Unity ${scan.unity_version}` : b)) : scan.built_on} />
          </Block>
        )}
        {scan.built_with_ai?.length > 0 && (
          <Block icon={Sparkles} title="Signs of AI tools" hint="Fingerprints these tools leave in a project.">
            <Chips items={scan.built_with_ai} />
          </Block>
        )}
        {scan.languages?.length > 0 && (
          <Block icon={FileCode2} title="Languages" hint="By number of source files.">
            <Chips items={scan.languages.slice(0, 6).map((l) => `${l.name} · ${l.files}`)} />
          </Block>
        )}
        {scan.external_hosts?.length > 0 && (
          <Block icon={Plug} title="Talks to" hint="Outside APIs the code calls directly.">
            <Chips items={scan.external_hosts.slice(0, 8)} />
          </Block>
        )}
      </div>

      {connections.length > 0 && (
        <Block icon={Plug} title="What's connected" hint="Services wired into the code. 'Connected' means the code uses it — not that live accounts come with the sale.">
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/70">
            {connections.map((c) => {
              const st = STATUS[c.status] || STATUS.wired;
              const Icon = st.icon;
              return (
                <li key={c.name} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {c.name} <span className="text-xs font-normal text-muted-foreground">· {c.kind}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{c.note}</p>
                  </div>
                  <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                    <Icon className="h-3 w-3" /> {st.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      {open && (
        <>
          <Block icon={Wrench} title={`What's there and what's missing (${passed.length}/${checks.length})`} hint="Each item is worth points toward the score.">
            <ul className="space-y-2">
              {[...failed, ...passed].map((c) => (
                <li key={c.key} className="flex gap-2.5 text-sm">
                  {c.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {c.label} <span className="text-xs font-normal text-muted-foreground">{c.points}/{c.max}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{c.why}</p>
                    {owner && !c.passed && <p className="mt-0.5 text-xs text-primary">Fix: {c.fix}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Block>

          {ai?.features_found?.length > 0 && (
            <Block icon={CheckCircle2} title="Looks implemented" hint="From the AI read — check before you rely on it.">
              <Bullets items={ai.features_found} tone="good" />
            </Block>
          )}
          {ai?.unfinished?.length > 0 && (
            <Block icon={AlertTriangle} title="Looks unfinished" hint="Stubs, mock data or half-built pieces the AI spotted.">
              <Bullets items={ai.unfinished} tone="warn" />
            </Block>
          )}
          {ai?.handover_notes?.length > 0 && (
            <Block icon={KeyRound} title="To run it, a buyer will need to" hint="Accounts, keys and services to set up after handover.">
              <Bullets items={ai.handover_notes} />
            </Block>
          )}

          <Block icon={ShieldCheck} title="Other signals">
            <div className="flex flex-wrap gap-1.5">
              <span className="chip">{signals.todo_count || 0} TODO/FIXME</span>
              {signals.not_implemented > 0 && <span className="chip">{signals.not_implemented} "not implemented"</span>}
              {signals.placeholder_files > 0 && <span className="chip">Placeholder text in {signals.placeholder_files} file{signals.placeholder_files > 1 ? 's' : ''}</span>}
              <span className="chip">{signals.has_tests ? 'Has tests' : 'No tests'}</span>
              {signals.mock_data_files?.length > 0 && <span className="chip">Mock / sample data: {signals.mock_data_files.slice(0, 3).join(', ')}</span>}
              {otherSecrets.map((s) => (
                <span key={s.type} className="chip">{s.type}{s.count > 1 ? ` ×${s.count}` : ''}</span>
              ))}
            </div>
            {scan.env_vars_referenced?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Settings the code reads: <span className="font-mono">{scan.env_vars_referenced.slice(0, 20).join(', ')}{scan.env_vars_referenced.length > 20 ? '…' : ''}</span>
              </p>
            )}
          </Block>
        </>
      )}

      <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => setOpen(!open)}>
        <ChevronDown className={`mr-1 h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Hide the full breakdown' : `Show the full breakdown${failed.length ? ` · ${failed.length} thing${failed.length > 1 ? 's' : ''} missing` : ''}`}
      </Button>
    </div>
  );
}
