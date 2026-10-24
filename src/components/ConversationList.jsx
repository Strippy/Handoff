import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials, timeAgo } from '@/lib/marketplace';
import { MessageCircle } from 'lucide-react';

export const conversationPartner = (conversation, userId) =>
  (conversation?.participants || []).find((id) => id !== userId) || null;

export default function ConversationList({ conversations = [], activeId, onSelect, unreadByConversation = {} }) {
  if (!conversations.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-secondary/40 p-6 text-center">
        <MessageCircle className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No chats yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Open a listing and message the builder — it starts a private room here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {conversations.map((conversation) => {
        const active = conversation.id === activeId;
        const unread = unreadByConversation[conversation.id] || 0;
        return (
          <li key={conversation.id}>
            <button
              onClick={() => onSelect(conversation.id)}
              className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
                active ? 'border-primary/40 bg-primary/5' : 'border-border/70 bg-card hover:border-primary/30'
              }`}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={conversation.listing_cover} alt={conversation.listing_title} />
                <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                  {initials(conversation.listing_title || 'Chat')}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{conversation.listing_title || 'Conversation'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {conversation.last_message || 'No messages yet'}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/80">{timeAgo(conversation.last_message_at)}</p>
              </div>
              {unread > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {unread}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}