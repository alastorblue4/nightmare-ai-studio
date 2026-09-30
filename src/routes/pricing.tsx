import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Info } from "lucide-react";
import { toast } from "sonner";

import { SiteFooter, SiteNav } from "@/components/site-nav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing & credits — Nightmare AI" },
      {
        name: "description",
        content: "Free daily credits plus optional credit packs for heavier Nightmare AI generation runs.",
      },
      { property: "og:title", content: "Nightmare AI pricing" },
      { property: "og:description", content: "5 free credits a day, with optional credit packs." },
    ],
  }),
  component: Pricing,
});

type Pack = { id: string; name: string; credits: number; price: number };

function Pricing() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key, value").in("key", ["credits", "pricing"]);
      if (error) throw error;
      const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value as Record<string, unknown>]));
      return {
        credits: (map["credits"] ?? {}) as { daily_free_credits?: number; image_cost?: number; video_cost?: number },
        pricing: (map["pricing"] ?? {}) as { currency?: string; packs?: Pack[]; payments_enabled?: boolean },
      };
    },
  });

  const packs = data?.pricing.packs ?? [];
  const paymentsEnabled = data?.pricing.payments_enabled ?? false;
  const currency = data?.pricing.currency ?? "USD";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
        <div className="text-center">
          <Badge variant="outline" className="border-neon/40 bg-neon/10 text-neon">
            Credits
          </Badge>
          <h1 className="mt-4 text-4xl font-bold">Simple credits, no surprises</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Everyone gets {data?.credits.daily_free_credits ?? 5} free credits per day. Images cost{" "}
            {data?.credits.image_cost ?? 1} credit, videos cost {data?.credits.video_cost ?? 3}. Costs are set by the
            site owner and can change.
          </p>
        </div>

        {!paymentsEnabled ? (
          <Alert className="mx-auto mt-8 max-w-3xl border-primary/40 bg-primary/10">
            <Info className="h-4 w-4" />
            <AlertTitle>Checkout is not live yet</AlertTitle>
            <AlertDescription>
              No payment provider is connected, so credit packs can be viewed but not purchased. Nothing will be
              charged.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {isLoading
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)
            : packs.map((pack, index) => (
                <Card key={pack.id} className={`panel border-0 ${index === 1 ? "glow-primary" : ""}`}>
                  <CardHeader>
                    {index === 1 ? (
                      <Badge className="w-fit bg-brand-gradient text-primary-foreground">Most popular</Badge>
                    ) : null}
                    <CardTitle className="mt-2 text-2xl">{pack.name}</CardTitle>
                    <CardDescription>{pack.credits} credits, never expiring</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-4xl font-bold">
                      {currency === "USD" ? "$" : ""}
                      {pack.price}
                    </p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 text-neon" /> {pack.credits} image generations
                      </li>
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 text-neon" /> Stacks on top of daily free credits
                      </li>
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 text-neon" /> Full generation history
                      </li>
                    </ul>
                    <Button
                      className="w-full"
                      variant={index === 1 ? "default" : "outline"}
                      disabled={!paymentsEnabled}
                      onClick={() =>
                        paymentsEnabled
                          ? undefined
                          : toast.info("Payments are not connected yet — no checkout is available.")
                      }
                    >
                      {paymentsEnabled ? "Buy credits" : "Coming soon"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          <p>
            Site owners and admins have unlimited credits and are never charged.{" "}
            <Link to="/account" className="text-neon underline-offset-4 hover:underline">
              Manage your account
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
