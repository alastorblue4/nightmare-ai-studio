import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Crown, KeyRound, Loader2, ShieldCheck, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimOwnerRole, ownerSetupState } from "@/lib/admin.functions";

const SECRET_NAME = "OWNER_SETUP_TOKEN";

export function OwnerSetupCard() {
  const qc = useQueryClient();
  const fetchState = useServerFn(ownerSetupState);
  const claim = useServerFn(claimOwnerRole);
  const state = useQuery({ queryKey: ["owner-setup"], queryFn: () => fetchState() });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyName() {
    try {
      await navigator.clipboard.writeText(SECRET_NAME);
      setCopied(true);
      toast.success("Secret name copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select the name and copy it manually.");
    }
  }

  async function onClaim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await claim({ data: { token } });
      if (res.ok) {
        toast.success(res.message);
        setToken("");
        await qc.invalidateQueries();
      } else {
        setError(res.message);
        toast.error(res.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not claim owner role";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (state.isLoading) {
    return (
      <section className="panel flex items-center gap-3 rounded-2xl p-6 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking site owner setup…
      </section>
    );
  }
  if (state.isError || !state.data) {
    return (
      <section className="panel rounded-2xl p-6 text-sm text-destructive">
        Could not load owner setup status. Refresh the page to try again.
      </section>
    );
  }

  const { ownerExists, isCurrentUserOwner, tokenConfigured } = state.data;

  const header = (label: string, variant: "neon" | "muted" | "primary") => (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
        <Crown className="h-5 w-5 text-primary" /> Site Owner Setup
      </h2>
      <Badge
        variant="outline"
        className={
          variant === "neon" ? "border-neon/50 text-neon" : variant === "primary" ? "border-primary/50 text-primary" : "text-muted-foreground"
        }
      >
        {label}
      </Badge>
    </div>
  );

  if (isCurrentUserOwner) {
    return (
      <section className="panel glow-neon rounded-2xl p-6">
        {header("You are the owner", "neon")}
        <p className="mb-4 text-sm text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-4 w-4 text-neon" />
          Your account owns this site. You have unlimited site credits and full access to the Admin dashboard.
        </p>
        <Button asChild className="glow-primary"><Link to="/admin">Open Admin Dashboard</Link></Button>
      </section>
    );
  }

  if (ownerExists) {
    return (
      <section className="panel rounded-2xl p-6">
        {header("Owner already set", "muted")}
        <p className="text-sm text-muted-foreground">
          This site already has an owner, so ownership can't be claimed again. If you need admin access, ask the owner to grant it from the Admin dashboard.
        </p>
      </section>
    );
  }

  if (!tokenConfigured) {
    return (
      <section className="panel rounded-2xl p-6">
        {header("Not configured", "muted")}
        <p className="mb-4 text-sm text-muted-foreground">
          The <strong className="text-foreground">setup token</strong> is a secret password you choose yourself. It's stored privately as a project secret, never in the website code. Once it's saved, come back here and enter it to become the site owner.
        </p>
        <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm">
          <li>In Lovable, open <strong>Project Settings → Secrets</strong>.</li>
          <li>
            Add a new secret with this exact name:
            <span className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm">
              {SECRET_NAME}
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={copyName} aria-label="Copy secret name">
                {copied ? <Check className="h-4 w-4 text-neon" /> : <Copy className="h-4 w-4" />}
              </Button>
            </span>
          </li>
          <li>For the value, use a long private random string (at least 20 characters, mixing letters and numbers).</li>
          <li>Save it, then refresh this page.</li>
        </ol>
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          Keep the value private. Don't post it publicly or share it. Anyone who has it could claim ownership before you do.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => state.refetch()} disabled={state.isFetching}>
          {state.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} I've added it — check again
        </Button>
      </section>
    );
  }

  return (
    <section className="panel glow-primary rounded-2xl p-6">
      {header("Ready to claim", "primary")}
      <p className="mb-2 text-sm text-muted-foreground">
        Enter the setup token you saved as the <code className="font-mono text-foreground">{SECRET_NAME}</code> project secret.
      </p>
      <p className="mb-4 text-sm">
        Claiming ownership gives this account <strong className="text-neon">unlimited site credits</strong> and access to the <strong>Admin dashboard</strong>. It can only be done once.
      </p>
      <form onSubmit={onClaim} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="owner-token" className="flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" /> Setup token</Label>
          <Input
            id="owner-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => { setToken(e.target.value); setError(null); }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "owner-token-error" : undefined}
          />
        </div>
        <Button type="submit" disabled={busy || token.length < 8}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Claiming…</> : "Claim Owner"}
        </Button>
      </form>
      {error && <p id="owner-token-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
