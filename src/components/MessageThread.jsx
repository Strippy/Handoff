import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Image } from '@/components/ui/image';
import { asItems, checkMediaFile, initials, looksLikeOffPlatformPayment, pushNotification, timeAgo } from '@/lib/marketplace';
import { ArrowLeft, Loader2, Paperclip, Send, ShieldAlert, X } from 'lucide-react';

export default function MessageThread({ conversationId, user, profile, onBack }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileRef = useRef(null);
  const endRef = useRef(null);

  const myName = profile?.display_name || user?.full_name || 'Builder';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    (async () => {
      const conv = await base44.entities.Conversation.get(conversationId);
      if (!active) return;
      setConversation(conv);
      const res = await base44.entities.Message.filter(
        { conversation_id: conversationId },
        { sort: 'created_date', limit: 200 }
      );
      if (!active) return;
      setMessages(asItems(res));
      await base44.entities.Message.updateMany(
        { conversation_id: conversationId, recipient_id: user.id, read: false },
        { $set: { read: true } }
      );
      if (!active) return;
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [conversationId, user.id]);

  useEffect(() => {
    const unsubscribe = base44.entities.Message.subscribe((event) => {
      const record = event.data;
      if (!record || record.conversation_id !== conversationId) return;
      if (event.type === 'create') {
        setMessages((prev) => (prev.some((m) => m.id === record.id) ? prev : [...prev, record]));
      } else if (event.type === 'update') {
        setMessages((prev) => prev.map((m) => (m.id === record.id ? record : m)));
      }
    });
    return unsubscribe;
  }, [conversationId]);

  useEffect(() => {
    if (!loading) endRef.current?.scrollIntoView({ block: 'end' });
  }, [loading, messages.length]);

  const pickFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setFileError('');
    const uploaded = [];
    const problems = [];
    for (const file of files) {
      const problem = await checkMediaFile(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      try {
        const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
        uploaded.push({
          url: file_url,
          type: file.type?.startsWith('video') ? 'video' : 'image',
          name: file.name,
        });
      } catch {
        problems.push(`${file.name} failed to upload.`);
      }
    }
    if (problems.length) setFileError(problems.join(' '));
    setAttachments((prev) => [...prev, ...uploaded]);
    setUploading(false);
  };

  const send = async () => {
    const body = text.trim();
    if (!body && !attachments.length) return;
    setSending(true);
    const recipientId = (conversation?.participants || []).find((id) => id !== user.id);
    const created = await base44.entities.Message.create({
      conversation_id: conversationId,
      sender_id: user.id,
      sender_name: myName,
      sender_avatar: profile?.avatar_url || '',
      recipient_id: recipientId,
      body,
      attachments,
      read: false,
    });
    await base44.entities.Conversation.update(conversationId, {
      last_message: body || 'Sent an attachment',
      last_message_at: new Date().toISOString(),
      last_sender_id: user.id,
    });
    setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
    setText('');
    setAttachments([]);
    setSending(false);
    if (recipientId) {
      pushNotification({
        user_id: recipientId,
        type: 'message',
        title: `${myName} sent you a message`,
        body: body.slice(0, 100) || 'Sent an attachment',
        link: `/messages/${conversationId}`,
        actor_name: myName,
        actor_avatar: profile?.avatar_url || '',
        read: false,
      });
    }
  };

  const otherName = conversation?.participants?.find((id) => id !== user.id);
  const paymentRedFlag = messages.some((m) => m.sender_id !== user.id && looksLikeOffPlatformPayment(m.body));
  const myDraftFlag = looksLikeOffPlatformPayment(text);

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col md:h-[calc(100vh-9rem)]">
      <div className="flex items-center gap-3 border-b border-border/60 pb-3">
        <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold">{conversation?.listing_title || 'Conversation'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {otherName ? 'Private chat' : ''} {conversation?.last_message_at ? `· last active ${timeAgo(conversation.last_message_at)}` : ''}
          </p>
        </div>
      </div>

      {paymentRedFlag && (
        <div className="mt-3 flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Heads up:</span> this chat mentions paying outside escrow. Gift cards, wire
            transfers, crypto wallets and “pay me directly” are common in project-sale scams. Keep the money in an
            Escrow.com transaction from the Deal Room — and report the chat if something feels off.
          </p>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {loading && (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="mx-auto max-w-sm rounded-3xl border border-dashed border-border bg-secondary/40 p-6 text-center">
            <p className="font-display text-sm font-semibold">Say hi</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ask what's included, what breaks, how long the handover takes. Nobody here bites.
            </p>
          </div>
        )}
        {messages.map((message) => {
          const mine = message.sender_id === user.id;
          return (
            <div key={message.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
              {!mine && (
                <Avatar className="mt-1 h-7 w-7">
                  <AvatarImage src={message.sender_avatar} alt={message.sender_name} />
                  <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                    {initials(message.sender_name)}
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                  mine
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border/70 bg-card text-foreground'
                }`}
              >
                {message.body && <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>}
                {(message.attachments || []).length > 0 && (
                  <div className={`mt-2 grid gap-2 ${message.body ? '' : 'mt-0'} sm:grid-cols-2`}>
                    {message.attachments.map((item, index) =>
                      item.type === 'video' ? (
                        <video key={index} src={item.url} controls className="w-full rounded-xl bg-black" />
                      ) : (
                        <Image
                          key={index}
                          src={item.url}
                          alt={item.name || 'Attachment'}
                          className="max-h-64 w-full rounded-xl object-cover"
                        />
                      )
                    )}
                  </div>
                )}
                <p className={`mt-1 text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {timeAgo(message.created_date)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/60 pt-3">
        {myDraftFlag && (
          <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
            Paying or getting paid outside escrow removes your protection if the handover goes wrong.
          </p>
        )}
        {fileError && <p className="mb-2 text-xs font-medium text-destructive">{fileError}</p>}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((item, index) => (
              <span key={index} className="chip">
                {item.type === 'video' ? 'Clip' : 'Image'}: {item.name?.slice(0, 22)}
                <button type="button" onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            aria-label="Attach files"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={pickFiles} />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Write a message…"
            className="min-h-[2.75rem] resize-none rounded-2xl"
          />
          <Button className="rounded-full" disabled={sending || (!text.trim() && !attachments.length)} onClick={send}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}