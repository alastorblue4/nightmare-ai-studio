import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Film, ImageIcon } from "lucide-react";
import { z } from "zod";

import { SiteFooter, SiteNav } from "@/components/site-nav";
import { CreditsBar } from "@/components/studio/credits-bar";
import { ImageToVideoPanel } from "@/components/studio/image-to-video-panel";
import { TextToImagePanel } from "@/components/studio/text-to-image-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCreditStatus } from "@/lib/generation.functions";
import type { CreditStatus } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: z.object({ mode: z.enum(["image", "video"]).optional(), prompt: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Creator Studio — Nightmare AI" },
      { name: "description", content: "Generate images from text and videos from images in the Nightmare AI studio." },
      { property: "og:title", content: "Creator Studio — Nightmare AI" },
      { property: "og:description", content: "Text → Image and Image → Video generation studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { mode, prompt } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const fetchCredits = useServerFn(getCreditStatus);
  const credits = useQuery({ queryKey: ["credits"], queryFn: () => fetchCredits() });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["credits"] });
    qc.invalidateQueries({ queryKey: ["generations"] });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">Creator <span className="text-brand-gradient">Studio</span></h1>
          <p className="mt-1 text-muted-foreground">Pick a mode, describe your vision, and generate.</p>
        </div>
        <CreditsBar
          loading={credits.isLoading}
          status={credits.data?.status as unknown as CreditStatus | undefined}
          costs={credits.data?.costs}
        />
        <Tabs value={mode ?? "image"} onValueChange={(v) => navigate({ search: { mode: v as "image" | "video" } })}>
          <TabsList className="grid h-auto w-full grid-cols-2 p-1 md:w-96">
            <TabsTrigger value="image" className="gap-2 py-2"><ImageIcon className="h-4 w-4" />Text → Image</TabsTrigger>
            <TabsTrigger value="video" className="gap-2 py-2"><Film className="h-4 w-4" />Image → Video</TabsTrigger>
          </TabsList>
          <TabsContent value="image" className="mt-6"><TextToImagePanel onComplete={refresh} initialPrompt={prompt} /></TabsContent>
          <TabsContent value="video" className="mt-6"><ImageToVideoPanel onComplete={refresh} /></TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}
