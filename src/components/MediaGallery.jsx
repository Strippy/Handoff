import React, { useState } from 'react';
import { Image } from '@/components/ui/image';
import { Play } from 'lucide-react';

export default function MediaGallery({ listing }) {
  const items = [{ url: listing.cover_image, type: 'image', caption: '' }, ...(listing.gallery || [])].filter((item) => item.url);
  const [active, setActive] = useState(0);
  const current = items[active];

  if (!current) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-3xl border border-dashed border-border bg-secondary/60 text-sm text-muted-foreground">
        This listing has no pictures yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl border border-border/70 bg-muted">
        {current.type === 'video' ? (
          <video src={current.url} controls className="h-full w-full bg-black object-contain" />
        ) : (
          <Image src={current.url} alt={current.caption || listing.title} className="h-full w-full object-cover" />
        )}
      </div>

      {items.length > 1 && (
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
          {items.map((item, index) => (
            <button
              key={`${item.url}-${index}`}
              onClick={() => setActive(index)}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border transition-all ${
                index === active ? 'border-primary ring-2 ring-primary/30' : 'border-border/70 opacity-70 hover:opacity-100'
              }`}
            >
              {item.type === 'video' ? (
                <>
                  <video src={item.url} className="h-full w-full object-cover" muted />
                  <span className="absolute inset-0 grid place-items-center bg-black/35 text-white">
                    <Play className="h-4 w-4" />
                  </span>
                </>
              ) : (
                <Image src={item.url} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}