import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { SiteFooter, SiteNav } from "@/components/site-nav";
import { ResultCard } from "@/components/studio/result-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import type { Generation } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Gallery — Nightmare AI" },
      { name: "description", content: "Browse your Nightmare AI image and video generation history." },
      { property: "og:title", content: "Gallery — Nightmare AI" },
      { property: "og:description", content: "Your generated images and videos in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: History,
});

type Filter = "all" | "image" | "video";

function History() {
  const [filter, setFilter] = useState<Filter>("all");
  const navigate = Route.useNavigate();
  const q = useQuery({
    queryKey: ["generations", filter],
    queryFn: async () => {
      let query = supabase.from("generations").select("*").order("created_at", { ascending: false }).limit(100);
      if (filter !== "all") query = query.eq("kind", filter);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Generation[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Gallery</h1>
            <p className="text-muted-foreground">Everything you've generated.</p>
          </div>
          <div className="flex gap-2" role="group" aria-label="Filter">
            {(["all", "image", "video"] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} aria-pressed={filter === f}>
                {f === "all" ? "All" : f === "image" ? "Images" : "Videos"}
              </Button>
            ))}
          </div>
        </div>
        {q.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
        ) : q.error ? (
          <p className="text-destructive">Couldn't load your gallery. Please refresh.</p>
        ) : !q.data?.length ? (
          <div className="panel rounded-2xl p-10 text-center">
            <p className="text-lg font-semibold">Nothing here yet</p>
            <p className="mb-4 text-muted-foreground">Your creations will show up here.</p>
            <Button asChild><Link to="/dashboard">Start creating</Link></Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {q.data.map((g) => (
              <ResultCard
                key={g.id}
                generation={g}
                onReuse={(gen) => navigate({ to: "/dashboard", search: { mode: gen.kind, prompt: gen.prompt } })}
              />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
