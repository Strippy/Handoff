import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { asItems, initials, timeAgo } from '@/lib/marketplace';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/EmptyState';
import { Bell, Loader2 } from 'lucide-react';

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const res = await api.entities.Notification.filter(
        { user_id: user.id },
        { sort: '-created_date', limit: 50 }
      );
      if (!active) return;
      setItems(asItems(res));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const markAllRead = async () => {
    await api.entities.Notification.updateMany({ user_id: user.id, read: false }, { $set: { read: true } });
    setItems(items.map((item) => ({ ...item, read: true })));
  };

  const openItem = async (item) => {
    if (!item.read) {
      await api.entities.Notification.update(item.id, { read: true });
      setItems(items.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
    }
    // in-app links only — a notification can never send you off-site
    if (item.link && item.link.startsWith('/') && !item.link.startsWith('//')) navigate(item.link);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const unread = items.filter((item) => !item.read).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Offers, messages, questions and every handover step — all in one place.
          </p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Quiet in here"
          body="Nothing yet. When someone offers on your project, asks a question or messages you, it shows up here."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => openItem(item)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  item.read ? 'border-border/70 bg-card' : 'border-primary/30 bg-primary/5'
                }`}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={item.actor_avatar} alt={item.actor_name} />
                  <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                    {initials(item.actor_name || item.title)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.body && <p className="truncate text-xs text-muted-foreground">{item.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground/80">{timeAgo(item.created_date)}</p>
                </div>
                {!item.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}