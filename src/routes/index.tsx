import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Film, Gauge, ImageIcon, Lock, ShieldCheck, Sparkles, Wand2 } from "lucide-react";

import heroImage from "@/assets/hero.jpg";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nightmare AI — Text to Image & Image to Video Studio" },
      {
        name: "description",
        content:
          "Nightmare AI turns prompts into striking images and still frames into motion. 5 free generation credits every day, no setup required.",
      },
      { property: "og:title", content: "Nightmare AI — Creative generation studio" },
      {
        property: "og:description",
        content: "Text to image and image to video in one dark, fast, arcade-inspired studio.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: ImageIcon,
    title: "Text → Image",
    description:
      "Write a prompt, steer it with a negative prompt, pick 1:1, 16:9 or 9:16, choose quality and batch size. Download every frame.",
    accent: "primary" as const,
  },
  {
    icon: Film,
    title: "Image → Video",
    description:
      "Drop a reference image, describe the motion, set duration and quality, and get a clip back with a built-in player.",
    accent: "neon" as const,
  },
];

const steps = [
  { icon: Wand2, title: "Describe it", body: "Prompt, negative prompt, aspect ratio, quality." },
  { icon: Gauge, title: "Generate", body: "Live progress, queued job history, instant retries." },
  { icon: Sparkles, title: "Keep it", body: "Save, download and reuse any prompt from your gallery." },
];

function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-hero">
          <div className="absolute inset-0 grid-noise opacity-60" aria-hidden="true" />
          <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-28">
            <div>
              <Badge variant="outline" className="border-neon/40 bg-neon/10 text-neon">
                5 free credits every day
              </Badge>
              <h1 className="mt-5 text-4xl font-bold leading-[1.05] sm:text-6xl">
                <span className="text-brand-gradient">Nightmare AI</span>
                <br />
                generation studio
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                A dark, fast creative arcade for turning words into images and images into motion. Built for
                creators who want control — prompts, negatives, ratios, quality and history all in one place.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-brand-gradient font-semibold text-primary-foreground glow-primary hover:opacity-90"
                >
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Start Creating <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/pricing">See pricing</Link>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                No card required. Demo mode is clearly labelled until a generation provider is connected.
              </p>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-3xl border border-border glow-primary">
                <img
                  src={heroImage}
                  alt="Neon purple and green portal over a retro grid horizon"
                  width={1600}
                  height={1008}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold">Two modes. One studio.</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Switch between still generation and motion without leaving the dashboard.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className={`panel border-0 transition-shadow ${feature.accent === "neon" ? "hover:glow-neon" : "hover:glow-primary"}`}
              >
                <CardHeader>
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                      feature.accent === "neon" ? "bg-neon/15 text-neon" : "bg-primary/20 text-primary"
                    }`}
                  >
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="mt-3 text-xl">{feature.title}</CardTitle>
                  <CardDescription className="text-base">{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.title} className="rounded-2xl border border-border bg-surface p-5">
                <step.icon className="h-5 w-5 text-neon" />
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Accounts + credits */}
        <section className="border-y border-border bg-surface/40">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <h2 className="text-3xl font-bold">Accounts &amp; credits</h2>
              <p className="mt-3 text-muted-foreground">
                Every generation spends credits. The cost per job type is configurable by the site owner, so
                video can cost more than an image.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
              <Card className="panel border-0">
                <CardHeader>
                  <CardTitle className="text-lg">Free daily allowance</CardTitle>
                  <CardDescription>
                    Every account gets 5 generation credits per day, reset automatically at midnight UTC.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Images cost 1 credit by default, videos cost 3.
                </CardContent>
              </Card>
              <Card className="panel border-0">
                <CardHeader>
                  <CardTitle className="text-lg">Need more?</CardTitle>
                  <CardDescription>
                    Credit packs are listed on the pricing page. Checkout activates once a payment provider is
                    connected — nothing is charged before then.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/pricing">View credit packs</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Safety */}
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <ShieldCheck className="h-5 w-5 text-neon" />
              <h3 className="mt-3 text-lg font-semibold">Responsible by default</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Prompts pass through moderation hooks, and anyone can report a generation. Illegal content is
                not permitted here.
              </p>
              <Button asChild variant="link" className="mt-2 h-auto p-0 text-neon">
                <Link to="/report">Report content</Link>
              </Button>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6">
              <Lock className="h-5 w-5 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">Your work stays yours</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Generations are private to your account. Only you — and the site owner for moderation — can see
                them.
              </p>
              <Button asChild variant="link" className="mt-2 h-auto p-0 text-primary">
                <Link to="/privacy">Read the privacy notice</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
