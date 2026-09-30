import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { SiteFooter, SiteNav } from "@/components/site-nav";
import { CreditsBar } from "@/components/studio/credits-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoles, useSession } from "@/hooks/use-session";
import { claimOwnerRole, ownerSetupState } from "@/lib/admin.functions";
import { getCreditStatus } from "@/lib/generation.functions";
import type { CreditStatus } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — Nightmare AI" },
      { name: "description", content: "Manage your Nightmare AI account and credits." },
      { property: "og:title", content: "Account — Nightmare AI" },
      { property: "og:description", content: "Your profile, roles and daily credits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Account,
});

function Account() {
  const { user } = useSession();
  const roles = useRoles(user?.id);
  const qc = useQueryClient();
  const fetchCredits = useServerFn(getCreditStatus);
  const fetchOwner = useServerFn(ownerSetupState);
  const claim = useServerFn(claimOwnerRole);
  const credits = useQuery({ queryKey: ["credits"], queryFn: () => fetchCredits() });
  const owner = useQuery({ queryKey: ["owner-setup"], queryFn: () => fetchOwner() });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function onClaim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await claim({ data: { token } });
      if (res.ok) {
        toast.success(res.message);
        qc.invalidateQueries();
      } else toast.error(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim owner role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <h1 className="font-display text-3xl font-bold">Account</h1>
        <section className="panel space-y-2 rounded-2xl p-6">
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="text-lg font-semibold">{user?.email}</p>
          <div className="flex gap-2">
            {(roles.data?.roles ?? []).map((r) => <Badge key={r} variant="outline" className="capitalize">{r}</Badge>)}
          </div>
        </section>
        <CreditsBar loading={credits.isLoading} status={credits.data?.status as unknown as CreditStatus | undefined} costs={credits.data?.costs} />
        <Button asChild variant="outline"><Link to="/pricing">Get more credits</Link></Button>
        {owner.data && !owner.data.ownerExists && (
          <section className="panel rounded-2xl p-6">
            <h2 className="font-display text-xl font-semibold">Claim site ownership</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {owner.data.tokenConfigured
                ? "Enter the owner setup token configured for this site."
                : "Owner setup isn't configured yet. The site operator must add an owner setup token first."}
            </p>
            <form onSubmit={onClaim} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="token">Setup token</Label>
                <Input id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)} disabled={!owner.data.tokenConfigured} />
              </div>
              <Button type="submit" disabled={busy || token.length < 8 || !owner.data.tokenConfigured}>Claim</Button>
            </form>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
