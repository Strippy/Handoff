import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/marketplace';
import { ImagePlus, Loader2, Plus, X } from 'lucide-react';

function TagField({ label, hint, values = [], onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!values.includes(value)) onChange([...values, value]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
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
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
    </div>
  );
}

export default function ProfileForm({ profile, user, onSaved }) {
  const [form, setForm] = useState({
    display_name: profile?.display_name || user?.full_name || '',
    avatar_url: profile?.avatar_url || '',
    headline: profile?.headline || '',
    bio: profile?.bio || '',
    location: profile?.location || '',
    skills: profile?.skills || [],
    tools: profile?.tools || [],
    links: profile?.links || [],
    open_to_collab: profile?.open_to_collab ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const pickAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
    set({ avatar_url: file_url });
    setUploading(false);
  };

  const updateLink = (index, patch) => {
    set({ links: form.links.map((link, i) => (i === index ? { ...link, ...patch } : link)) });
  };

  const save = async () => {
    if (!form.display_name.trim()) {
      setError('Pick a display name so people know who they are dealing with.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      display_name: form.display_name.trim(),
      links: form.links.filter((link) => link.label?.trim() && link.url?.trim()),
    };
    let saved;
    if (profile?.id) {
      saved = await base44.entities.BuilderProfile.update(profile.id, payload);
    } else {
      const existing = await base44.entities.BuilderProfile.count({ founding_builder: true });
      saved = await base44.entities.BuilderProfile.create({
        ...payload,
        user_id: user.id,
        builders_code_accepted: true,
        founding_builder: (existing || 0) < 100,
        blocked_ids: [],
      });
    }
    setSaving(false);
    onSaved(saved);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20 border border-border/70">
          <AvatarImage src={form.avatar_url} alt={form.display_name} />
          <AvatarFallback className="bg-secondary font-display text-xl">{initials(form.display_name)}</AvatarFallback>
        </Avatar>
        <div className="space-y-2">
          <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1.5 h-4 w-4" />}
            {form.avatar_url ? 'Change photo' : 'Add a photo'}
          </Button>
          <p className="max-w-xs text-xs text-muted-foreground">A face or a logo builds trust fast.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Display name</Label>
          <Input value={form.display_name} onChange={(e) => set({ display_name: e.target.value })} className="rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Where you're based</Label>
          <Input
            value={form.location}
            onChange={(e) => set({ location: e.target.value })}
            placeholder="Melbourne, AU"
            className="rounded-2xl"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Headline</Label>
        <Input
          value={form.headline}
          onChange={(e) => set({ headline: e.target.value })}
          placeholder="Solo builder. Ships fast, documents faster."
          className="rounded-2xl"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">About you</Label>
        <Textarea
          value={form.bio}
          onChange={(e) => set({ bio: e.target.value })}
          rows={4}
          placeholder="What you build, what you're good at, what you're looking for next."
          className="rounded-2xl"
        />
      </div>

      <TagField
        label="Skills"
        hint="What you're good at. Enter to add."
        values={form.skills}
        onChange={(skills) => set({ skills })}
        placeholder="frontend, growth, payments"
      />

      <TagField
        label="Tools you build with"
        values={form.tools}
        onChange={(tools) => set({ tools })}
        placeholder="Claude, Cursor, Supabase"
      />

      <div className="space-y-3">
        <Label className="text-sm font-medium">Links</Label>
        {form.links.map((link, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={link.label || ''}
              onChange={(e) => updateLink(index, { label: e.target.value })}
              placeholder="GitHub"
              className="w-32 rounded-2xl"
            />
            <Input
              value={link.url || ''}
              onChange={(e) => updateLink(index, { url: e.target.value })}
              placeholder="https://…"
              className="rounded-2xl"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-2xl"
              onClick={() => set({ links: form.links.filter((_, i) => i !== index) })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => set({ links: [...form.links, { label: '', url: '' }] })}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add a link
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/50 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Open to collaborating</p>
          <p className="text-xs text-muted-foreground">Tells people you'll build alongside them, not just sell to them.</p>
        </div>
        <Switch checked={form.open_to_collab} onCheckedChange={(open_to_collab) => set({ open_to_collab })} />
      </div>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <Button className="rounded-full px-6" disabled={saving} onClick={save}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {profile ? 'Save profile' : 'Create my builder page'}
      </Button>
    </div>
  );
}