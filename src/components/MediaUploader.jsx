import React, { useRef, useState } from 'react';
import { api } from '@/api/client';
import { checkMediaFile, MAX_VIDEO_MB, MAX_VIDEO_SECONDS } from '@/lib/marketplace';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { ImagePlus, Loader2, Trash2, Video } from 'lucide-react';

export default function MediaUploader({ coverImage, gallery = [], onCoverChange, onGalleryChange }) {
  const coverRef = useRef(null);
  const mediaRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file) => {
    const { file_url } = await api.integrations.Core.UploadPublicFile({ file });
    return {
      url: file_url,
      type: file.type?.startsWith('video') ? 'video' : 'image',
      name: file.name,
      caption: '',
    };
  };

  const pickCover = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = await checkMediaFile(file);
    if (problem || !file.type?.startsWith('image')) {
      setError(problem || 'The cover needs to be an image.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const uploaded = await upload(file);
      onCoverChange(uploaded.url);
    } catch {
      setError('Upload failed — check your connection and try again.');
    }
    setBusy(false);
  };

  const pickMedia = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    const uploaded = [];
    const problems = [];
    for (const file of files) {
      const problem = await checkMediaFile(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      try {
        uploaded.push(await upload(file));
      } catch {
        problems.push(`${file.name} failed to upload.`);
      }
    }
    if (problems.length) setError(problems.join(' '));
    onGalleryChange([...gallery, ...uploaded]);
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Cover image</p>
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-40 overflow-hidden rounded-2xl border border-dashed border-border bg-secondary/60">
            {coverImage ? (
              <Image src={coverImage} alt="Cover" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-xs text-muted-foreground">16:10 cover</span>
            )}
          </div>
          <div className="space-y-2">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => coverRef.current?.click()}>
              <ImagePlus className="mr-1.5 h-4 w-4" /> {coverImage ? 'Replace cover' : 'Add cover'}
            </Button>
            {coverImage && (
              <Button type="button" variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => onCoverChange('')}>
                Remove
              </Button>
            )}
          </div>
        </div>
        <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={pickCover} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Gallery — screenshots, walkthrough clips, demos</p>
        {gallery.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((item, index) => (
              <div key={`${item.url}-${index}`} className="group relative overflow-hidden rounded-2xl border border-border/70 bg-muted">
                {item.type === 'video' ? (
                  <video src={item.url} className="aspect-video w-full object-cover" muted />
                ) : (
                  <Image src={item.url} alt="" className="aspect-video w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => onGalleryChange(gallery.filter((_, i) => i !== index))}
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-background/90 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove media"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={() => mediaRef.current?.click()}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Video className="mr-1.5 h-4 w-4" />}
          {busy ? 'Uploading…' : 'Add images or short clips'}
        </Button>
        <input ref={mediaRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={pickMedia} />
        <p className="text-xs text-muted-foreground">
          Clips up to {MAX_VIDEO_SECONDS}s and {MAX_VIDEO_MB}MB — a 20–30s walkthrough works best. Files go to public storage, so anyone with the link can open them.
        </p>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
    </div>
  );
}