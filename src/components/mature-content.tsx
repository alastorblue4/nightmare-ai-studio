import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { confirmAdult, getMatureSettings, setMatureMode } from "@/lib/generation.functions";

export function useMatureSettings() {
  const fetchSettings = useServerFn(getMatureSettings);
  return useQuery({ queryKey: ["mature-settings"], queryFn: () => fetchSettings() });
}

export function MatureBadge({ className = "" }: { className?: string }) {
  return (
    <Badge variant="outline" className={`border-destructive/60 bg-destructive/10 font-bold text-destructive ${className}`}>
      18+ Mature
    </Badge>
  );
}

export function ProhibitedContentNotice() {
  return (
    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
      <li>Explicit sexual or pornographic content is not supported, even in Mature mode.</li>
      <li>Any sexual or suggestive content involving minors or young-looking people is strictly prohibited.</li>
      <li>Non-consensual sexual content and sexual imagery of real people without consent are prohibited.</li>
      <li>Illegal content and attempts to bypass site or provider safety filters are prohibited.</li>
    </ul>
  );
}

function AgeGateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const confirm = useServerFn(confirmAdult);
  const toggle = useServerFn(setMatureMode);
  const [checked, setChecked] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      await confirm({ data: { confirmed: true } });
      await toggle({ data: { enabled: true } });
    },
    onSuccess: () => {
      toast.success("Mature Content turned on");
      qc.invalidateQueries({ queryKey: ["mature-settings"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" /> Adults only (18+)
          </DialogTitle>
          <DialogDescription>
            Mature Content allows non-explicit adult themes such as romance, pin-up styles and revealing outfits,
            subject to our rules and the AI provider's own safety filters.
          </DialogDescription>
        </DialogHeader>
        <ProhibitedContentNotice />
        <div className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3">
          <Checkbox id="adult-confirm" checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          <Label htmlFor="adult-confirm" className="text-sm leading-snug">
            I am 18 or older, and I agree to the{" "}
            <Link to="/terms" className="text-primary underline">Terms of Use</Link>.
          </Label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!checked || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Confirm & turn on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MatureSettingsCard() {
  const qc = useQueryClient();
  const settings = useMatureSettings();
  const toggle = useServerFn(setMatureMode);
  const [gateOpen, setGateOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => toggle({ data: { enabled } }),
    onSuccess: (r) => {
      toast.success(r.enabled ? "Mature Content turned on" : "Mature Content turned off");
      qc.invalidateQueries({ queryKey: ["mature-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  const enabled = settings.data?.matureEnabled ?? false;

  function onChange(next: boolean) {
    if (next && !settings.data?.adultConfirmed) return setGateOpen(true);
    mutation.mutate(next);
  }

  return (
    <section className="panel space-y-4 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            Mature Content <MatureBadge />
          </h2>
          <p className="text-sm text-muted-foreground">
            Off by default. When on, you can mark generations as Mature for non-explicit adult themes. Mature
            results stay private to your account and are labelled 18+.
          </p>
        </div>
        <Switch
          aria-label="Mature Content"
          checked={enabled}
          disabled={settings.isLoading || mutation.isPending}
          onCheckedChange={onChange}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {settings.data?.adultConfirmed ? "You've confirmed you are 18 or older." : "Requires confirming you are 18 or older."}
      </p>
      <ProhibitedContentNotice />
      <AgeGateDialog open={gateOpen} onOpenChange={setGateOpen} />
    </section>
  );
}

/** Per-job "Mature" toggle for the studio; only rendered for opted-in adults. */
export function MatureJobToggle({ value, onChange, id }: { value: boolean; onChange: (v: boolean) => void; id: string }) {
  const settings = useMatureSettings();
  if (!settings.data?.matureEnabled) return null;
  return (
    <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="flex items-center gap-2">
          Mature job <MatureBadge />
        </Label>
        <Switch id={id} checked={value} onCheckedChange={onChange} />
      </div>
      <p className="text-xs text-muted-foreground">
        Non-explicit adult themes only. Explicit content, minors or young-looking people, and non-consensual
        themes are blocked. Result stays private.
      </p>
    </div>
  );
}
