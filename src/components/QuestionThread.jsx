import React, { useState } from 'react';
import { api } from '@/api/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { initials, pushNotification, timeAgo } from '@/lib/marketplace';
import { Loader2, MessageCircleQuestion, Send } from 'lucide-react';

export default function QuestionThread({ listing, questions = [], user, profile, onChanged }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [answeringId, setAnsweringId] = useState(null);
  const [answerDraft, setAnswerDraft] = useState('');

  const myName = profile?.display_name || user?.full_name || 'Builder';

  const ask = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const created = await api.entities.Question.create({
      listing_id: listing.id,
      seller_id: listing.seller_id || '',
      author_id: user.id,
      author_name: myName,
      author_avatar: profile?.avatar_url || '',
      body,
      answers: [],
    });
    if (listing.seller_id && listing.seller_id !== user.id) {
      pushNotification({
        user_id: listing.seller_id,
        type: 'question',
        title: `${myName} asked about ${listing.title}`,
        body,
        link: `/listing/${listing.id}`,
        actor_name: myName,
        actor_avatar: profile?.avatar_url || '',
        read: false,
      });
    }
    setDraft('');
    setSending(false);
    onChanged([created, ...questions]);
  };

  const answer = async (question) => {
    const body = answerDraft.trim();
    if (!body) return;
    setSending(true);
    const answers = [
      ...(question.answers || []),
      { author_id: user.id, author_name: myName, body, date: new Date().toISOString() },
    ];
    await api.entities.Question.update(question.id, { answers });
    if (question.author_id && question.author_id !== user.id) {
      pushNotification({
        user_id: question.author_id,
        type: 'answer',
        title: `${myName} answered your question`,
        body,
        link: `/listing/${listing.id}`,
        actor_name: myName,
        actor_avatar: profile?.avatar_url || '',
        read: false,
      });
    }
    setAnswerDraft('');
    setAnsweringId(null);
    setSending(false);
    onChanged(questions.map((q) => (q.id === question.id ? { ...q, answers } : q)));
  };

  return (
    <div className="card-soft space-y-5 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-accent-foreground">
          <MessageCircleQuestion className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Public Q&amp;A</h2>
          <p className="text-xs text-muted-foreground">
            Answers here help every future buyer, so ask in the open when you can.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Does the repo include the Stripe keys, or do I need my own?"
          className="rounded-2xl"
        />
        <Button className="h-auto rounded-2xl px-4" disabled={sending || !draft.trim()} onClick={ask}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {questions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-secondary/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No questions yet. Ask the first one — it's a friendly room.
        </p>
      ) : (
        <ul className="space-y-4">
          {questions.map((question) => (
            <li key={question.id} className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={question.author_avatar} alt={question.author_name} />
                  <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                    {initials(question.author_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {question.author_name || 'A builder'}
                      {question.author_id === listing.seller_id && (
                        <span className="ml-2 text-xs font-medium text-primary">Seller</span>
                      )}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{timeAgo(question.created_date)}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{question.body}</p>
                  </div>

                  {(question.answers || []).map((item, index) => (
                    <div key={index} className="rounded-xl border border-border/60 bg-secondary/50 p-3">
                      <p className="text-xs font-semibold">
                        {item.author_name}
                        {item.author_id === listing.seller_id && (
                          <span className="ml-2 font-medium text-primary">Seller</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{item.body}</p>
                    </div>
                  ))}

                  {answeringId === question.id ? (
                    <div className="flex gap-2">
                      <Textarea
                        value={answerDraft}
                        onChange={(e) => setAnswerDraft(e.target.value)}
                        rows={2}
                        placeholder="Jump in with what you know…"
                        className="rounded-xl"
                      />
                      <Button
                        size="sm"
                        className="h-auto rounded-xl"
                        disabled={sending || !answerDraft.trim()}
                        onClick={() => answer(question)}
                      >
                        Reply
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full text-xs text-muted-foreground"
                      onClick={() => {
                        setAnsweringId(question.id);
                        setAnswerDraft('');
                      }}
                    >
                      Answer this
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}