import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import MediaUploader from '@/components/MediaUploader';
import ProjectScanner from '@/components/ProjectScanner';
import CompletenessMeter from '@/components/CompletenessMeter';
import { CATEGORIES, CURRENCIES, DEAL_TYPES, STAGES } from '@/lib/marketplace';
import { Loader2, Plus, X } from 'lucide-react';

const Field = ({ label, hint, children }) => (
  <div className="space-y-2">
    <Label className="text-sm font-medium">{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

function TagField({ label, hint, values = [], onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!values.includes(value)) onChange([...values, value]);
    setDraft('');
  };
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="rounded-2xl"
        />
        <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-2xl" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {values.map((value) => (
            <span key={value} className="chip">
              {value}
              <button type="button" onClick={() => onChange(values.filter((v) => v !== value))} aria-label={`Remove ${value}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </Field>
  );
}

const emptyForm = {
  title: '',
  tagline: '',
  category: 'web_app',
  stage: 'prototype',
  deal_type: 'full_sale',
  price: '',
  currency: 'USD',
  open_to_offers: true,
  feedback_wanted: false,
  description: '',
  ai_tools: [],
  tech_stack: [],
  what_works: '',
  known_issues: '',
  included: [],
  monthly_costs: '',
  reported_users: '',
  reported_revenue: '',
  demo_url: '',
  cover_image: '',
  gallery: [],
  tags: [],
};

export default function ListingForm({ initial, user, profile, onSaved }) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...(initial || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attested, setAttested] = useState(Boolean(initial?.ownership_attested_at));
  const [scan, setScan] = useState(null);
  const [privateFindings, setPrivateFindings] = useState([]);
  const touched = useRef(new Set());
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const setTouched = (patch) => {
    Object.keys(patch).forEach((k) => touched.current.add(k));
    set(patch);
  };

  // Editing a listing that already has a verified scan: show it.
  useEffect(() => {
    if (!initial?.scan_id) return;
    let active = true;
    base44.entities.ProjectScan.get(initial.scan_id)
      .then((found) => {
        if (active && found && found.owner_id === user?.id) {
          setScan(found);
          setPrivateFindings(found.private_findings || []);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [initial?.scan_id, user?.id]);

  // Fill blank fields from a scan. Never overwrites what the seller typed.
  const applyScan = (s) => {
    const ai = s?.ai_status === 'ok' && s.ai ? s.ai : {};
    const union = (a = [], b = []) => [...new Set([...(a || []), ...(b || []).filter(Boolean)])];
    const bullets = (items = []) => items.map((x) => `• ${x}`).join('\n');
    const services = (s.connections || []).filter((c) => c.status !== 'installed_unused' && c.kind !== 'Config').map((c) => c.name);
    setForm((prev) => ({
      ...prev,
      title: prev.title || ai.title || s.project_name || '',
      tagline: prev.tagline || ai.tagline || '',
      description: prev.description || ai.description || '',
      category: touched.current.has('category') || initial?.id ? prev.category : ai.category || prev.category,
      stage: touched.current.has('stage') || initial?.id ? prev.stage : ai.stage || prev.stage,
      ai_tools: union(prev.ai_tools, s.built_with_ai),
      tech_stack: union(prev.tech_stack, [...(s.built_on || []), ...services]),
      what_works: prev.what_works || bullets(ai.features_found),
      known_issues: prev.known_issues || bullets(ai.unfinished),
      included: union(prev.included, s.suggested_included),
    }));
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError('Give your project a title first.');
      return;
    }
    if (!form.cover_image) {
      setError('Add a cover image — it is the first thing people see on the card.');
      return;
    }
    if (['live', 'earning'].includes(form.stage) && !form.demo_url.trim()) {
      setError('Live and earning projects need a demo link so buyers can see it running.');
      return;
    }
    if (!attested) {
      setError('Tick the ownership box — only list what is yours to sell or share.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      price: form.price === '' || form.price === null ? 0 : Number(form.price),
    };
    delete payload.id;
    delete payload.created_date;
    delete payload.updated_date;
    delete payload.created_by_id;
    // scan fields are server-written only (field-level security)
    delete payload.scan_id;
    delete payload.scan_score;
    delete payload.scan_grade;
    let saved;
    if (initial?.id) {
      saved = await base44.entities.Listing.update(initial.id, payload);
    } else {
      saved = await base44.entities.Listing.create({
        ...payload,
        status: 'active',
        views: 0,
        seller_id: user.id,
        seller_name: profile?.display_name || user.full_name || 'Builder',
        seller_avatar: profile?.avatar_url || '',
        ownership_attested_at: new Date().toISOString(),
      });
    }
    if (scan?.id && saved?.id && saved.scan_id !== scan.id) {
      try {
        await base44.functions.invoke('scan-project', { action: 'attach', listing_id: saved.id, scan_id: scan.id });
        saved = { ...saved, scan_id: scan.id, scan_score: scan.score, scan_grade: scan.grade };
      } catch {
        // listing is saved; the scan can be attached on the next save
      }
    }
    setSaving(false);
    onSaved(saved);
  };

  const nonMonetary = ['collaborator', 'finish_it'].includes(form.deal_type);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        <ProjectScanner
          scan={scan}
          privateFindings={privateFindings}
          onScanned={(s, findings) => {
            setScan(s);
            setPrivateFindings(findings || []);
          }}
          onApply={applyScan}
        />

        <section className="card-soft space-y-5 p-5 sm:p-6">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">The pitch</h2>
            <p className="text-xs text-muted-foreground">What people see first on the card and at the top of your page.</p>
          </div>
          <Field label="Project title">
            <Input
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g. Recipe Box — a meal planner that actually plans"
              className="rounded-2xl"
            />
          </Field>
          <Field label="One-line pitch" hint="Say what it is and who it's for. This shows on every card.">
            <Input
              value={form.tagline}
              onChange={(e) => set({ tagline: e.target.value })}
              placeholder="Turns a fridge photo into a week of dinners"
              className="rounded-2xl"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What kind of thing is it?">
              <Select value={form.category} onValueChange={(category) => setTouched({ category })}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="How far along is it?">
              <Select value={form.stage} onValueChange={(stage) => setTouched({ stage })}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>
                      {stage.label} — {stage.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="The story" hint="How it started, what it does, why you're handing it on.">
            <Textarea
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={7}
              placeholder="Built over a few weekends with Claude and Cursor…"
              className="rounded-2xl"
            />
          </Field>
          <TagField
            label="Tags"
            hint="Helps people find it. Enter to add."
            values={form.tags}
            onChange={(tags) => set({ tags })}
            placeholder="productivity, ai, mobile"
          />
        </section>

        <section className="card-soft space-y-5 p-5 sm:p-6">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">The deal</h2>
            <p className="text-xs text-muted-foreground">Selling outright, licensing copies, finding a collaborator or giving it away — all welcome.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How do you want to hand it on?">
              <Select value={form.deal_type} onValueChange={(deal_type) => set({ deal_type })}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_TYPES.map((deal) => (
                    <SelectItem key={deal.value} value={deal.value}>
                      {deal.label} — {deal.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Field label="Price" hint={nonMonetary ? 'Optional — leave blank to talk it through' : 'Set 0 to invite offers'}>
                <Input
                  value={form.price}
                  onChange={(e) => set({ price: e.target.value.replace(/[^0-9.]/g, '') })}
                  inputMode="decimal"
                  placeholder="2500"
                  className="rounded-2xl"
                />
              </Field>
              <Field label="Currency">
                <Select value={form.currency} onValueChange={(currency) => set({ currency })}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Open to offers</p>
              <p className="text-xs text-muted-foreground">Let people propose a different number.</p>
            </div>
            <Switch checked={!!form.open_to_offers} onCheckedChange={(open_to_offers) => set({ open_to_offers })} />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Open for feedback</p>
              <p className="text-xs text-muted-foreground">Flags it as a half-built idea people can react to and answer questions on.</p>
            </div>
            <Switch checked={!!form.feedback_wanted} onCheckedChange={(feedback_wanted) => set({ feedback_wanted })} />
          </div>
        </section>

        <section className="card-soft space-y-5 p-5 sm:p-6">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Media</h2>
            <p className="text-xs text-muted-foreground">Screenshots sell. A 20-second clip sells harder.</p>
          </div>
          <MediaUploader
            coverImage={form.cover_image}
            gallery={form.gallery}
            onCoverChange={(cover_image) => set({ cover_image })}
            onGalleryChange={(gallery) => set({ gallery })}
          />
        </section>

        <section className="card-soft space-y-5 p-5 sm:p-6">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">The honest dossier</h2>
            <p className="text-xs text-muted-foreground">
              This is the part buyers trust most. Nothing here is a deal-breaker — hiding it is.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TagField
              label="AI tools you built it with"
              hint="Cursor, Claude, Lovable, Bolt… buyers like knowing."
              values={form.ai_tools}
              onChange={(ai_tools) => set({ ai_tools })}
              placeholder="Claude, Cursor, v0"
            />
            <TagField
              label="Tech stack"
              hint="Frameworks and services it runs on."
              values={form.tech_stack}
              onChange={(tech_stack) => set({ tech_stack })}
              placeholder="React, Supabase, Stripe"
            />
          </div>
          <Field label="What works today" hint="The flows a buyer can click through right now.">
            <Textarea
              value={form.what_works}
              onChange={(e) => set({ what_works: e.target.value })}
              rows={3}
              placeholder="Sign-up, billing and the planner all work end to end."
              className="rounded-2xl"
            />
          </Field>
          <Field label="Known issues" hint="Being upfront here is what makes people trust the rest.">
            <Textarea
              value={form.known_issues}
              onChange={(e) => set({ known_issues: e.target.value })}
              rows={3}
              placeholder="No password reset. The export button breaks on Safari."
              className="rounded-2xl"
            />
          </Field>
          <TagField
            label="What's included in the handover"
            hint="Repo, domain, assets, accounts, docs — list each one."
            values={form.included}
            onChange={(included) => set({ included })}
            placeholder="GitHub repo, domain name, logo files"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Monthly running costs" hint="Hosting, APIs, domain.">
              <Input
                value={form.monthly_costs}
                onChange={(e) => set({ monthly_costs: e.target.value })}
                placeholder="~$20 Supabase + $12 domain"
                className="rounded-2xl"
              />
            </Field>
            <Field label="Users (self-reported)" hint="Expect buyers to ask for proof.">
              <Input
                value={form.reported_users}
                onChange={(e) => set({ reported_users: e.target.value })}
                placeholder="140 signups"
                className="rounded-2xl"
              />
            </Field>
            <Field label="Revenue (self-reported)" hint="Monthly, if any.">
              <Input
                value={form.reported_revenue}
                onChange={(e) => set({ reported_revenue: e.target.value })}
                placeholder="$0 — not monetised"
                className="rounded-2xl"
              />
            </Field>
          </div>
          <Field label="Live demo link" hint="Required for Live and Earning projects. Optional for earlier stages.">
            <Input
              value={form.demo_url}
              onChange={(e) => set({ demo_url: e.target.value })}
              placeholder="https://…"
              className="rounded-2xl"
            />
          </Field>
        </section>

        <label className="card-soft flex cursor-pointer items-start gap-3 p-4 text-sm">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
          />
          <span>
            <span className="font-medium">I own this project or have the right to sell or share it.</span>
            <span className="block text-xs text-muted-foreground">
              Includes the code, assets and anything in the "what's included" list. Listing someone else's work gets you removed.
            </span>
          </span>
        </label>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button className="rounded-full px-6" disabled={saving} onClick={save}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initial?.id ? 'Save changes' : 'Publish listing'}
          </Button>
          <p className="self-center text-xs text-muted-foreground">
            You can edit or archive this any time from the listing page.
          </p>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card-soft space-y-3 p-5">
          <CompletenessMeter listing={form} showMissing />
          <p className="text-xs text-muted-foreground">
            The more honest detail you give, the fewer back-and-forth questions you'll get — and the easier it is for a buyer to say yes.
          </p>
        </div>
      </aside>
    </div>
  );
}