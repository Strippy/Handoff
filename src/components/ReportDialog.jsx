import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { REPORT_REASONS } from '@/lib/marketplace';
import { Flag, Loader2 } from 'lucide-react';

export default function ReportDialog({ targetType, targetId, targetLabel, user, profile }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setSending(true);
    await base44.entities.Report.create({
      reporter_id: user?.id || '',
      reporter_name: profile?.display_name || user?.full_name || 'A builder',
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      reason,
      details: details.trim(),
      status: 'open',
    });
    setSending(false);
    setDone(true);
    setDetails('');
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setDone(false); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-full text-xs text-muted-foreground hover:text-destructive">
          <Flag className="mr-1.5 h-3.5 w-3.5" /> Report
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Report this {targetType}</DialogTitle>
          <DialogDescription>
            A moderator reviews every report. Tell us what looks wrong with “{targetLabel}”.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <p className="rounded-2xl border border-border/70 bg-secondary/50 p-4 text-sm text-muted-foreground">
            Thanks — that's with the moderators now. Reports are never shown to the other person.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">What's wrong?</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Anything else (optional)</Label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                className="rounded-2xl"
                placeholder="Links, screenshots, what happened…"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button className="rounded-full" onClick={() => setOpen(false)}>
              Close
            </Button>
          ) : (
            <Button className="rounded-full px-6" disabled={sending} onClick={submit}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send report
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}