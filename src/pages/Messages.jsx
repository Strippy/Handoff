import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { asItems, loadMyProfile } from '@/lib/marketplace';
import ConversationList from '@/components/ConversationList';
import MessageThread from '@/components/MessageThread';
import EmptyState from '@/components/EmptyState';
import { Loader2, MessageCircle } from 'lucide-react';

export default function Messages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [unread, setUnread] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [p, conversationRes, unreadRes] = await Promise.all([
        loadMyProfile(user.id),
        base44.entities.Conversation.filter(
          { participants: { $in: [user.id] } },
          { sort: '-last_message_at', limit: 50 }
        ),
        base44.entities.Message.filter({ recipient_id: user.id, read: false }, { limit: 200 }),
      ]);
      if (!active) return;
      setProfile(p);
      setConversations(asItems(conversationRes));
      const counts = {};
      asItems(unreadRes).forEach((message) => {
        counts[message.conversation_id] = (counts[message.conversation_id] || 0) + 1;
      });
      setUnread(counts);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id, id]);

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const openConversation = conversations.find((conversation) => conversation.id === id);

  return (
    <div className="space-y-6">
      <div className={id ? 'hidden md:block' : ''}>
        <h1 className="font-display text-2xl font-bold tracking-tight">Chats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deal talk stays here — no need to hand over your email to ask a question.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
        <div className={`space-y-4 ${id ? 'hidden md:block' : ''}`}>
          <ConversationList
            conversations={conversations}
            activeId={id}
            unreadByConversation={unread}
            onSelect={(conversationId) => navigate(`/messages/${conversationId}`)}
          />
        </div>

        <div>
          {id ? (
            openConversation || loading ? (
              <MessageThread
                conversationId={id}
                user={user}
                profile={profile}
                onBack={() => navigate('/messages')}
              />
            ) : (
              <EmptyState
                icon={MessageCircle}
                title="Chat not found"
                body="That conversation may have been removed."
              />
            )
          ) : (
            <div className="hidden md:block">
              <EmptyState
                icon={MessageCircle}
                title="Pick a conversation"
                body="Every chat here started from a listing. Open one, or go find a project worth asking about."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}