import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { MatureSettingsCard } from "@/components/mature-content";
import { OwnerSetupCard } from "@/components/owner-setup-card";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { CreditsBar } from "@/components/studio/credits-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRoles, useSession } from "@/hooks/use-session";
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
  const fetchCredits = useServerFn(getCreditStatus);
  const credits = useQuery({ queryKey: ["credits"], queryFn: () => fetchCredits() });

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
        <MatureSettingsCard />
        <OwnerSetupCard />
      </main>
      <SiteFooter />
    </div>
  );
}
