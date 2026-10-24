import React from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, ExternalLink, Hammer, Package, Sparkles, TrendingUp, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Section = ({ icon: Icon, title, children, tone = 'default' }) => (
  <div>
    <div className="mb-2 flex items-center gap-2">
      <Icon className={`h-4 w-4 ${tone === 'warn' ? 'text-amber-500' : tone === 'good' ? 'text-emerald-500' : 'text-primary'}`} />
      <h3 className="font-display text-sm font-semibold tracking-tight">{title}</h3>
    </div>
    <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
  </div>
);

const Chips = ({ values, empty }) => {
  if (!values?.length) return <p className="text-sm italic text-muted-foreground/80">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span key={value} className="chip">
          {value}
        </span>
      ))}
    </div>
  );
};

export default function HonestyDossier({ listing }) {
  return (
    <div className="card-soft space-y-6 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
          <Wand2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">The honest dossier</h2>
          <p className="text-xs text-muted-foreground">Everything the seller knows, written down before you ask.</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section icon={Sparkles} title="Built with AI help from">
          <Chips values={listing.ai_tools} empty="Not noted" />
        </Section>
        <Section icon={Hammer} title="Tech stack">
          <Chips values={listing.tech_stack} empty="Not noted" />
        </Section>
        <Section icon={CheckCircle2} title="What works today" tone="good">
          {listing.what_works || <span className="italic text-muted-foreground/80">Not noted yet</span>}
        </Section>
        <Section icon={AlertTriangle} title="Known issues" tone="warn">
          {listing.known_issues || <span className="italic text-muted-foreground/80">Not noted yet</span>}
        </Section>
        <Section icon={Package} title="What's included in the handover">
          {listing.included?.length ? (
            <ul className="space-y-1.5">
              {listing.included.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="italic text-muted-foreground/80">Not listed yet</span>
          )}
        </Section>
        <div className="space-y-6">
          <Section icon={CircleDollarSign} title="Monthly running costs">
            {listing.monthly_costs || <span className="italic text-muted-foreground/80">Not noted yet</span>}
          </Section>
          <Section icon={TrendingUp} title="Traction (self-reported)">
            <dl className="space-y-1.5">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground/80">Users</dt>
                <dd className="font-medium text-foreground">{listing.reported_users || 'not reported'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground/80">Revenue</dt>
                <dd className="font-medium text-foreground">{listing.reported_revenue || 'not reported'}</dd>
              </div>
            </dl>
          </Section>
        </div>
      </div>

      {listing.demo_url && (
        <Button asChild variant="outline" className="w-full rounded-2xl sm:w-auto">
          <a href={listing.demo_url} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" /> Open the live demo
          </a>
        </Button>
      )}
    </div>
  );
}